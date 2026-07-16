import {
  DeletionResult,
  EventLecturer,
  EventLecturerCreateInput,
  EventLecturerUpdateInput,
} from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

type EnsureLecturerProfilePrismaClient = Pick<Prisma.TransactionClient, 'people' | 'lecturerProfile'>;

const MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  description: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  maxCoursesPerAttendee: true,
  maxLecturesPerAttendee: true,
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  isPaymentRequired: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  additionalPaymentInfo: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.MajorEventSelect;

const EVENT_GROUP_SELECT = {
  id: true,
  name: true,
  shouldIssueCertificateForEachEvent: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  shouldIssuePartialCertificate: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventGroupSelect;

const EVENT_RELATION_SELECT = {
  id: true,
  name: true,
  creditMinutes: true,
  startDate: true,
  endDate: true,
  type: true,
  emoji: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  majorEventId: true,
  majorEvent: {
    select: MAJOR_EVENT_SELECT,
  },
  eventGroupId: true,
  eventGroup: {
    select: EVENT_GROUP_SELECT,
  },
  allowSubscription: true,
  slots: true,
  shouldIssueCertificate: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: true,
  onlineAttendanceCode: true,
  onlineAttendanceStartDate: true,
  onlineAttendanceEndDate: true,
  publiclyVisible: true,
  youtubeCode: true,
  buttonText: true,
  buttonLink: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventSelect;

@Resolver(() => EventLecturer)
export class EventLecturersResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly frozenResources: FrozenResourceService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly auditLog: AuditLogService = { record: async () => undefined } as unknown as AuditLogService,
  ) {}

  @Query(() => [EventLecturer], { name: 'eventLecturers' })
  @RequirePermissions(Permission.EventLecturer.Read)
  eventLecturers(
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('personId', { type: () => String, nullable: true }) personId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const where: Prisma.EventLecturerWhereInput = {};

    if (eventId) {
      where.eventId = eventId;
    }

    if (personId) {
      where.personId = personId;
    }

    return this.prisma.eventLecturer.findMany({
      where,
      select: {
        eventId: true,
        personId: true,
        createdAt: true,
        createdById: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  @Query(() => EventLecturer, { name: 'eventLecturer' })
  @RequirePermissions(Permission.EventLecturer.Read)
  async eventLecturer(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
  ) {
    const eventLecturer = await this.prisma.eventLecturer.findUnique({
      where: {
        eventId_personId: {
          eventId,
          personId,
        },
      },
      select: {
        eventId: true,
        personId: true,
        createdAt: true,
        createdById: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
    });

    if (!eventLecturer) {
      throw new NotFoundException(`Event lecturer ${eventId}/${personId} was not found.`);
    }

    return eventLecturer;
  }

  @Mutation(() => EventLecturer, { name: 'createEventLecturer' })
  @RequirePermissions(Permission.EventLecturer.Create)
  async createEventLecturer(
    @Args('input', { type: () => EventLecturerCreateInput })
    input: EventLecturerCreateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
    const actorId = this.getActorId(context);

    return this.prisma.$transaction(async (prisma) => {
      await this.ensureLecturerProfile(input.personId, actorId, prisma);

      const lecturer = await prisma.eventLecturer.create({
        data: {
          eventId: input.eventId,
          personId: input.personId,
          createdById: actorId,
        },
      });
      await this.auditLog.record({
        entityType: AuditLogEntityType.EVENT_LECTURER,
        entityId: `${lecturer.eventId}:${lecturer.personId}`,
        entityLabel: 'Palestrante do evento',
        operation: AuditLogOperation.CREATE,
        actor: this.getUser(context),
        after: lecturer,
        summary: 'Palestrante vinculado ao evento.',
        scope: { permission: Permission.EventLecturer.Create, eventId: lecturer.eventId },
      }, prisma);
      return lecturer;
    });
  }

  @Mutation(() => EventLecturer, { name: 'updateEventLecturer' })
  @RequirePermissions(Permission.EventLecturer.Update)
  async updateEventLecturer(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
    @Args('input', { type: () => EventLecturerUpdateInput })
    input: EventLecturerUpdateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'edit');
    if (input.eventId && input.eventId !== eventId) {
      const user = this.getUser(context);
      await this.frozenResources.assertEventMutable(input.eventId, user, 'edit');
      await this.authorizationPolicy.assertPermissions(user, [Permission.EventLecturer.Update], {
        eventId: input.eventId,
      });
    }
    const nextEventId = input.eventId ?? eventId;
    const nextPersonId = input.personId ?? personId;
    const actorId = this.getActorId(context);
    await this.prisma.$transaction(async (prisma) => {
      const existing = await prisma.eventLecturer.findUnique({
        where: { eventId_personId: { eventId, personId } },
      });
      if (!existing) {
        throw new NotFoundException(`Event lecturer ${eventId}/${personId} was not found.`);
      }
      if (input.personId) {
        await this.ensureLecturerProfile(input.personId, actorId, prisma);
      }

      const { count } = await prisma.eventLecturer.updateMany({
        where: {
          eventId,
          personId,
        },
        data: this.buildEventLecturerUpdateData(input),
      });

      if (count === 0) {
        throw new NotFoundException(`Event lecturer ${eventId}/${personId} was not found.`);
      }
      const updated = await prisma.eventLecturer.findUniqueOrThrow({
        where: { eventId_personId: { eventId: nextEventId, personId: nextPersonId } },
      });
      await this.auditLog.record({
        entityType: AuditLogEntityType.EVENT_LECTURER,
        entityId: `${eventId}:${personId}`,
        entityLabel: 'Palestrante do evento',
        operation: AuditLogOperation.UPDATE,
        actor: this.getUser(context),
        before: existing,
        after: updated,
        summary: 'Vínculo de palestrante atualizado.',
        scope: { permission: Permission.EventLecturer.Update, eventId: nextEventId },
      }, prisma);
    });

    return this.prisma.eventLecturer.findUnique({
      where: {
        eventId_personId: {
          eventId: nextEventId,
          personId: nextPersonId,
        },
      },
      select: {
        eventId: true,
        personId: true,
        createdAt: true,
        createdById: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
    });
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventLecturer' })
  @RequirePermissions(Permission.EventLecturer.Delete)
  async deleteEventLecturer(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('personId', { type: () => String }) personId: string,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'delete');
    await this.prisma.$transaction(async (tx) => {
      const lecturer = await tx.eventLecturer.findUnique({ where: { eventId_personId: { eventId, personId } } });
      if (!lecturer) {
        throw new NotFoundException(`Event lecturer ${eventId}/${personId} was not found.`);
      }
      await tx.eventLecturer.delete({ where: { eventId_personId: { eventId, personId } } });
      await this.auditLog.record({
        entityType: AuditLogEntityType.EVENT_LECTURER,
        entityId: `${eventId}:${personId}`,
        entityLabel: 'Palestrante do evento',
        operation: AuditLogOperation.DELETE,
        actor: this.getUser(context),
        before: lecturer,
        summary: 'Palestrante desvinculado do evento.',
        scope: { permission: Permission.EventLecturer.Delete, eventId },
      }, tx);
    });

    return {
      deleted: true,
      eventId,
      personId,
    };
  }

  private async ensureLecturerProfile(
    personId: string,
    actorId: string | undefined,
    prisma: EnsureLecturerProfilePrismaClient = this.prisma,
  ): Promise<void> {
    const person = await prisma.people.findFirst({
      where: {
        id: personId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!person) {
      throw new NotFoundException(`Person ${personId} was not found.`);
    }

    await prisma.lecturerProfile.upsert({
      where: {
        personId,
      },
      create: {
        personId,
        displayName: person.name,
        publishGoogleUserPicture: false,
        googleUserPicture: null,
        createdById: actorId,
        updatedById: actorId,
      },
      update: {},
      select: {
        id: true,
      },
    });
  }

  private buildEventLecturerUpdateData(input: EventLecturerUpdateInput): Prisma.EventLecturerUncheckedUpdateManyInput {
    const data: Prisma.EventLecturerUncheckedUpdateManyInput = {};

    if (input.eventId !== undefined) data.eventId = input.eventId;
    if (input.personId !== undefined) data.personId = input.personId;

    return data;
  }

  private getActorId(context: GraphqlContext): string | undefined {
    return context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
