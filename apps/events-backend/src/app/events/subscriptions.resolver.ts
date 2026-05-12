import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import {
  WorkspaceEventSubscription,
  WorkspaceEventSubscriptionCreateInput,
  WorkspaceMajorEventSubscription,
  WorkspaceMajorEventSubscriptionCreateInput,
  WorkspaceMajorEventSubscriptionUpdateInput,
} from '@cacic-fct/shared-data-types';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceCategoryService } from './attendance-category.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

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
  ) {}

  @Query(() => [WorkspaceEventSubscription], {
    name: 'workspaceEventSubscriptions',
  })
  @RequireScopes('subscription#read')
  async workspaceEventSubscriptions(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ): Promise<WorkspaceEventSubscription[]> {
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
      skip,
      take,
    });

    const lecturerPersonIds = await this.getLecturerPersonIds([eventId]);
    return subscriptions.map((subscription) => ({
      ...subscription,
      isLecturerSubscription: lecturerPersonIds.has(subscription.personId),
    }));
  }

  @Mutation(() => WorkspaceEventSubscription, {
    name: 'createWorkspaceEventSubscription',
  })
  @RequireScopes('subscription#edit')
  async createWorkspaceEventSubscription(
    @Args('input', { type: () => WorkspaceEventSubscriptionCreateInput })
    input: WorkspaceEventSubscriptionCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<WorkspaceEventSubscription> {
    const createdById = this.getActorId(context);
    await this.ensurePersonExists(input.personId);
    await this.ensureEventExists(input.eventId);
    await this.ensurePersonIsNotLecturer(input.personId, [input.eventId]);

    const subscription = await this.prisma.$transaction(async (tx) => {
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
      await this.attendanceCategories.refreshForAttendance(
        input.personId,
        input.eventId,
        tx,
      );
      await this.refreshEventSubscriptionCounters(tx, [input.eventId]);
      return created;
    });

    return {
      ...subscription,
      isLecturerSubscription: false,
    };
  }

  @Query(() => [WorkspaceMajorEventSubscription], {
    name: 'workspaceMajorEventSubscriptions',
  })
  @RequireScopes('subscription#read')
  async workspaceMajorEventSubscriptions(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ): Promise<WorkspaceMajorEventSubscription[]> {
    const subscriptions = await this.prisma.majorEventSubscription.findMany({
      where: {
        majorEventId,
        deletedAt: null,
      },
      select: this.majorEventSubscriptionSelect(),
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take,
    });

    return this.attachMajorEventSubscriptionEvents(majorEventId, subscriptions);
  }

  @Mutation(() => WorkspaceMajorEventSubscription, {
    name: 'createWorkspaceMajorEventSubscription',
  })
  @RequireScopes('subscription#edit')
  async createWorkspaceMajorEventSubscription(
    @Args('input', { type: () => WorkspaceMajorEventSubscriptionCreateInput })
    input: WorkspaceMajorEventSubscriptionCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<WorkspaceMajorEventSubscription> {
    const createdById = this.getActorId(context);
    const selectedEventIds = this.normalizeEventIds(input.selectedEventIds);
    const status = this.normalizeStatus(input.subscriptionStatus);
    await this.ensurePersonExists(input.personId);
    await this.ensureMajorEventExists(input.majorEventId);
    await this.ensureSelectedEventsBelongToMajorEvent(
      input.majorEventId,
      selectedEventIds,
    );
    await this.ensurePersonIsNotLecturer(input.personId, selectedEventIds);

    const subscription = await this.prisma.$transaction(async (tx) => {
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

      if (status === SubscriptionStatus.CONFIRMED && selectedEventIds.length > 0) {
        await tx.eventSubscription.createMany({
          data: selectedEventIds.map((eventId) => ({
            eventId,
            personId: input.personId,
            createdById,
            createdByMethod: 'ADMIN_DASHBOARD',
          })),
        });
      }

      await this.attendanceCategories.refreshForMajorEventPerson(
        input.majorEventId,
        input.personId,
        tx,
      );
      await this.refreshEventSubscriptionCounters(tx, selectedEventIds);

      return majorEventSubscription;
    });

    const [result] = await this.attachMajorEventSubscriptionEvents(
      input.majorEventId,
      [subscription],
    );
    return result;
  }

  @Mutation(() => WorkspaceMajorEventSubscription, {
    name: 'updateWorkspaceMajorEventSubscription',
  })
  @RequireScopes('subscription#edit')
  async updateWorkspaceMajorEventSubscription(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => WorkspaceMajorEventSubscriptionUpdateInput })
    input: WorkspaceMajorEventSubscriptionUpdateInput,
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

    const selectedEventIds =
      input.selectedEventIds == null
        ? undefined
        : this.normalizeEventIds(input.selectedEventIds);

    if (selectedEventIds) {
      await this.ensureSelectedEventsBelongToMajorEvent(
        existing.majorEventId,
        selectedEventIds,
      );
      await this.ensurePersonIsNotLecturer(existing.personId, selectedEventIds);
    }

    const subscription = await this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.MajorEventSubscriptionUpdateInput = {};
      if (input.subscriptionStatus !== undefined) {
        updateData.subscriptionStatus = this.normalizeStatus(
          input.subscriptionStatus,
        );
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

      await this.attendanceCategories.refreshForMajorEventPerson(
        existing.majorEventId,
        existing.personId,
        tx,
      );
      await this.refreshEventSubscriptionCounters(
        tx,
        effectiveSelectedEventIds,
      );

      return updated;
    });

    const [result] = await this.attachMajorEventSubscriptionEvents(
      existing.majorEventId,
      [subscription],
    );
    return result;
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
        select: ReturnType<
          EventSubscriptionsResolver['majorEventSubscriptionSelect']
        >;
      }>
    >,
  ): Promise<WorkspaceMajorEventSubscription[]> {
    if (subscriptions.length === 0) {
      return [];
    }

    const events = await this.prisma.event.findMany({
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
    const personIds = subscriptions.map(
      (subscription) => subscription.personId,
    );
    const eventSelections =
      await this.prisma.majorEventSubscriptionEventSelection.findMany({
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
      eventSelections.map(
        (selection) => `${selection.subscription.personId}:${selection.eventId}`,
      ),
    );

    return subscriptions.map((subscription) => ({
      ...subscription,
      events: events.map((event) => ({
        eventId: event.id,
        eventName: event.name,
        eventStartDate: event.startDate,
        subscribed: subscribedKeys.has(`${subscription.personId}:${event.id}`),
        isLecturerSubscription: event.lecturers.some(
          (lecturer) => lecturer.personId === subscription.personId,
        ),
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
    const activeSelections =
      await tx.majorEventSubscriptionEventSelection.findMany({
        where: {
          subscriptionId,
          deletedAt: null,
        },
        select: {
          eventId: true,
        },
      });
    const activeSelectionIdSet = new Set(
      activeSelections.map((selection) => selection.eventId),
    );
    const now = new Date();
    const selectionEventIdsToArchive = [...activeSelectionIdSet].filter(
      (eventId) => !selectedEventIdSet.has(eventId),
    );
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

    const selectionEventIdsToCreate = selectedEventIds.filter(
      (eventId) => !activeSelectionIdSet.has(eventId),
    );
    if (selectionEventIdsToCreate.length > 0) {
      await tx.majorEventSubscriptionEventSelection.createMany({
        data: selectionEventIdsToCreate.map((eventId) => ({
          subscriptionId,
          eventId,
        })),
      });
    }

    const activeSubscriptions = await tx.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        event: {
          majorEventId,
          deletedAt: null,
        },
      },
      select: {
        eventId: true,
      },
    });
    const activeEventIdSet = new Set(
      activeSubscriptions.map((subscription) => subscription.eventId),
    );
    const eventIdsToArchive = [...activeEventIdSet].filter(
      (eventId) =>
        status !== SubscriptionStatus.CONFIRMED ||
        !selectedEventIdSet.has(eventId),
    );
    if (eventIdsToArchive.length > 0) {
      await tx.eventSubscription.updateMany({
        where: {
          personId,
          eventId: {
            in: eventIdsToArchive,
          },
          deletedAt: null,
        },
        data: {
          deletedAt: now,
        },
      });
    }

    const eventIdsToCreate =
      status === SubscriptionStatus.CONFIRMED
        ? selectedEventIds.filter((eventId) => !activeEventIdSet.has(eventId))
        : [];
    if (eventIdsToCreate.length > 0) {
      await tx.eventSubscription.createMany({
        data: eventIdsToCreate.map((eventId) => ({
          eventId,
          personId,
          createdByMethod: 'ADMIN_DASHBOARD',
        })),
      });
    }

    await this.refreshEventSubscriptionCounters(tx, [
      ...activeEventIdSet,
      ...activeSelectionIdSet,
      ...selectedEventIds,
    ]);
  }

  private async refreshEventSubscriptionCounters(
    tx: Prisma.TransactionClient,
    eventIds: string[],
  ): Promise<void> {
    const uniqueEventIds = [...new Set(eventIds)];
    if (uniqueEventIds.length === 0) {
      return;
    }

    await Promise.all(
      uniqueEventIds.map((eventId) =>
        tx.$executeRaw`
          UPDATE "events" event
          SET
            "queueCount" = (
              SELECT COUNT(*)::INTEGER
              FROM "major_event_subscription_event_selections" selection
              JOIN "major_event_subscriptions" subscription
                ON subscription."id" = selection."subscriptionId"
              WHERE selection."eventId" = ${eventId}
                AND selection."deletedAt" IS NULL
                AND subscription."deletedAt" IS NULL
                AND subscription."subscriptionStatus" NOT IN ('CONFIRMED', 'CANCELED')
            ),
            "slotsAvailable" = CASE
              WHEN event."slots" IS NULL THEN NULL
              ELSE event."slots" - (
                SELECT COUNT(*)::INTEGER
                FROM "event_subscriptions" event_subscription
                WHERE event_subscription."eventId" = ${eventId}
                  AND event_subscription."deletedAt" IS NULL
              )
            END
          WHERE event."id" = ${eventId}
        `,
      ),
    );
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

  private async ensureSelectedEventsBelongToMajorEvent(
    majorEventId: string,
    eventIds: string[],
  ): Promise<void> {
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

  private async ensurePersonIsNotLecturer(
    personId: string,
    eventIds: string[],
  ): Promise<void> {
    const lecturerPersonIds = await this.getLecturerPersonIds(eventIds);
    if (lecturerPersonIds.has(personId)) {
      throw new BadRequestException(
        `Person ${personId} is a lecturer for one of the selected events.`,
      );
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
    return [
      ...new Set(eventIds.map((eventId) => eventId.trim()).filter(Boolean)),
    ];
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

  private normalizeNullableText(
    value?: string | null,
  ): string | null | undefined {
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
    const user = context.req?.user ?? context.request?.user;
    const actorId = user?.sub ?? user?.email;
    if (!actorId) {
      throw new UnauthorizedException('Missing authenticated user context.');
    }
    return actorId;
  }
}
