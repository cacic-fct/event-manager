import { BadRequestException, NotFoundException, UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuditLogEntityType,
  AuditLogOperation,
  MajorEventSubscriptionFlow,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserContextService } from '../context.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import { EventRecord, EVENT_SELECT, GraphqlContext } from '../selects';
import { CurrentUserMajorEventSubscriptionService } from './subscription.service';
import { CurrentUserPublicEventService } from '../public-event.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { runSerializablePrismaTransaction } from '../../common/serializable-prisma-transaction';
import { AuditLogService } from '../../audit-log/audit-log.service';
import {
  CurrentUserMajorEventFeedItem,
  CurrentUserMajorEventSubscription,
  UpsertCurrentUserMajorEventSubscriptionInput,
} from '../models';
import { RateLimit } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { PUBLIC_MAJOR_EVENT_WHERE, publicRegularSubscriptionEventWhere } from '../../public-events/models';
import { EventFormsService } from '../../event-forms/event-forms.service';

export function isConfirmedSportsOnlySubscription(subscription: {
  subscriptionStatus: SubscriptionStatus;
  selectedEvents: readonly { id: string }[];
  sportsTournamentParticipants: readonly { id: string }[];
}): boolean {
  return (
    subscription.subscriptionStatus === SubscriptionStatus.CONFIRMED &&
    subscription.selectedEvents.length === 0 &&
    subscription.sportsTournamentParticipants.length > 0
  );
}

@Resolver()
export class CurrentUserMajorEventSubscriptionsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly mapper: CurrentUserEventMapperService,
    private readonly publicEvents: CurrentUserPublicEventService,
    private readonly majorEventSubscriptions: CurrentUserMajorEventSubscriptionService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly frozenResources: FrozenResourceService,
    private readonly auditLog: AuditLogService,
    private readonly eventForms: EventFormsService,
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
      imageLicenseAgreementAccepted: subscription.imageLicenseAgreementAccepted,
      selectedEvents: selectedEventsByMajorEventId.get(subscription.majorEventId) ?? [],
      notSubscribedEvents: [],
    }));
  }

  @Query(() => [CurrentUserMajorEventFeedItem], {
    name: 'currentUserMajorEventFeed',
    description:
      'Get current-user major events where the person is subscribed, a lecturer, has an issued major-event certificate, attended an event, or has a sports management role.',
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
      imageLicenseAgreementAccepted: subscription.imageLicenseAgreementAccepted,
      selectedEvents,
      notSubscribedEvents,
    };
  }

  @Mutation(() => CurrentUserMajorEventSubscription, {
    name: 'upsertCurrentUserMajorEventSubscription',
  })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.majorEventSubscription, [{ source: 'args', path: 'input.majorEventId' }])
  async upsertCurrentUserMajorEventSubscription(
    @Args('input', { type: () => UpsertCurrentUserMajorEventSubscriptionInput })
    input: UpsertCurrentUserMajorEventSubscriptionInput,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserMajorEventSubscription> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    await this.frozenResources.assertMajorEventMutable(input.majorEventId, authenticatedUser, 'edit');
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const now = new Date();

    const paymentInfoTableExists = await this.publicEvents.hasPaymentInfoTable();
    let majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        ...PUBLIC_MAJOR_EVENT_WHERE,
        id: input.majorEventId,
      },
      select: this.publicEvents.getMajorEventSelect(paymentInfoTableExists),
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${input.majorEventId} was not found.`);
    }

    if (majorEvent.requiresImageLicenseAgreement && input.imageLicenseAgreementAccepted !== true) {
      throw new BadRequestException(
        `Subscription for major event ${input.majorEventId} requires acceptance of the CACiC image-license agreement.`,
      );
    }

    const isSubscriptionWindowClosed =
      (majorEvent.subscriptionStartDate != null && now < majorEvent.subscriptionStartDate) ||
      (majorEvent.subscriptionEndDate != null && now > majorEvent.subscriptionEndDate);
    const shouldAttemptConsentOnlyUpdate =
      majorEvent.requiresImageLicenseAgreement &&
      input.imageLicenseAgreementAccepted === true &&
      isSubscriptionWindowClosed &&
      majorEvent.endDate > now;
    if (shouldAttemptConsentOnlyUpdate) {
      const acceptedSubscription = await this.runSerializableSubscriptionTransaction(async (tx) => {
        const transactionNow = new Date();
        const transactionMajorEvent = await tx.majorEvent.findFirst({
          where: {
            ...PUBLIC_MAJOR_EVENT_WHERE,
            id: input.majorEventId,
          },
          select: this.publicEvents.getMajorEventSelect(paymentInfoTableExists),
        });
        if (!transactionMajorEvent) {
          throw new NotFoundException(`Major event ${input.majorEventId} was not found.`);
        }

        const transactionWindowClosed =
          (transactionMajorEvent.subscriptionStartDate != null &&
            transactionNow < transactionMajorEvent.subscriptionStartDate) ||
          (transactionMajorEvent.subscriptionEndDate != null &&
            transactionNow > transactionMajorEvent.subscriptionEndDate);
        if (
          !transactionMajorEvent.requiresImageLicenseAgreement ||
          transactionMajorEvent.endDate <= transactionNow ||
          !transactionWindowClosed
        ) {
          return null;
        }

        const existingSubscription = await tx.majorEventSubscription.findFirst({
          where: {
            majorEventId: input.majorEventId,
            personId: person.id,
            deletedAt: null,
            subscriptionStatus: { not: SubscriptionStatus.CANCELED },
            imageLicenseAgreementAccepted: false,
          },
          select: { id: true },
        });
        if (!existingSubscription) {
          return null;
        }

        return tx.majorEventSubscription.update({
          where: { id: existingSubscription.id },
          data: { imageLicenseAgreementAccepted: true },
          select: this.publicEvents.getMajorEventSubscriptionSelect(paymentInfoTableExists),
        });
      });

      if (acceptedSubscription) {
        const { selectedEvents, notSubscribedEvents } =
          await this.majorEventSubscriptions.getMajorEventSubscriptionEvents(person.id, input.majorEventId);
        return {
          id: acceptedSubscription.id,
          majorEventId: acceptedSubscription.majorEventId,
          majorEvent: this.mapper.mapPublicMajorEvent(acceptedSubscription.majorEvent),
          subscriptionStatus: acceptedSubscription.subscriptionStatus,
          amountPaid: acceptedSubscription.amountPaid ?? undefined,
          paymentDate: acceptedSubscription.paymentDate ?? undefined,
          paymentTier: acceptedSubscription.paymentTier ?? undefined,
          imageLicenseAgreementAccepted: acceptedSubscription.imageLicenseAgreementAccepted,
          selectedEvents,
          notSubscribedEvents,
        };
      }
    }
    this.majorEventSubscriptions.ensureMajorEventSubscriptionWindowOpen(majorEvent);

    let selectedEventIds = this.majorEventSubscriptions.normalizeSelectedEventIds(input.selectedEventIds);
    if (selectedEventIds.length === 0) {
      throw new BadRequestException('At least one event must be selected for the major-event subscription.');
    }

    let isRankedSubscription = majorEvent.rankedSubscriptionEnabled;
    let allSubscriptionEvents = await this.prisma.event.findMany({
      where: {
        AND: [publicRegularSubscriptionEventWhere(now), { majorEventId: input.majorEventId }],
      },
      select: EVENT_SELECT,
      orderBy: {
        startDate: 'asc',
      },
    });

    let allSubscriptionEventsById = new Map(allSubscriptionEvents.map((event) => [event.id, event]));
    let requiredAutoSubscribeEventIds = allSubscriptionEvents
      .filter((event) => event.autoSubscribe)
      .map((event) => event.id);
    selectedEventIds = this.majorEventSubscriptions.normalizeSelectedEventIds([
      ...requiredAutoSubscribeEventIds,
      ...selectedEventIds,
    ]);
    let selectedEvents = selectedEventIds
      .map((eventId) => allSubscriptionEventsById.get(eventId))
      .filter((event): event is EventRecord => Boolean(event));

    let selectedEventsById = new Map(selectedEvents.map((event) => [event.id, event]));
    const missingSelectedEventIds = selectedEventIds.filter((eventId) => !selectedEventsById.has(eventId));
    if (missingSelectedEventIds.length > 0) {
      throw new BadRequestException(
        `Some selected events are invalid for major event ${input.majorEventId}: ${missingSelectedEventIds.join(', ')}.`,
      );
    }
    let selectedEventIdSet = new Set(selectedEventIds);

    let desiredCounts: ReturnType<CurrentUserMajorEventSubscriptionService['resolveRankedDesiredCounts']> | null = null;
    if (isRankedSubscription) {
      desiredCounts = this.majorEventSubscriptions.resolveRankedDesiredCounts(majorEvent, allSubscriptionEvents, input);
    } else {
      this.majorEventSubscriptions.ensureMajorEventEventLimits(majorEvent, selectedEvents);
      this.majorEventSubscriptions.ensureMajorEventScheduleHasNoConflicts(selectedEvents);
    }

    const allGroupedEvents = await this.prisma.event.findMany({
      where: {
        AND: [
          publicRegularSubscriptionEventWhere(now),
          {
            majorEventId: input.majorEventId,
            eventGroupId: {
              not: null,
            },
          },
        ],
      },
      select: {
        id: true,
        eventGroupId: true,
      },
    });
    this.majorEventSubscriptions.ensureEventGroupsAreFullySelected(selectedEventIdSet, allGroupedEvents);

    const missingAutoSubscribeEventIds = requiredAutoSubscribeEventIds.filter(
      (eventId) => !selectedEventIdSet.has(eventId),
    );
    if (missingAutoSubscribeEventIds.length > 0) {
      throw new BadRequestException(
        `Auto-subscribe events must be selected: ${missingAutoSubscribeEventIds.join(', ')}.`,
      );
    }

    let selfServicePayment = this.majorEventSubscriptions.resolveSelfServicePayment(majorEvent, input.paymentTier);

    const upsertResult = await this.runSerializableSubscriptionTransaction(async (tx) => {
      const transactionNow = new Date();
      // Repeat every rule that drives the write inside the serializable
      // transaction. The preflight read is only for fast feedback; it must
      // not be the authority when an administrator changes publication,
      // dates, prices, or selectable events concurrently.
      const transactionMajorEvent = await tx.majorEvent.findFirst({
        where: {
          ...PUBLIC_MAJOR_EVENT_WHERE,
          id: input.majorEventId,
        },
        select: this.publicEvents.getMajorEventSelect(paymentInfoTableExists),
      });
      if (!transactionMajorEvent) {
        throw new NotFoundException(`Major event ${input.majorEventId} was not found.`);
      }
      if (transactionMajorEvent.requiresImageLicenseAgreement && input.imageLicenseAgreementAccepted !== true) {
        throw new BadRequestException(
          `Subscription for major event ${input.majorEventId} requires acceptance of the CACiC image-license agreement.`,
        );
      }

      this.majorEventSubscriptions.ensureMajorEventSubscriptionWindowOpen(transactionMajorEvent);

      const transactionAllSubscriptionEvents = await tx.event.findMany({
        where: {
          AND: [publicRegularSubscriptionEventWhere(transactionNow), { majorEventId: input.majorEventId }],
        },
        select: EVENT_SELECT,
        orderBy: {
          startDate: 'asc',
        },
      });
      const transactionEventsById = new Map(transactionAllSubscriptionEvents.map((event) => [event.id, event]));
      const transactionRequiredAutoSubscribeEventIds = transactionAllSubscriptionEvents
        .filter((event) => event.autoSubscribe)
        .map((event) => event.id);
      const transactionSelectedEventIds = this.majorEventSubscriptions.normalizeSelectedEventIds([
        ...transactionRequiredAutoSubscribeEventIds,
        ...input.selectedEventIds,
      ]);
      const transactionSelectedEvents = transactionSelectedEventIds
        .map((eventId) => transactionEventsById.get(eventId))
        .filter((event): event is EventRecord => Boolean(event));
      const transactionSelectedEventsById = new Map(transactionSelectedEvents.map((event) => [event.id, event]));
      const transactionMissingSelectedEventIds = transactionSelectedEventIds.filter(
        (eventId) => !transactionSelectedEventsById.has(eventId),
      );
      if (transactionMissingSelectedEventIds.length > 0) {
        throw new BadRequestException(
          `Some selected events are invalid for major event ${input.majorEventId}: ${transactionMissingSelectedEventIds.join(', ')}.`,
        );
      }
      const transactionSelectedEventIdSet = new Set(transactionSelectedEventIds);
      const transactionDesiredCounts = transactionMajorEvent.rankedSubscriptionEnabled
        ? this.majorEventSubscriptions.resolveRankedDesiredCounts(
            transactionMajorEvent,
            transactionAllSubscriptionEvents,
            input,
          )
        : null;
      if (transactionMajorEvent.rankedSubscriptionEnabled && transactionDesiredCounts) {
        // resolveRankedDesiredCounts performs the ranked count validation;
        // keeping this call inside the transaction protects it from stale
        // price/category configuration.
      } else {
        this.majorEventSubscriptions.ensureMajorEventEventLimits(transactionMajorEvent, transactionSelectedEvents);
        this.majorEventSubscriptions.ensureMajorEventScheduleHasNoConflicts(transactionSelectedEvents);
      }

      const transactionAllGroupedEvents = await tx.event.findMany({
        where: {
          AND: [
            publicRegularSubscriptionEventWhere(transactionNow),
            {
              majorEventId: input.majorEventId,
              eventGroupId: { not: null },
            },
          ],
        },
        select: {
          id: true,
          eventGroupId: true,
        },
      });
      this.majorEventSubscriptions.ensureEventGroupsAreFullySelected(
        transactionSelectedEventIdSet,
        transactionAllGroupedEvents,
      );
      const transactionMissingAutoSubscribeEventIds = transactionRequiredAutoSubscribeEventIds.filter(
        (eventId) => !transactionSelectedEventIdSet.has(eventId),
      );
      if (transactionMissingAutoSubscribeEventIds.length > 0) {
        throw new BadRequestException(
          `Auto-subscribe events must be selected: ${transactionMissingAutoSubscribeEventIds.join(', ')}.`,
        );
      }

      majorEvent = transactionMajorEvent;
      isRankedSubscription = transactionMajorEvent.rankedSubscriptionEnabled;
      allSubscriptionEvents = transactionAllSubscriptionEvents;
      allSubscriptionEventsById = transactionEventsById;
      requiredAutoSubscribeEventIds = transactionRequiredAutoSubscribeEventIds;
      selectedEventIds = transactionSelectedEventIds;
      selectedEvents = transactionSelectedEvents;
      selectedEventsById = transactionSelectedEventsById;
      selectedEventIdSet = transactionSelectedEventIdSet;
      desiredCounts = transactionDesiredCounts;
      selfServicePayment = this.majorEventSubscriptions.resolveSelfServicePayment(
        transactionMajorEvent,
        input.paymentTier,
      );

      const submittedFormIds: string[] = [];
      const existingSubscription = await tx.majorEventSubscription.findFirst({
        where: {
          majorEventId: input.majorEventId,
          personId: person.id,
          deletedAt: null,
        },
        select: {
          id: true,
          subscriptionStatus: true,
          imageLicenseAgreementAccepted: true,
          amountPaid: true,
          paymentTier: true,
          selectedEvents: {
            where: { deletedAt: null },
            select: { id: true },
            take: 1,
          },
          sportsTournamentParticipants: {
            where: { deletedAt: null },
            select: { id: true },
            take: 1,
          },
        },
      });

      if (
        existingSubscription?.sportsTournamentParticipants.length &&
        existingSubscription.paymentTier &&
        (existingSubscription.paymentTier !== selfServicePayment.paymentTier ||
          existingSubscription.amountPaid !== selfServicePayment.amountPaid)
      ) {
        throw new BadRequestException(
          'A faixa de pagamento já foi definida na inscrição do torneio. Use a mesma faixa para as atividades.',
        );
      }

      if (
        existingSubscription?.subscriptionStatus === SubscriptionStatus.CONFIRMED &&
        !isConfirmedSportsOnlySubscription(existingSubscription)
      ) {
        if (majorEvent.requiresImageLicenseAgreement && input.imageLicenseAgreementAccepted === true) {
          const acceptedSubscription = await tx.majorEventSubscription.update({
            where: { id: existingSubscription.id },
            data: { imageLicenseAgreementAccepted: true },
            select: this.publicEvents.getMajorEventSubscriptionSelect(paymentInfoTableExists),
          });
          return {
            subscription: acceptedSubscription,
            createdSubscription: false,
            submittedFormIds,
          };
        }
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
        if (majorEvent.requiresImageLicenseAgreement && input.imageLicenseAgreementAccepted === true) {
          updateData.imageLicenseAgreementAccepted = true;
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
            imageLicenseAgreementAccepted:
              majorEvent.requiresImageLicenseAgreement && input.imageLicenseAgreementAccepted === true,
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
            deletedAt: transactionNow,
          },
        });
      }

      const selectionEventIdsToCreate = selectedEventIds.filter((eventId) => !activeSelectionIdSet.has(eventId));
      if (selectionEventIdsToCreate.length > 0) {
        await tx.majorEventSubscriptionEventSelection.createMany({
          data: selectionEventIdsToCreate.map((eventId) => ({
            subscriptionId: activeMajorEventSubscription.id,
            eventId,
            preferenceOrder: isRankedSubscription
              ? this.getPreferenceOrder(eventId, selectedEventIds, selectedEventsById)
              : null,
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
        submittedFormIds.push(
          ...(await this.eventForms.archiveResponsesForSubscriptionScope(
            tx,
            person.id,
            {
              majorEventId: null,
              selectedEventIds: new Set(eventIdsToArchive),
            },
            now,
          )),
        );
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
      submittedFormIds.push(
        ...(await this.eventForms.submitSubscriptionFlowResponses(
          tx,
          person.id,
          input.formResponses,
          {
            majorEventId: input.majorEventId,
            selectedEventIds: selectedEventIdSet,
            selectedPriceTierId:
              transactionMajorEvent.majorEventPrices
                .flatMap((price) => price.tiers)
                .find((tier) => tier.name === selfServicePayment.paymentTier)?.id ?? null,
          },
          authenticatedUser,
        )),
      );

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
        submittedFormIds,
      };
    });
    await this.eventForms.emitResultsDeltas(upsertResult.submittedFormIds);
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
      imageLicenseAgreementAccepted: subscription.imageLicenseAgreementAccepted,
      selectedEvents: orderedEvents,
      notSubscribedEvents: [],
    };
  }

  private getPreferenceOrder(
    eventId: string,
    selectedEventIds: string[],
    selectedEventsById: Map<string, EventRecord>,
  ): number {
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
        slotsAvailable:
          event.slots == null ? null : Math.max(event.slots - (activeCountByEventId.get(event.id) ?? 0), 0),
        autoSubscribe: event.autoSubscribe,
      }));

    const allocatedEventIds = this.majorEventSubscriptions.allocateRankedEventIds(rankedEvents, desiredCounts);
    const allocatedEventIdSet = new Set(allocatedEventIds);
    return selectedEventIds.filter((eventId) => allocatedEventIdSet.has(eventId));
  }

  private async runSerializableSubscriptionTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await runSerializablePrismaTransaction(this.prisma, operation);
      } catch (error: unknown) {
        if (!isPrismaUniqueConstraintError(error) || attempt >= 1) {
          throw error;
        }
      }
    }
  }
}

function isPrismaUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
