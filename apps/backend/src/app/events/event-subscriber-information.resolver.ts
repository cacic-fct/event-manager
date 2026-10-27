import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Args, Context, Field, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { type GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';
import {
  EVENT_INFORMATION_QUEUE,
  eventSubscriberWhere,
  type EventInformationJob,
} from './event-subscriber-information';
import { buildBullMqJobId } from '../queues/bullmq-job-id';

const FAILED_NOTIFICATION_RETRY_COOLDOWN_MS = 5 * 60_000;

@ObjectType()
export class EventSubscriberInformation {
  @Field(() => String, { nullable: true })
  content!: string | null;
  @Field(() => Date, { nullable: true })
  updatedAt!: Date | null;
}

@ObjectType()
export class PublishedEventSubscriberInformation extends EventSubscriberInformation {
  @Field(() => String)
  eventId!: string;
}

@Resolver()
export class EventSubscriberInformationResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserContextService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly frozen: FrozenResourceService,
    private readonly audit: AuditLogService,
    @InjectQueue(EVENT_INFORMATION_QUEUE) private readonly queue: Queue<EventInformationJob>,
  ) {}

  @Query(() => EventSubscriberInformation, { nullable: true })
  @RequirePermissions(Permission.Event.Read)
  async eventSubscriberInformation(
    @Args('eventId') eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<EventSubscriberInformation> {
    await this.authorization.assertPermissions(
      this.currentUser.getAuthenticatedUser(context),
      [Permission.Event.Read],
      { eventId },
    );
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { subscriberInformation: true, subscriberInformationUpdatedAt: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    return { content: event.subscriberInformation, updatedAt: event.subscriberInformationUpdatedAt };
  }

  @Query(() => EventSubscriberInformation, { nullable: true })
  async currentUserEventSubscriberInformation(
    @Args('eventId') eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<EventSubscriberInformation | null> {
    const person = await this.currentUser.requireCurrentPerson(context);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, AND: [PUBLIC_EVENT_WHERE, eventSubscriberWhere(person.id)] },
      select: { subscriberInformation: true, subscriberInformationUpdatedAt: true },
    });
    return event ? { content: event.subscriberInformation, updatedAt: event.subscriberInformationUpdatedAt } : null;
  }

  @Query(() => [PublishedEventSubscriberInformation])
  async currentUserEventSubscriberInformationList(
    @Args('eventIds', { type: () => [String] }) eventIds: string[],
    @Context() context: GraphqlContext,
  ): Promise<PublishedEventSubscriberInformation[]> {
    if (eventIds.length > 1000) throw new BadRequestException('Selecione até 1.000 eventos.');
    const person = await this.currentUser.requireCurrentPerson(context);
    const events = await this.prisma.event.findMany({
      where: {
        id: { in: [...new Set(eventIds)] },
        AND: [PUBLIC_EVENT_WHERE, eventSubscriberWhere(person.id)],
        subscriberInformation: { not: null },
      },
      select: { id: true, subscriberInformation: true, subscriberInformationUpdatedAt: true },
      take: 1000,
    });
    return events.map((event) => ({
      eventId: event.id,
      content: event.subscriberInformation,
      updatedAt: event.subscriberInformationUpdatedAt,
    }));
  }

  @Mutation(() => EventSubscriberInformation)
  @RequirePermissions(Permission.Event.Update)
  async updateEventSubscriberInformation(
    @Args('eventId') eventId: string,
    @Args('content', { type: () => String, nullable: true }) content: string | null,
    @Args('notifySubscribers', { defaultValue: false }) notifySubscribers: boolean,
    @Context() context: GraphqlContext,
  ): Promise<EventSubscriberInformation> {
    const user = this.currentUser.getAuthenticatedUser(context);
    await this.authorization.assertPermissions(user, [Permission.Event.Update], { eventId });
    await this.frozen.assertEventUpdateMutable(eventId, {}, user);
    if (content != null && content.length > 10000) {
      throw new BadRequestException('As informações devem ter até 10.000 caracteres.');
    }
    const normalized = content?.trim() || null;
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT "id" FROM "events" WHERE "id" = ${eventId} AND "deletedAt" IS NULL FOR UPDATE`;
      const previous = await tx.event.findFirst({
        where: { id: eventId, deletedAt: null },
        select: {
          name: true,
          publicationState: true,
          subscriberInformation: true,
          subscriberInformationUpdatedAt: true,
        },
      });
      if (!previous) throw new NotFoundException('Evento não encontrado.');
      if (notifySubscribers && normalized && previous.publicationState !== 'PUBLISHED') {
        throw new BadRequestException('Publique o evento antes de notificar os inscritos.');
      }
      if (previous.subscriberInformation === normalized) return previous;
      const previousRevision = previous.subscriberInformationUpdatedAt?.getTime() ?? 0;
      const updatedAt = new Date(Math.max(Date.now(), previousRevision + 1));
      const event = await tx.event.update({
        where: { id: eventId },
        data: {
          subscriberInformation: normalized,
          subscriberInformationUpdatedAt: updatedAt,
          updatedById: user.sub,
        },
        select: {
          name: true,
          publicationState: true,
          subscriberInformation: true,
          subscriberInformationUpdatedAt: true,
        },
      });
      await this.audit.record(
        {
          entityType: AuditLogEntityType.EVENT,
          entityId: eventId,
          entityLabel: event.name,
          operation: AuditLogOperation.UPDATE,
          actor: user,
          before: { subscriberInformation: previous.subscriberInformation },
          after: { subscriberInformation: normalized },
          scope: { permission: Permission.Event.Update, eventId },
          summary: 'Informações para inscritos atualizadas.',
          metadata: { notifySubscribers },
        },
        tx,
      );
      return event;
    });
    if (notifySubscribers && normalized && saved.subscriberInformationUpdatedAt) {
      const revision = saved.subscriberInformationUpdatedAt.toISOString();
      await this.enqueueNotification(eventId, revision);
    }
    return { content: saved.subscriberInformation, updatedAt: saved.subscriberInformationUpdatedAt };
  }

  private async enqueueNotification(eventId: string, revision: string): Promise<void> {
    const jobId = buildBullMqJobId('event-information', eventId, revision);
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      if ((await existing.getState()) !== 'failed') return;
      if (!existing.finishedOn || Date.now() - existing.finishedOn < FAILED_NOTIFICATION_RETRY_COOLDOWN_MS) {
        throw new BadRequestException('Aguarde cinco minutos após a última falha antes de tentar notificar novamente.');
      }
      // Only this explicit request retries a retained failure. Preserve attemptsMade
      // so an exhausted job receives one attempt, not another automatic retry cycle.
      try {
        await existing.retry('failed');
      } catch {
        throw new ConflictException(
          'Não foi possível reagendar o aviso. Aguarde e consulte novamente antes de tentar.',
        );
      }
      return;
    }
    await this.queue.add(
      'notify',
      { eventId, revision },
      {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
      },
    );
  }
}
