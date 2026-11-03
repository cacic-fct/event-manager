import { MAX_EVENT_NOTIFICATION_LENGTH } from '@cacic-fct/shared-event-preparation';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditLogActorType, AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { type GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES } from './attendance-eligibility';
import { EVENT_MANUAL_NOTIFICATION_QUEUE, type EventManualNotificationJob } from './event-manual-notification';

@Resolver()
export class EventManualNotificationResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUser: CurrentUserContextService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly frozen: FrozenResourceService,
    private readonly audit: AuditLogService,
    @InjectQueue(EVENT_MANUAL_NOTIFICATION_QUEUE) private readonly queue: Queue<EventManualNotificationJob>,
  ) {}

  @Mutation(() => Boolean)
  @RequirePermissions(Permission.Event.Update)
  async notifyEventParticipants(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('audience', { type: () => String }) audience: string,
    @Args('message', { type: () => String }) message: string,
    @Args('requestId', { type: () => String }) requestId: string,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const user = this.currentUser.getAuthenticatedUser(context);
    await this.authorization.assertPermissions(user, [Permission.Event.Update], { eventId });
    await this.frozen.assertEventUpdateMutable(eventId, {}, user);
    if (audience !== 'LECTURERS' && audience !== 'SUBSCRIBERS')
      throw new BadRequestException('Público do aviso inválido.');
    const content = message.trim();
    if (!content || content.length > MAX_EVENT_NOTIFICATION_LENGTH)
      throw new BadRequestException('Escreva um aviso de até 2.000 caracteres.');
    if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw new BadRequestException('Identificador do aviso inválido.');
    if (!user.sub) throw new BadRequestException('Identifique o responsável pelo aviso.');
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { name: true, majorEventId: true, autoSubscribe: true, publicationState: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (audience === 'SUBSCRIBERS' && event.publicationState !== 'PUBLISHED')
      throw new BadRequestException('Publique o evento antes de avisar os inscritos.');
    const jobId = `manual-${requestId}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      if (
        existing.data.audience !== audience ||
        existing.data.eventId !== eventId ||
        existing.data.message !== content ||
        existing.data.actor.id !== user.sub
      ) {
        throw new ConflictException('O identificador do aviso já foi usado.');
      }
      if ((await existing.getState()) === 'failed') {
        throw new ConflictException(
          'Este aviso falhou. Confira o histórico e envie um novo aviso para tentar novamente.',
        );
      }
      return true;
    }
    const people = await this.prisma.people.findMany({
      where: {
        deletedAt: null,
        mergedIntoId: null,
        userId: { not: null },
        ...(audience === 'LECTURERS'
          ? { lectures: { some: { eventId } } }
          : {
              OR: [
                { eventSubscriptions: { some: { eventId, deletedAt: null } } },
                ...(event.majorEventId
                  ? [
                      {
                        majorEventSubscriptions: {
                          some: {
                            majorEventId: event.majorEventId,
                            deletedAt: null,
                            subscriptionStatus: { in: [...ACTIVE_MAJOR_EVENT_REGISTRATION_STATUSES] },
                            ...(event.autoSubscribe ? {} : { selectedEvents: { some: { eventId, deletedAt: null } } }),
                          },
                        },
                      },
                    ]
                  : []),
              ],
            }),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 10001,
    });
    if (!people.length) throw new BadRequestException('Nenhuma pessoa com conta vinculada pode receber este aviso.');
    if (people.length > 10000) throw new BadRequestException('Envie avisos para até 10.000 pessoas por evento.');
    const data: EventManualNotificationJob = {
      audience,
      eventId,
      requestId,
      message: content,
      personIds: people.map((person) => person.id),
      actor: { id: user.sub, name: user.preferredUsername ?? user.email ?? user.sub, type: AuditLogActorType.USER },
    };
    const audit = (summary: string, status: string) =>
      this.audit.record({
        entityType: AuditLogEntityType.EVENT,
        entityId: eventId,
        entityLabel: event.name,
        operation: AuditLogOperation.SUBMIT,
        actor: user,
        force: true,
        squashWindowMs: 0,
        summary,
        scope: { permission: Permission.Event.Update, eventId },
        metadata: {
          category: 'manual-event-notification',
          audience,
          requestId,
          message: content,
          personIds: data.personIds,
          status,
        },
      });
    // Record intent before any external side effect. Never log authentication tokens in jobs.
    await audit('Envio de aviso manual solicitado.', 'REQUESTED');
    try {
      await this.queue.add('notify', data, {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
      });
    } catch (error) {
      await audit('Falha ao agendar aviso manual.', 'QUEUE_FAILED');
      throw error;
    }
    return true;
  }
}
