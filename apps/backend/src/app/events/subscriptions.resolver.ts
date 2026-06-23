import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma, SubscriptionStatus } from '@prisma/client';
import {
  WorkspaceEventSubscription,
  WorkspaceEventSubscriptionCreateInput,
  WorkspaceMajorEventSubscription,
  WorkspaceMajorEventSubscriptionCreateInput,
  WorkspaceMajorEventSubscriptionUpdateInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import {
  MajorEventSubscriptionNotificationRecord,
  NovuNotificationsService,
} from '../notifications/novu-notifications.service';
import { AttendanceCategoryService } from './attendance-category.service';
import { EventSubscriptionSyncService } from './event-subscription-sync.service';
import { EventSubscriptionCountersService } from './subscription-counters.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

const WORKSPACE_SUBSCRIPTION_READ_SCOPES = [
  Permission.Subscription.Read,
  Permission.Event.Read,
  Permission.MajorEvent.Read,
] as const;

const WORKSPACE_EVENT_SUBSCRIPTION_CREATE_PERMISSIONS = [Permission.Subscription.Create, Permission.Event.Read] as const;

const WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_CREATE_PERMISSIONS = [
  Permission.Subscription.Create,
  Permission.Event.Read,
  Permission.MajorEvent.Read,
] as const;

const WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_UPDATE_PERMISSIONS = [
  Permission.Subscription.Update,
  Permission.Event.Read,
  Permission.MajorEvent.Read,
] as const;

const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  secondaryEmails: true,
  phone: true,
  identityDocument: true,
  academicId: true,
  userId: true,
  user: true,
  mergedIntoId: true,
  externalRef: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.PeopleSelect;

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
  maxUncategorizedPerAttendee: true,
  rankedSubscriptionEnabled: true,
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

const EVENT_SELECT = {
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
  eventGroupId: true,
  allowSubscription: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  slots: true,
  slotsAvailable: true,
  queueCount: true,
  autoSubscribe: true,
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

@Resolver()
export class EventSubscriptionsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly notifications: NovuNotificationsService,
    private readonly frozenResources: FrozenResourceService,
    private readonly auditLog: AuditLogService,
    private readonly counters: EventSubscriptionCountersService = new EventSubscriptionCountersService(),
    private readonly eventSubscriptionSync: EventSubscriptionSyncService = new EventSubscriptionSyncService(),
  ) {}

  @Query(() => [WorkspaceEventSubscription], {
    name: 'workspaceEventSubscriptions',
  })
  @RequirePermissions(...WORKSPACE_SUBSCRIPTION_READ_SCOPES)
  async workspaceEventSubscriptions(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ): Promise<WorkspaceEventSubscription[]> {
    const pagination = resolvePagination(skip, take);
    const subscriptions = await this.prisma.eventSubscription.findMany({
      where: {
        eventId,
        deletedAt: null,
      },
      select: {
        id: true,
        eventId: true,
        event: {
          select: EVENT_SELECT,
        },
        personId: true,
        person: {
          select: PERSON_SELECT,
        },
        eventGroupSubscriptionId: true,
        createdAt: true,
        createdById: true,
        createdByMethod: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
    });

    const majorEventIds = [
      ...new Set(
        subscriptions
          .map((subscription) => subscription.event.majorEventId)
          .filter((majorEventId): majorEventId is string => Boolean(majorEventId)),
      ),
    ];
    const personIds = [...new Set(subscriptions.map((subscription) => subscription.personId))];
    const eventIds = [...new Set(subscriptions.map((subscription) => subscription.eventId))];
    const majorEventSubscriptionSelections =
      majorEventIds.length > 0
        ? await this.prisma.majorEventSubscriptionEventSelection.findMany({
            where: {
              deletedAt: null,
              eventId: {
                in: eventIds,
              },
              subscription: {
                deletedAt: null,
                subscriptionStatus: SubscriptionStatus.CONFIRMED,
                majorEventId: {
                  in: majorEventIds,
                },
                personId: {
                  in: personIds,
                },
              },
            },
            select: {
              eventId: true,
              subscription: {
                select: {
                  id: true,
                  majorEventId: true,
                  personId: true,
                },
              },
            },
          })
        : [];
    const majorEventSubscriptionIdsByPersonMajorAndEvent = new Map(
      majorEventSubscriptionSelections.map((selection) => [
        `${selection.subscription.personId}:${selection.subscription.majorEventId}:${selection.eventId}`,
        selection.subscription.id,
      ]),
    );
    const lecturerPersonIds = await this.getLecturerPersonIds([eventId]);
    return subscriptions.map((subscription) => ({
      ...subscription,
      majorEventSubscriptionId: subscription.event.majorEventId
        ? majorEventSubscriptionIdsByPersonMajorAndEvent.get(
            `${subscription.personId}:${subscription.event.majorEventId}:${subscription.eventId}`,
          ) ?? null
        : null,
      isLecturerSubscription: lecturerPersonIds.has(subscription.personId),
    }));
  }

  @Mutation(() => WorkspaceEventSubscription, {
    name: 'createWorkspaceEventSubscription',
  })
  @RequirePermissions(...WORKSPACE_EVENT_SUBSCRIPTION_CREATE_PERMISSIONS)
  async createWorkspaceEventSubscription(
    @Args('input', { type: () => WorkspaceEventSubscriptionCreateInput })
    input: WorkspaceEventSubscriptionCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<WorkspaceEventSubscription> {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
    const createdById = this.getActorId(context);
    await this.ensurePersonExists(input.personId);
    await this.ensureEventExists(input.eventId);
    await this.ensurePersonIsNotLecturer(input.personId, [input.eventId]);

    const subscription = await this.runSerializableSubscriptionTransaction(async (tx) => {
      await this.eventSubscriptionSync.ensureEventIdsHaveAvailableSlots(tx, [input.eventId]);
      const created = await tx.eventSubscription.create({
        data: {
          eventId: input.eventId,
          personId: input.personId,
          createdById,
          createdByMethod: 'ADMIN_DASHBOARD',
        },
        select: {
          id: true,
          eventId: true,
          event: {
            select: EVENT_SELECT,
          },
          personId: true,
          person: {
            select: PERSON_SELECT,
          },
          eventGroupSubscriptionId: true,
          createdAt: true,
          createdById: true,
          createdByMethod: true,
        },
      });
      await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
      await this.refreshEventSubscriptionCounters(tx, [input.eventId]);
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_SUBSCRIPTION,
          entityId: created.id,
          entityLabel: created.person.name,
          operation: AuditLogOperation.CREATE,
          actor: this.getUser(context),
          after: created,
          scope: { permission: Permission.Subscription.Create, eventId: created.eventId },
          summary: 'Inscrição em evento criada pelo painel administrativo.',
        },
        tx,
      );
      return created;
    });

    return {
      ...subscription,
      majorEventSubscriptionId: null,
      isLecturerSubscription: false,
    };
  }

  @Query(() => [WorkspaceMajorEventSubscription], {
    name: 'workspaceMajorEventSubscriptions',
  })
  @RequirePermissions(...WORKSPACE_SUBSCRIPTION_READ_SCOPES)
  async workspaceMajorEventSubscriptions(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ): Promise<WorkspaceMajorEventSubscription[]> {
    const pagination = resolvePagination(skip, take);
    const subscriptions = await this.prisma.majorEventSubscription.findMany({
      where: {
        majorEventId,
        deletedAt: null,
      },
      select: this.majorEventSubscriptionSelect(),
      orderBy: {
        createdAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
    });

    return this.attachMajorEventSubscriptionEvents(majorEventId, subscriptions);
  }

  @Mutation(() => WorkspaceMajorEventSubscription, {
    name: 'createWorkspaceMajorEventSubscription',
  })
  @RequirePermissions(...WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_CREATE_PERMISSIONS)
  async createWorkspaceMajorEventSubscription(
    @Args('input', { type: () => WorkspaceMajorEventSubscriptionCreateInput })
    input: WorkspaceMajorEventSubscriptionCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<WorkspaceMajorEventSubscription> {
    await this.frozenResources.assertMajorEventMutable(input.majorEventId, this.getUser(context), 'edit');
    const createdById = this.getActorId(context);
    const selectedEventIds = this.normalizeEventIds(input.selectedEventIds);
    const status = this.normalizeStatus(input.subscriptionStatus);
    await this.ensurePersonExists(input.personId);
    await this.ensureMajorEventExists(input.majorEventId);
    await this.ensureSelectedEventsBelongToMajorEvent(input.majorEventId, selectedEventIds);
    await this.ensurePersonIsNotLecturer(input.personId, selectedEventIds);

    const subscription = await this.runSerializableSubscriptionTransaction(async (tx) => {
      const majorEventSubscription = await tx.majorEventSubscription.create({
        data: {
          majorEventId: input.majorEventId,
          personId: input.personId,
          subscriptionStatus: status,
          amountPaid: input.amountPaid ?? undefined,
          paymentDate: input.paymentDate ?? undefined,
          paymentTier: this.normalizeNullableText(input.paymentTier),
          createdById,
          createdByMethod: 'ADMIN_DASHBOARD',
        },
        select: this.majorEventSubscriptionSelect(),
      });

      if (selectedEventIds.length > 0) {
        await tx.majorEventSubscriptionEventSelection.createMany({
          data: selectedEventIds.map((eventId) => ({
            subscriptionId: majorEventSubscription.id,
            eventId,
            createdById,
          })),
        });
      }

      const subscriptionSyncResult =
        status === SubscriptionStatus.CONFIRMED && selectedEventIds.length > 0
          ? await this.eventSubscriptionSync.syncMajorEventConfirmedSubscriptions(
              tx,
              input.majorEventId,
              input.personId,
              selectedEventIds,
              status,
              createdById,
            )
          : null;

      await this.attendanceCategories.refreshForMajorEventPerson(input.majorEventId, input.personId, tx);
      await this.refreshEventSubscriptionCounters(tx, [
        ...selectedEventIds,
        ...(subscriptionSyncResult?.activeEventIds ?? []),
        ...(subscriptionSyncResult?.archivedEventIds ?? []),
        ...(subscriptionSyncResult?.createdEventIds ?? []),
      ]);

      const [result] = await this.attachMajorEventSubscriptionEvents(
        input.majorEventId,
        [majorEventSubscription],
        tx,
      );
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.MAJOR_EVENT_SUBSCRIPTION,
          entityId: result.id,
          entityLabel: result.person.name,
          operation: AuditLogOperation.CREATE,
          actor: this.getUser(context),
          after: result,
          scope: { permission: Permission.Subscription.Create, majorEventId: result.majorEventId },
          summary: 'Inscrição em grande evento criada pelo painel administrativo.',
        },
        tx,
      );
      return result;
    });
    return subscription;
  }

  @Mutation(() => WorkspaceMajorEventSubscription, {
    name: 'updateWorkspaceMajorEventSubscription',
  })
  @RequirePermissions(...WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_UPDATE_PERMISSIONS)
  async updateWorkspaceMajorEventSubscription(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => WorkspaceMajorEventSubscriptionUpdateInput })
    input: WorkspaceMajorEventSubscriptionUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<WorkspaceMajorEventSubscription> {
    const existing = await this.prisma.majorEventSubscription.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        id: true,
        majorEventId: true,
        personId: true,
        subscriptionStatus: true,
      },
    });
    if (!existing) {
      throw new NotFoundException(`Subscription ${id} was not found.`);
    }
    await this.frozenResources.assertMajorEventMutable(existing.majorEventId, this.getUser(context), 'edit');
    const selectedEventIds =
      input.selectedEventIds == null ? undefined : this.normalizeEventIds(input.selectedEventIds);

    if (selectedEventIds) {
      await this.ensureSelectedEventsBelongToMajorEvent(existing.majorEventId, selectedEventIds);
      await this.ensurePersonIsNotLecturer(existing.personId, selectedEventIds);
    }

    const subscription = await this.runSerializableSubscriptionTransaction(async (tx) => {
      const previousRecord = await tx.majorEventSubscription.findUnique({
        where: {
          id,
        },
        select: this.majorEventSubscriptionSelect(),
      });
      if (!previousRecord) {
        throw new NotFoundException(`Subscription ${id} was not found.`);
      }
      const [previousSubscription] = await this.attachMajorEventSubscriptionEvents(
        existing.majorEventId,
        [previousRecord],
        tx,
      );
      if (!previousSubscription) {
        throw new NotFoundException(`Subscription ${id} was not found.`);
      }
      const updateData: Prisma.MajorEventSubscriptionUpdateInput = {};
      if (input.subscriptionStatus !== undefined) {
        updateData.subscriptionStatus = this.normalizeStatus(input.subscriptionStatus);
      }
      if (input.amountPaid !== undefined) {
        updateData.amountPaid = input.amountPaid;
      }
      if (input.paymentDate !== undefined) {
        updateData.paymentDate = input.paymentDate;
      }
      if (input.paymentTier !== undefined) {
        updateData.paymentTier = this.normalizeNullableText(input.paymentTier);
      }

      const updated = await tx.majorEventSubscription.update({
        where: {
          id,
        },
        data: updateData,
        select: this.majorEventSubscriptionSelect(),
      });

      const effectiveSelectedEventIds =
        selectedEventIds ??
        (
          await tx.majorEventSubscriptionEventSelection.findMany({
            where: {
              subscriptionId: id,
              deletedAt: null,
            },
            select: {
              eventId: true,
            },
          })
        ).map((selection) => selection.eventId);

      await this.syncMajorEventEventSubscriptions(
        tx,
        id,
        existing.majorEventId,
        existing.personId,
        effectiveSelectedEventIds,
        updated.subscriptionStatus,
      );

      await this.attendanceCategories.refreshForMajorEventPerson(existing.majorEventId, existing.personId, tx);
      await this.refreshEventSubscriptionCounters(tx, effectiveSelectedEventIds);

      const [result] = await this.attachMajorEventSubscriptionEvents(existing.majorEventId, [updated], tx);
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.MAJOR_EVENT_SUBSCRIPTION,
          entityId: result.id,
          entityLabel: result.person.name,
          operation: AuditLogOperation.UPDATE,
          actor: this.getUser(context),
          before: previousSubscription,
          after: result,
          scope: { permission: Permission.Subscription.Update, majorEventId: result.majorEventId },
          summary: 'Inscrição em grande evento atualizada.',
        },
        tx,
      );
      return result;
    });
    if (existing.subscriptionStatus !== subscription.subscriptionStatus) {
      const notificationRecord = await this.findMajorEventSubscriptionNotificationRecord(subscription.id);
      if (notificationRecord) {
        await this.notifications.notifyMajorEventSubscriptionRecordChanged(existing.subscriptionStatus, notificationRecord);
      }
    }
    return subscription;
  }

  private async findMajorEventSubscriptionNotificationRecord(
    id: string,
  ): Promise<MajorEventSubscriptionNotificationRecord | null> {
    return this.prisma.majorEventSubscription.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        majorEventId: true,
        subscriptionStatus: true,
        receiptRejectionReason: true,
        majorEvent: {
          select: {
            name: true,
          },
        },
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            userId: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  private majorEventSubscriptionSelect() {
    return {
      id: true,
      majorEventId: true,
      majorEvent: {
        select: MAJOR_EVENT_SELECT,
      },
      personId: true,
      person: {
        select: PERSON_SELECT,
      },
      subscriptionStatus: true,
      amountPaid: true,
      paymentDate: true,
      paymentTier: true,
      createdAt: true,
      createdById: true,
      createdByMethod: true,
    } satisfies Prisma.MajorEventSubscriptionSelect;
  }

  private async attachMajorEventSubscriptionEvents(
    majorEventId: string,
    subscriptions: Array<
      Prisma.MajorEventSubscriptionGetPayload<{
        select: ReturnType<EventSubscriptionsResolver['majorEventSubscriptionSelect']>;
      }>
    >,
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<WorkspaceMajorEventSubscription[]> {
    if (subscriptions.length === 0) {
      return [];
    }

    const events = await prisma.event.findMany({
      where: {
        majorEventId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        lecturers: {
          select: {
            personId: true,
          },
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });
    const eventIds = events.map((event) => event.id);
    const personIds = subscriptions.map((subscription) => subscription.personId);
    const eventSelections = await prisma.majorEventSubscriptionEventSelection.findMany({
      where: {
        deletedAt: null,
        subscription: {
          personId: {
            in: personIds,
          },
          majorEventId,
          deletedAt: null,
        },
        eventId: {
          in: eventIds,
        },
      },
      select: {
        eventId: true,
        subscription: {
          select: {
            personId: true,
          },
        },
      },
    });
    const subscribedKeys = new Set(
      eventSelections.map((selection) => `${selection.subscription.personId}:${selection.eventId}`),
    );

    return subscriptions.map((subscription) => ({
      ...subscription,
      events: events.map((event) => ({
        eventId: event.id,
        eventName: event.name,
        eventStartDate: event.startDate,
        subscribed: subscribedKeys.has(`${subscription.personId}:${event.id}`),
        isLecturerSubscription: event.lecturers.some((lecturer) => lecturer.personId === subscription.personId),
      })),
    }));
  }

  private async syncMajorEventEventSubscriptions(
    tx: Prisma.TransactionClient,
    subscriptionId: string,
    majorEventId: string,
    personId: string,
    selectedEventIds: string[],
    status: SubscriptionStatus,
  ): Promise<void> {
    const selectedEventIdSet = new Set(selectedEventIds);
    const activeSelections = await tx.majorEventSubscriptionEventSelection.findMany({
      where: {
        subscriptionId,
        deletedAt: null,
      },
      select: {
        eventId: true,
      },
    });
    const activeSelectionIdSet = new Set(activeSelections.map((selection) => selection.eventId));
    const now = new Date();
    const selectionEventIdsToArchive = [...activeSelectionIdSet].filter((eventId) => !selectedEventIdSet.has(eventId));
    if (selectionEventIdsToArchive.length > 0) {
      await tx.majorEventSubscriptionEventSelection.updateMany({
        where: {
          subscriptionId,
          eventId: {
            in: selectionEventIdsToArchive,
          },
          deletedAt: null,
        },
        data: {
          deletedAt: now,
        },
      });
    }

    const selectionEventIdsToCreate = selectedEventIds.filter((eventId) => !activeSelectionIdSet.has(eventId));
    if (selectionEventIdsToCreate.length > 0) {
      await tx.majorEventSubscriptionEventSelection.createMany({
        data: selectionEventIdsToCreate.map((eventId) => ({
          subscriptionId,
          eventId,
        })),
      });
    }

    const subscriptionSyncResult = await this.eventSubscriptionSync.syncMajorEventConfirmedSubscriptions(
      tx,
      majorEventId,
      personId,
      selectedEventIds,
      status,
    );

    await this.refreshEventSubscriptionCounters(tx, [
      ...activeSelectionIdSet,
      ...selectedEventIds,
      ...subscriptionSyncResult.activeEventIds,
      ...subscriptionSyncResult.archivedEventIds,
      ...subscriptionSyncResult.createdEventIds,
    ]);
  }

  private async refreshEventSubscriptionCounters(tx: Prisma.TransactionClient, eventIds: string[]): Promise<void> {
    await this.counters.refresh(tx, eventIds);
  }

  private async runSerializableSubscriptionTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (attempt < maxAttempts && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          continue;
        }

        throw error;
      }
    }

    throw new BadRequestException('Could not complete subscription.');
  }

  private async ensurePersonExists(personId: string): Promise<void> {
    const person = await this.prisma.people.findFirst({
      where: {
        id: personId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!person) {
      throw new NotFoundException(`Person ${personId} was not found.`);
    }
  }

  private async ensureEventExists(eventId: string): Promise<void> {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }
  }

  private async ensureMajorEventExists(majorEventId: string): Promise<void> {
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: majorEventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!majorEvent) {
      throw new NotFoundException(`Major event ${majorEventId} was not found.`);
    }
  }

  private async ensureSelectedEventsBelongToMajorEvent(majorEventId: string, eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }

    const events = await this.prisma.event.findMany({
      where: {
        id: {
          in: eventIds,
        },
        majorEventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    const foundIds = new Set(events.map((event) => event.id));
    const missingIds = eventIds.filter((eventId) => !foundIds.has(eventId));
    if (missingIds.length > 0) {
      throw new BadRequestException(
        `Some selected events do not belong to major event ${majorEventId}: ${missingIds.join(', ')}.`,
      );
    }
  }

  private async ensurePersonIsNotLecturer(personId: string, eventIds: string[]): Promise<void> {
    const lecturerPersonIds = await this.getLecturerPersonIds(eventIds);
    if (lecturerPersonIds.has(personId)) {
      throw new BadRequestException(`Person ${personId} is a lecturer for one of the selected events.`);
    }
  }

  private async getLecturerPersonIds(eventIds: string[]): Promise<Set<string>> {
    if (eventIds.length === 0) {
      return new Set();
    }

    const lecturers = await this.prisma.eventLecturer.findMany({
      where: {
        eventId: {
          in: eventIds,
        },
      },
      select: {
        personId: true,
      },
    });
    return new Set(lecturers.map((lecturer) => lecturer.personId));
  }

  private normalizeEventIds(eventIds: string[]): string[] {
    return [...new Set(eventIds.map((eventId) => eventId.trim()).filter(Boolean))];
  }

  private normalizeStatus(status?: string): SubscriptionStatus {
    if (!status) {
      return SubscriptionStatus.CONFIRMED;
    }

    const normalizedStatus = status.trim() as SubscriptionStatus;
    if (!Object.values(SubscriptionStatus).includes(normalizedStatus)) {
      throw new BadRequestException(`Invalid subscription status ${status}.`);
    }
    return normalizedStatus;
  }

  private normalizeNullableText(value?: string | null): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private getActorId(context: GraphqlContext): string {
    const user = this.getUser(context);
    const actorId = user?.sub ?? user?.email;
    if (!actorId) {
      throw new UnauthorizedException('Missing authenticated user context.');
    }
    return actorId;
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
