import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuditLogEntityType,
  AuditLogOperation,
  MajorEventSubscriptionFlow,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { TURNSTILE_ACTIONS } from '@cacic-fct/shared-utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserContextService } from '../context.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import { EventRecord, EVENT_SELECT, GraphqlContext } from '../selects';
import { CurrentUserMajorEventSubscriptionService } from './subscription.service';
import { CurrentUserPublicEventService } from '../public-event.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { TurnstileService } from '../../turnstile/turnstile.service';
import {
  CurrentUserMajorEventFeedItem,
  CurrentUserMajorEventSubscription,
  UpsertCurrentUserMajorEventSubscriptionInput,
} from '../models';

@Resolver()
export class CurrentUserMajorEventSubscriptionsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly mapper: CurrentUserEventMapperService,
    private readonly publicEvents: CurrentUserPublicEventService,
    private readonly majorEventSubscriptions: CurrentUserMajorEventSubscriptionService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly frozenResources: FrozenResourceService = {
      assertMajorEventMutable: async () => undefined,
    } as unknown as FrozenResourceService,
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
    } as unknown as AuditLogService,
    private readonly turnstile: TurnstileService = {
      assertValidToken: async () => undefined,
    } as unknown as TurnstileService,
  ) {}

  @Query(() => [CurrentUserMajorEventSubscription], {
    name: 'currentUserMajorEventSubscriptions',
  })
  async currentUserMajorEventSubscriptions(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserMajorEventSubscription[]> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return [];
    }

    const paymentInfoTableExists = await this.publicEvents.hasPaymentInfoTable();
    const subscriptions = await this.prisma.majorEventSubscription.findMany({
      where: {
        personId: person.id,
        deletedAt: null,
        majorEvent: {
          deletedAt: null,
        },
      },
      select: this.publicEvents.getMajorEventSubscriptionSelect(paymentInfoTableExists),
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (subscriptions.length === 0) {
      return [];
    }

    const majorEventIds = subscriptions.map((subscription) => subscription.majorEventId);
    const selectedEventsByMajorEventId = await this.majorEventSubscriptions.getSelectedEventsByMajorEvent(
      person.id,
      majorEventIds,
    );

    return subscriptions.map((subscription) => ({
      id: subscription.id,
      majorEventId: subscription.majorEventId,
      majorEvent: this.mapper.mapPublicMajorEvent(subscription.majorEvent),
      subscriptionStatus: subscription.subscriptionStatus,
      amountPaid: subscription.amountPaid ?? undefined,
      paymentDate: subscription.paymentDate ?? undefined,
      paymentTier: subscription.paymentTier ?? undefined,
      selectedEvents: selectedEventsByMajorEventId.get(subscription.majorEventId) ?? [],
      notSubscribedEvents: [],
    }));
  }

  @Query(() => [CurrentUserMajorEventFeedItem], {
    name: 'currentUserMajorEventFeed',
    description:
      'Get current-user major events where the person is subscribed, a lecturer, or has an issued major-event certificate.',
  })
  async currentUserMajorEventFeed(@Context() context: GraphqlContext): Promise<CurrentUserMajorEventFeedItem[]> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return [];
    }

    const paymentInfoTableExists = await this.publicEvents.hasPaymentInfoTable();

    return this.majorEventSubscriptions.getCurrentUserMajorEventFeedItems(person.id, paymentInfoTableExists);
  }

  @Query(() => CurrentUserMajorEventSubscription, {
    name: 'currentUserMajorEventSubscription',
    nullable: true,
  })
  async currentUserMajorEventSubscription(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserMajorEventSubscription | null> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return null;
    }

    const paymentInfoTableExists = await this.publicEvents.hasPaymentInfoTable();
    const subscription = await this.prisma.majorEventSubscription.findFirst({
      where: {
        majorEventId,
        personId: person.id,
        deletedAt: null,
      },
      select: this.publicEvents.getMajorEventSubscriptionSelect(paymentInfoTableExists),
    });

    if (!subscription) {
      await this.publicEvents.requirePublicMajorEvent(majorEventId);
      return null;
    }

    const { selectedEvents, notSubscribedEvents } = await this.majorEventSubscriptions.getMajorEventSubscriptionEvents(
      person.id,
      majorEventId,
    );

    return {
      id: subscription.id,
      majorEventId: subscription.majorEventId,
      majorEvent: this.mapper.mapPublicMajorEvent(subscription.majorEvent),
      subscriptionStatus: subscription.subscriptionStatus,
      amountPaid: subscription.amountPaid ?? undefined,
      paymentDate: subscription.paymentDate ?? undefined,
      paymentTier: subscription.paymentTier ?? undefined,
      selectedEvents,
      notSubscribedEvents,
    };
  }

  @Mutation(() => CurrentUserMajorEventSubscription, {
    name: 'upsertCurrentUserMajorEventSubscription',
  })
  async upsertCurrentUserMajorEventSubscription(
    @Args('input', { type: () => UpsertCurrentUserMajorEventSubscriptionInput })
    input: UpsertCurrentUserMajorEventSubscriptionInput,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserMajorEventSubscription> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    await this.turnstile.assertValidToken(
      input.turnstileToken,
      context.req ?? context.request,
      TURNSTILE_ACTIONS.majorEventSubscription,
    );
    await this.frozenResources.assertMajorEventMutable(input.majorEventId, authenticatedUser, 'edit');
    const person = await this.currentUserContext.requireCurrentPerson(context);
    let selectedEventIds = this.majorEventSubscriptions.normalizeSelectedEventIds(input.selectedEventIds);
    if (selectedEventIds.length === 0) {
      throw new BadRequestException('At least one event must be selected for the major-event subscription.');
    }

    const paymentInfoTableExists = await this.publicEvents.hasPaymentInfoTable();
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: input.majorEventId,
        deletedAt: null,
      },
      select: this.publicEvents.getMajorEventSelect(paymentInfoTableExists),
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${input.majorEventId} was not found.`);
    }

    this.majorEventSubscriptions.ensureMajorEventSubscriptionWindowOpen(majorEvent);

    const isRankedSubscription = majorEvent.rankedSubscriptionEnabled;
    const allSubscriptionEvents = await this.prisma.event.findMany({
      where: {
        majorEventId: input.majorEventId,
        deletedAt: null,
        allowSubscription: true,
      },
      select: EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
    });

    const allSubscriptionEventsById = new Map(allSubscriptionEvents.map((event) => [event.id, event]));
    const requiredAutoSubscribeEventIds = allSubscriptionEvents
      .filter((event) => event.autoSubscribe)
      .map((event) => event.id);
    selectedEventIds = this.majorEventSubscriptions.normalizeSelectedEventIds([
      ...requiredAutoSubscribeEventIds,
      ...selectedEventIds,
    ]);
    const selectedEvents = selectedEventIds
      .map((eventId) => allSubscriptionEventsById.get(eventId))
      .filter((event): event is EventRecord => Boolean(event));

    const selectedEventsById = new Map(selectedEvents.map((event) => [event.id, event]));
    const missingSelectedEventIds = selectedEventIds.filter((eventId) => !selectedEventsById.has(eventId));
    if (missingSelectedEventIds.length > 0) {
      throw new BadRequestException(
        `Some selected events are invalid for major event ${input.majorEventId}: ${missingSelectedEventIds.join(', ')}.`,
      );
    }
    const selectedEventIdSet = new Set(selectedEventIds);

    let desiredCounts: ReturnType<CurrentUserMajorEventSubscriptionService['resolveRankedDesiredCounts']> | null = null;
    if (isRankedSubscription) {
      desiredCounts = this.majorEventSubscriptions.resolveRankedDesiredCounts(majorEvent, allSubscriptionEvents, input);
    } else {
      this.majorEventSubscriptions.ensureMajorEventEventLimits(majorEvent, selectedEvents);
      this.majorEventSubscriptions.ensureMajorEventScheduleHasNoConflicts(selectedEvents);
    }

    const allGroupedEvents = await this.prisma.event.findMany({
      where: {
        majorEventId: input.majorEventId,
        deletedAt: null,
        allowSubscription: true,
        eventGroupId: {
          not: null,
        },
      },
      select: {
        id: true,
        eventGroupId: true,
      },
    });
    this.majorEventSubscriptions.ensureEventGroupsAreFullySelected(selectedEventIdSet, allGroupedEvents);

    const missingAutoSubscribeEventIds = requiredAutoSubscribeEventIds.filter((eventId) => !selectedEventIdSet.has(eventId));
    if (missingAutoSubscribeEventIds.length > 0) {
      throw new BadRequestException(
        `Auto-subscribe events must be selected: ${missingAutoSubscribeEventIds.join(', ')}.`,
      );
    }

    const selfServicePayment = this.majorEventSubscriptions.resolveSelfServicePayment(majorEvent, input.paymentTier);

    const now = new Date();
    const upsertResult = await this.runSerializableSubscriptionTransaction(async (tx) => {
      const existingSubscription = await tx.majorEventSubscription.findFirst({
        where: {
          majorEventId: input.majorEventId,
          personId: person.id,
          deletedAt: null,
        },
        select: {
          id: true,
          subscriptionStatus: true,
        },
      });

      if (existingSubscription?.subscriptionStatus === SubscriptionStatus.CONFIRMED) {
        throw new BadRequestException(
          `Subscription for major event ${input.majorEventId} is already confirmed and cannot be changed.`,
        );
      }

      const previousSubscription = existingSubscription
        ? await tx.majorEventSubscription.findFirst({
            where: {
              id: existingSubscription.id,
              deletedAt: null,
            },
            select: this.publicEvents.getMajorEventSubscriptionSelect(paymentInfoTableExists),
          })
        : null;
      const previousSelectedEventIds = existingSubscription
        ? (
            await tx.majorEventSubscriptionEventSelection.findMany({
              where: {
                subscriptionId: existingSubscription.id,
                deletedAt: null,
              },
              select: {
                eventId: true,
              },
            })
          ).map((selection) => selection.eventId)
        : [];
      const previousAuditSnapshot = previousSubscription
        ? { ...previousSubscription, selectedEventIds: previousSelectedEventIds }
        : null;

      const nextStatus = this.majorEventSubscriptions.resolveNextSubscriptionStatus(
        majorEvent.isPaymentRequired,
        existingSubscription?.subscriptionStatus,
      );

      if (existingSubscription) {
        const updateData: Prisma.MajorEventSubscriptionUpdateInput = {};
        updateData.amountPaid = selfServicePayment.amountPaid;
        updateData.paymentTier = selfServicePayment.paymentTier;
        updateData.subscriptionFlow = isRankedSubscription
          ? MajorEventSubscriptionFlow.RANKED_VOTING
          : MajorEventSubscriptionFlow.REGULAR;
        updateData.desiredCourses = desiredCounts?.desiredCourses ?? null;
        updateData.desiredLectures = desiredCounts?.desiredLectures ?? null;
        updateData.desiredUncategorized = desiredCounts?.desiredUncategorized ?? null;
        if (nextStatus) {
          updateData.subscriptionStatus = nextStatus;
        }

        if (Object.keys(updateData).length > 0) {
          await tx.majorEventSubscription.update({
            where: {
              id: existingSubscription.id,
            },
            data: updateData,
          });
        }
      } else {
        await tx.majorEventSubscription.create({
          data: {
            majorEventId: input.majorEventId,
            personId: person.id,
            amountPaid: selfServicePayment.amountPaid ?? undefined,
            paymentTier: selfServicePayment.paymentTier ?? undefined,
            createdByMethod: 'SELF_SUBSCRIPTION',
            subscriptionFlow: isRankedSubscription
              ? MajorEventSubscriptionFlow.RANKED_VOTING
              : MajorEventSubscriptionFlow.REGULAR,
            desiredCourses: desiredCounts?.desiredCourses,
            desiredLectures: desiredCounts?.desiredLectures,
            desiredUncategorized: desiredCounts?.desiredUncategorized,
            subscriptionStatus:
              nextStatus ??
              (majorEvent.isPaymentRequired ? SubscriptionStatus.WAITING_RECEIPT_UPLOAD : SubscriptionStatus.CONFIRMED),
          },
        });
      }

      const activeMajorEventSubscription = await tx.majorEventSubscription.findFirst({
        where: {
          majorEventId: input.majorEventId,
          personId: person.id,
          deletedAt: null,
        },
        select: {
          id: true,
          subscriptionStatus: true,
        },
      });

      if (!activeMajorEventSubscription) {
        throw new NotFoundException(`Subscription for major event ${input.majorEventId} was not found after upsert.`);
      }

      const activeSelections = await tx.majorEventSubscriptionEventSelection.findMany({
        where: {
          subscriptionId: activeMajorEventSubscription.id,
          deletedAt: null,
        },
        select: {
          eventId: true,
        },
      });
      const activeSelectionIdSet = new Set(activeSelections.map((selection) => selection.eventId));
      const selectionEventIdsToArchive = [...activeSelectionIdSet].filter(
        (eventId) => !selectedEventIdSet.has(eventId),
      );
      if (selectionEventIdsToArchive.length > 0) {
        await tx.majorEventSubscriptionEventSelection.updateMany({
          where: {
            subscriptionId: activeMajorEventSubscription.id,
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
            subscriptionId: activeMajorEventSubscription.id,
            eventId,
            preferenceOrder: isRankedSubscription ? this.getPreferenceOrder(eventId, selectedEventIds, selectedEventsById) : null,
          })),
        });
      }
      if (isRankedSubscription) {
        await Promise.all(
          selectedEventIds.map((eventId) =>
            tx.majorEventSubscriptionEventSelection.updateMany({
              where: {
                subscriptionId: activeMajorEventSubscription.id,
                eventId,
                deletedAt: null,
              },
              data: {
                preferenceOrder: this.getPreferenceOrder(eventId, selectedEventIds, selectedEventsById),
              },
            }),
          ),
        );
      }

      const activeEventSubscriptions = await tx.eventSubscription.findMany({
        where: {
          personId: person.id,
          deletedAt: null,
          event: {
            majorEventId: input.majorEventId,
            deletedAt: null,
          },
        },
        select: {
          eventId: true,
        },
      });

      const activeEventIdSet = new Set(activeEventSubscriptions.map((subscription) => subscription.eventId));
      const confirmationEventIds =
        isRankedSubscription && desiredCounts
          ? await this.resolveRankedConfirmationEventIds(
              tx,
              person.id,
              selectedEventIds,
              selectedEventsById,
              desiredCounts,
            )
          : selectedEventIds;
      const confirmationEventIdSet = new Set(confirmationEventIds);
      const eventIdsToArchive = [...activeEventIdSet].filter(
        (eventId) =>
          activeMajorEventSubscription.subscriptionStatus !== SubscriptionStatus.CONFIRMED ||
          !confirmationEventIdSet.has(eventId),
      );

      if (eventIdsToArchive.length > 0) {
        await tx.eventSubscription.updateMany({
          where: {
            personId: person.id,
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
        activeMajorEventSubscription.subscriptionStatus === SubscriptionStatus.CONFIRMED
          ? confirmationEventIds.filter((eventId) => !activeEventIdSet.has(eventId))
          : [];
      for (const eventId of eventIdsToCreate) {
        const event = selectedEventsById.get(eventId);
        if (event?.slots == null) {
          continue;
        }

        const activeSubscriptionsCount = await tx.eventSubscription.count({
          where: {
            eventId,
            deletedAt: null,
          },
        });
        if (activeSubscriptionsCount >= event.slots) {
          throw new BadRequestException(`Event ${eventId} has no available slots for subscription.`);
        }
      }

      if (eventIdsToCreate.length > 0) {
        await tx.eventSubscription.createMany({
          data: eventIdsToCreate.map((eventId) => ({
            eventId,
            personId: person.id,
            createdByMethod: 'SELF_SUBSCRIPTION',
          })),
        });
      }

      await this.attendanceCategories.refreshForMajorEventPerson(input.majorEventId, person.id, tx);
      await this.majorEventSubscriptions.refreshEventSubscriptionCounters(tx, [
        ...activeEventIdSet,
        ...selectedEventIds,
        ...confirmationEventIds,
      ]);

      const updatedSubscription = await tx.majorEventSubscription.findFirst({
        where: {
          majorEventId: input.majorEventId,
          personId: person.id,
          deletedAt: null,
        },
        select: this.publicEvents.getMajorEventSubscriptionSelect(paymentInfoTableExists),
      });

      if (!updatedSubscription) {
        throw new NotFoundException(`Subscription for major event ${input.majorEventId} was not found after upsert.`);
      }

      if (!existingSubscription) {
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.MAJOR_EVENT_SUBSCRIPTION,
            entityId: updatedSubscription.id,
            entityLabel: person.id,
            operation: AuditLogOperation.USER_CREATE,
            actor: authenticatedUser,
            after: { ...updatedSubscription, selectedEventIds },
            scope: {
              permission: Permission.Subscription.Create,
              majorEventId: updatedSubscription.majorEventId,
            },
            summary: 'Inscrição em grande evento criada pelo usuário.',
          },
          tx,
        );
      } else if (previousAuditSnapshot) {
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.MAJOR_EVENT_SUBSCRIPTION,
            entityId: updatedSubscription.id,
            entityLabel: person.id,
            operation: AuditLogOperation.UPDATE,
            actor: authenticatedUser,
            before: previousAuditSnapshot,
            after: { ...updatedSubscription, selectedEventIds },
            scope: {
              permission: Permission.Subscription.Update,
              majorEventId: updatedSubscription.majorEventId,
            },
            summary: 'Inscrição em grande evento atualizada pelo usuário.',
          },
          tx,
        );
      }

      return {
        subscription: updatedSubscription,
        createdSubscription: !existingSubscription,
      };
    });
    const subscription = upsertResult.subscription;

    const orderedEvents = selectedEventIds.map((eventId) =>
      this.mapper.mapPublicEvent(selectedEventsById.get(eventId) as EventRecord),
    );

    return {
      id: subscription.id,
      majorEventId: subscription.majorEventId,
      majorEvent: this.mapper.mapPublicMajorEvent(subscription.majorEvent),
      subscriptionStatus: subscription.subscriptionStatus,
      amountPaid: subscription.amountPaid ?? undefined,
      paymentDate: subscription.paymentDate ?? undefined,
      paymentTier: subscription.paymentTier ?? undefined,
      selectedEvents: orderedEvents,
      notSubscribedEvents: [],
    };
  }

  @Mutation(() => CurrentUserMajorEventSubscription, {
    name: 'markCurrentUserReceiptUploaded',
  })
  async markCurrentUserReceiptUploaded(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserMajorEventSubscription> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    await this.frozenResources.assertMajorEventMutable(majorEventId, authenticatedUser, 'edit');
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const paymentInfoTableExists = await this.publicEvents.hasPaymentInfoTable();

    const subscription = await this.prisma.majorEventSubscription.findFirst({
      where: {
        majorEventId,
        personId: person.id,
        deletedAt: null,
      },
      select: this.publicEvents.getMajorEventSubscriptionSelect(paymentInfoTableExists),
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription for major event ${majorEventId} was not found.`);
    }

    if (!subscription.majorEvent.isPaymentRequired) {
      throw new BadRequestException(`Major event ${majorEventId} does not require payment receipt upload.`);
    }

    if (subscription.subscriptionStatus === SubscriptionStatus.CONFIRMED) {
      throw new BadRequestException(`Subscription for major event ${majorEventId} is already confirmed.`);
    }

    if (subscription.subscriptionStatus === SubscriptionStatus.CANCELED) {
      throw new BadRequestException(
        `Subscription for major event ${majorEventId} is canceled and cannot receive a receipt.`,
      );
    }

    const updatedSubscription =
      subscription.subscriptionStatus === SubscriptionStatus.RECEIPT_UNDER_REVIEW
        ? subscription
        : await this.prisma.$transaction(async (tx) => {
            const updated = await tx.majorEventSubscription.update({
              where: {
                id: subscription.id,
              },
              data: {
                subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
              },
              select: this.publicEvents.getMajorEventSubscriptionSelect(paymentInfoTableExists),
            });
            await this.attendanceCategories.refreshForMajorEventPerson(majorEventId, person.id, tx);
            return updated;
          });

    const selectedEvents = await this.majorEventSubscriptions.getSelectedEventsForMajorEventSubscription(
      person.id,
      majorEventId,
    );

    return {
      id: updatedSubscription.id,
      majorEventId: updatedSubscription.majorEventId,
      majorEvent: this.mapper.mapPublicMajorEvent(updatedSubscription.majorEvent),
      subscriptionStatus: updatedSubscription.subscriptionStatus,
      amountPaid: updatedSubscription.amountPaid ?? undefined,
      paymentDate: updatedSubscription.paymentDate ?? undefined,
      paymentTier: updatedSubscription.paymentTier ?? undefined,
      selectedEvents,
      notSubscribedEvents: [],
    };
  }

  private getPreferenceOrder(eventId: string, selectedEventIds: string[], selectedEventsById: Map<string, EventRecord>): number {
    const event = selectedEventsById.get(eventId);
    if (!event?.eventGroupId) {
      return selectedEventIds.indexOf(eventId);
    }

    const groupIndex = selectedEventIds.findIndex((selectedEventId) => {
      const selectedEvent = selectedEventsById.get(selectedEventId);
      return selectedEvent?.eventGroupId === event.eventGroupId;
    });
    return groupIndex === -1 ? selectedEventIds.indexOf(eventId) : groupIndex;
  }

  private async resolveRankedConfirmationEventIds(
    tx: Prisma.TransactionClient,
    personId: string,
    selectedEventIds: string[],
    selectedEventsById: Map<string, EventRecord>,
    desiredCounts: ReturnType<CurrentUserMajorEventSubscriptionService['resolveRankedDesiredCounts']>,
  ): Promise<string[]> {
    const activeCounts = await Promise.all(
      selectedEventIds.map(async (eventId) => ({
        eventId,
        count: await tx.eventSubscription.count({
          where: {
            eventId,
            deletedAt: null,
            personId: {
              not: personId,
            },
          },
        }),
      })),
    );
    const activeCountByEventId = new Map(activeCounts.map((item) => [item.eventId, item.count]));
    const rankedEvents = selectedEventIds
      .map((eventId) => selectedEventsById.get(eventId))
      .filter((event): event is EventRecord => Boolean(event))
      .map((event) => ({
        id: event.id,
        type: event.type,
        eventGroupId: event.eventGroupId,
        startDate: event.startDate,
        endDate: event.endDate,
        slots: event.slots,
        slotsAvailable: event.slots == null ? null : Math.max(event.slots - (activeCountByEventId.get(event.id) ?? 0), 0),
        autoSubscribe: event.autoSubscribe,
      }));

    const allocatedEventIds = this.majorEventSubscriptions.allocateRankedEventIds(rankedEvents, desiredCounts);
    const allocatedEventIdSet = new Set(allocatedEventIds);
    return selectedEventIds.filter((eventId) => allocatedEventIdSet.has(eventId));
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
}
