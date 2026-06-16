import { EventType } from '@cacic-fct/shared-data-types';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CertificateScope, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MAJOR_EVENT_BASE_SELECT, EventRecord } from '../selects';
import { PUBLIC_EVENT_SELECT, PublicEvent } from '../../public-events/models';
import { CurrentUserMajorEventFeedItem } from '../models';
import { CurrentUserEventMapperService } from '../mapper.service';
import { EventSubscriptionCountersService } from '../../events/subscription-counters.service';

type RankedCategory = 'course' | 'lecture' | 'uncategorized';

export interface RankedDesiredCounts {
  desiredCourses: number;
  desiredLectures: number;
  desiredUncategorized: number;
}

interface RankedEventLike {
  id: string;
  type: string;
  eventGroupId: string | null;
  startDate: Date;
  endDate: Date;
  slots: number | null;
  slotsAvailable?: number | null;
  autoSubscribe?: boolean | null;
}

@Injectable()
export class CurrentUserMajorEventSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: CurrentUserEventMapperService,
    private readonly counters: EventSubscriptionCountersService = new EventSubscriptionCountersService(),
  ) {}

  normalizeSelectedEventIds(eventIds: string[]): string[] {
    const normalizedEventIds = eventIds.map((eventId) => eventId.trim()).filter((eventId) => eventId.length > 0);
    return [...new Set(normalizedEventIds)];
  }

  normalizeAmountPaid(amountPaid?: number | null): number | null | undefined {
    if (amountPaid === undefined) {
      return undefined;
    }

    if (amountPaid === null) {
      return null;
    }

    if (amountPaid < 0) {
      throw new BadRequestException('amountPaid cannot be negative.');
    }

    return amountPaid;
  }

  normalizePaymentTier(paymentTier?: string | null): string | null | undefined {
    if (paymentTier === undefined) {
      return undefined;
    }

    if (paymentTier === null) {
      return null;
    }

    const normalizedPaymentTier = paymentTier.trim();
    if (normalizedPaymentTier.length === 0) {
      return null;
    }

    return normalizedPaymentTier;
  }

  resolveSelfServicePayment(
    majorEvent: MajorEventBaseRecord,
    paymentTierInput?: string | null,
  ): {
    amountPaid: number | null;
    paymentTier: string | null;
  } {
    if (!majorEvent.isPaymentRequired) {
      return {
        amountPaid: null,
        paymentTier: null,
      };
    }

    const tiers = majorEvent.majorEventPrices.flatMap((price) => price.tiers);
    if (tiers.length === 0) {
      return {
        amountPaid: null,
        paymentTier: null,
      };
    }

    if (tiers.length === 1) {
      const [tier] = tiers;
      return {
        amountPaid: tier.value,
        paymentTier: tier.name,
      };
    }

    const normalizedPaymentTier = this.normalizePaymentTier(paymentTierInput);
    if (!normalizedPaymentTier) {
      throw new BadRequestException('paymentTier is required for this major event.');
    }

    const selectedTier = tiers.find((tier) => tier.name.trim().toLowerCase() === normalizedPaymentTier.toLowerCase());
    if (!selectedTier) {
      throw new BadRequestException('paymentTier is not valid for this major event.');
    }

    return {
      amountPaid: selectedTier.value,
      paymentTier: selectedTier.name,
    };
  }

  normalizeDesiredCount(value: number | null | undefined, fallback: number): number {
    if (value === null || value === undefined) {
      return fallback;
    }

    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException('Desired event counts must be non-negative integers.');
    }

    return value;
  }

  resolveRankedDesiredCounts(
    majorEvent: MajorEventBaseRecord,
    events: RankedEventLike[],
    input: {
      desiredCourses?: number | null;
      desiredLectures?: number | null;
      desiredUncategorized?: number | null;
    },
  ): RankedDesiredCounts {
    const capacity = this.getRankedCapacityByCategory(majorEvent, events);
    const counts = {
      desiredCourses: this.normalizeDesiredCount(input.desiredCourses, capacity.course),
      desiredLectures: this.normalizeDesiredCount(input.desiredLectures, capacity.lecture),
      desiredUncategorized: this.normalizeDesiredCount(input.desiredUncategorized, capacity.uncategorized),
    };

    if (counts.desiredCourses > capacity.course) {
      throw new BadRequestException(`Desired course count exceeds available course choices (${capacity.course}).`);
    }
    if (counts.desiredLectures > capacity.lecture) {
      throw new BadRequestException(`Desired lecture count exceeds available lecture choices (${capacity.lecture}).`);
    }
    if (counts.desiredUncategorized > capacity.uncategorized) {
      throw new BadRequestException(
        `Desired uncategorized event count exceeds available uncategorized choices (${capacity.uncategorized}).`,
      );
    }

    const autoCounts = this.countEventsByCategory(events.filter((event) => event.autoSubscribe));
    if (
      counts.desiredCourses < autoCounts.course ||
      counts.desiredLectures < autoCounts.lecture ||
      counts.desiredUncategorized < autoCounts.uncategorized
    ) {
      throw new BadRequestException('Desired counts cannot be lower than automatic subscriptions.');
    }

    return counts;
  }

  allocateRankedEventIds(events: RankedEventLike[], desiredCounts: RankedDesiredCounts): string[] {
    const orderedEvents = [...events];
    const eventsByPreferenceItem = this.groupRankedEventsByPreferenceItem(orderedEvents);
    const selected: RankedEventLike[] = [];
    const counts = {
      course: 0,
      lecture: 0,
      uncategorized: 0,
    };

    for (const item of eventsByPreferenceItem) {
      const itemCounts = this.countEventsByCategory(item.events);
      const isAutomatic = item.events.every((event) => event.autoSubscribe);
      const desired = {
        course: Math.max(desiredCounts.desiredCourses, counts.course + (isAutomatic ? itemCounts.course : 0)),
        lecture: Math.max(desiredCounts.desiredLectures, counts.lecture + (isAutomatic ? itemCounts.lecture : 0)),
        uncategorized: Math.max(
          desiredCounts.desiredUncategorized,
          counts.uncategorized + (isAutomatic ? itemCounts.uncategorized : 0),
        ),
      };

      if (
        !isAutomatic &&
        (counts.course + itemCounts.course > desired.course ||
          counts.lecture + itemCounts.lecture > desired.lecture ||
          counts.uncategorized + itemCounts.uncategorized > desired.uncategorized)
      ) {
        continue;
      }

      if (!this.itemHasAvailableSlots(item.events)) {
        continue;
      }

      if (this.itemConflictsWithSelected(item.events, selected)) {
        continue;
      }

      selected.push(...item.events);
      counts.course += itemCounts.course;
      counts.lecture += itemCounts.lecture;
      counts.uncategorized += itemCounts.uncategorized;
    }

    return selected.map((event) => event.id);
  }

  ensureMajorEventSubscriptionWindowOpen(majorEvent: MajorEventBaseRecord): void {
    const now = new Date();
    if (majorEvent.subscriptionStartDate && now < majorEvent.subscriptionStartDate) {
      throw new BadRequestException(`Subscriptions for major event ${majorEvent.id} are not open yet.`);
    }

    if (majorEvent.subscriptionEndDate && now > majorEvent.subscriptionEndDate) {
      throw new BadRequestException(`Subscriptions for major event ${majorEvent.id} are already closed.`);
    }
  }

  ensureMajorEventEventLimits(majorEvent: MajorEventBaseRecord, selectedEvents: EventRecord[]): void {
    const selectedCourseCount = selectedEvents.filter((event) => event.type === EventType.MINICURSO).length;
    if (majorEvent.maxCoursesPerAttendee != null && selectedCourseCount > majorEvent.maxCoursesPerAttendee) {
      throw new BadRequestException(
        `Selected ${selectedCourseCount} courses, but maximum is ${majorEvent.maxCoursesPerAttendee}.`,
      );
    }

    const selectedLectureCount = selectedEvents.filter((event) => event.type === EventType.PALESTRA).length;
    if (majorEvent.maxLecturesPerAttendee != null && selectedLectureCount > majorEvent.maxLecturesPerAttendee) {
      throw new BadRequestException(
        `Selected ${selectedLectureCount} lectures, but maximum is ${majorEvent.maxLecturesPerAttendee}.`,
      );
    }
  }

  ensureMajorEventScheduleHasNoConflicts(selectedEvents: EventRecord[]): void {
    for (let leftIndex = 0; leftIndex < selectedEvents.length; leftIndex += 1) {
      const leftEvent = selectedEvents[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < selectedEvents.length; rightIndex += 1) {
        const rightEvent = selectedEvents[rightIndex];
        if (
          (!leftEvent.eventGroupId || leftEvent.eventGroupId !== rightEvent.eventGroupId) &&
          leftEvent.startDate < rightEvent.endDate &&
          leftEvent.endDate > rightEvent.startDate
        ) {
          throw new BadRequestException(`Events ${leftEvent.id} and ${rightEvent.id} have conflicting schedules.`);
        }
      }
    }
  }

  ensureEventGroupsAreFullySelected(
    selectedEventIds: Set<string>,
    groupedEvents: Array<{
      eventGroupId: string | null;
      id: string;
    }>,
  ): void {
    const eventIdsByGroupId = new Map<string, string[]>();
    for (const event of groupedEvents) {
      if (!event.eventGroupId) {
        continue;
      }

      const eventIds = eventIdsByGroupId.get(event.eventGroupId) ?? [];
      eventIds.push(event.id);
      eventIdsByGroupId.set(event.eventGroupId, eventIds);
    }

    for (const [eventGroupId, eventIds] of eventIdsByGroupId) {
      if (
        eventIds.some((eventId) => selectedEventIds.has(eventId)) &&
        eventIds.some((eventId) => !selectedEventIds.has(eventId))
      ) {
        throw new BadRequestException(`All events from group ${eventGroupId} must be selected together.`);
      }
    }
  }

  async refreshEventSubscriptionCounters(tx: Prisma.TransactionClient, eventIds: string[]): Promise<void> {
    await this.counters.refresh(tx, eventIds);
  }

  resolveNextSubscriptionStatus(
    isPaymentRequired: boolean,
    currentStatus?: SubscriptionStatus,
  ): SubscriptionStatus | undefined {
    if (!isPaymentRequired) {
      return SubscriptionStatus.CONFIRMED;
    }

    if (!currentStatus || currentStatus === SubscriptionStatus.CANCELED) {
      return SubscriptionStatus.WAITING_RECEIPT_UPLOAD;
    }

    if (
      currentStatus === SubscriptionStatus.REJECTED_NO_SLOTS ||
      currentStatus === SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT
    ) {
      return SubscriptionStatus.RECEIPT_UNDER_REVIEW;
    }

    return undefined;
  }

  async getSelectedEventsByMajorEvent(personId: string, majorEventIds: string[]): Promise<Map<string, PublicEvent[]>> {
    if (majorEventIds.length === 0) {
      return new Map();
    }

    const eventSelections = await this.prisma.majorEventSubscriptionEventSelection.findMany({
      where: {
        deletedAt: null,
        subscription: {
          personId,
          deletedAt: null,
          majorEventId: {
            in: majorEventIds,
          },
        },
        event: {
          deletedAt: null,
        },
      },
      select: {
        subscription: {
          select: {
            majorEventId: true,
          },
        },
        event: {
          select: PUBLIC_EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    const selectedEventsByMajorEventId = new Map<string, PublicEvent[]>();
    for (const selection of eventSelections) {
      const majorEventId = selection.subscription.majorEventId;
      const events = selectedEventsByMajorEventId.get(majorEventId) ?? [];
      events.push(selection.event);
      selectedEventsByMajorEventId.set(majorEventId, events);
    }

    return selectedEventsByMajorEventId;
  }

  async getConfirmedEventsByMajorEvent(personId: string, majorEventIds: string[]): Promise<Map<string, PublicEvent[]>> {
    if (majorEventIds.length === 0) {
      return new Map();
    }

    const eventSubscriptions = await this.prisma.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        event: {
          deletedAt: null,
          majorEventId: {
            in: majorEventIds,
          },
        },
      },
      select: {
        event: {
          select: PUBLIC_EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    const confirmedEventsByMajorEventId = new Map<string, PublicEvent[]>();
    for (const subscription of eventSubscriptions) {
      const majorEventId = subscription.event.majorEventId;
      if (!majorEventId) {
        continue;
      }

      const events = confirmedEventsByMajorEventId.get(majorEventId) ?? [];
      events.push(subscription.event);
      confirmedEventsByMajorEventId.set(majorEventId, events);
    }

    return confirmedEventsByMajorEventId;
  }

  async getSelectedEventsForMajorEventSubscription(personId: string, majorEventId: string): Promise<PublicEvent[]> {
    const eventSelections = await this.prisma.majorEventSubscriptionEventSelection.findMany({
      where: {
        deletedAt: null,
        subscription: {
          personId,
          majorEventId,
          deletedAt: null,
        },
        event: {
          deletedAt: null,
        },
      },
      select: {
        event: {
          select: PUBLIC_EVENT_SELECT,
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    return eventSelections.map((selection) => selection.event);
  }

  async getMajorEventSubscriptionEvents(
    personId: string,
    majorEventId: string,
  ): Promise<{
    selectedEvents: PublicEvent[];
    notSubscribedEvents: PublicEvent[];
  }> {
    const events = await this.prisma.event.findMany({
      where: {
        majorEventId,
        deletedAt: null,
        publiclyVisible: true,
        allowSubscription: true,
      },
      select: {
        ...PUBLIC_EVENT_SELECT,
        majorEventSelections: {
          where: {
            deletedAt: null,
            subscription: {
              personId,
              deletedAt: null,
              majorEventId,
            },
          },
          select: {
            eventId: true,
          },
          take: 1,
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    const selectedEvents: PublicEvent[] = [];
    const notSubscribedEvents: PublicEvent[] = [];

    for (const event of events) {
      const { majorEventSelections, ...publicEvent } = event;
      if (majorEventSelections.length > 0) {
        selectedEvents.push(publicEvent);
      } else {
        notSubscribedEvents.push(publicEvent);
      }
    }

    return {
      selectedEvents,
      notSubscribedEvents,
    };
  }

  async getCurrentUserMajorEventFeedItems(
    personId: string,
    paymentInfoTableExists: boolean,
  ): Promise<CurrentUserMajorEventFeedItem[]> {
    const [subscriptions, lecturerMajorEvents, certificates] = await Promise.all([
      this.prisma.majorEventSubscription.findMany({
        where: {
          personId,
          deletedAt: null,
          majorEvent: {
            deletedAt: null,
          },
        },
        select: this.getMajorEventSubscriptionSelect(paymentInfoTableExists),
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.eventLecturer.findMany({
        where: {
          personId,
          event: {
            deletedAt: null,
            majorEvent: {
              deletedAt: null,
            },
          },
        },
        select: {
          event: {
            select: {
              majorEventId: true,
              majorEvent: {
                select: MAJOR_EVENT_BASE_SELECT,
              },
            },
          },
        },
        orderBy: {
          event: {
            startDate: 'desc',
          },
        },
      }),
      this.prisma.certificate.findMany({
        where: {
          personId,
          deletedAt: null,
          config: {
            deletedAt: null,
            scope: CertificateScope.MAJOR_EVENT,
            majorEvent: {
              deletedAt: null,
            },
          },
        },
        select: {
          config: {
            select: {
              majorEventId: true,
              majorEvent: {
                select: MAJOR_EVENT_BASE_SELECT,
              },
            },
          },
        },
        orderBy: {
          issuedAt: 'desc',
        },
      }),
    ]);

    const subscribedMajorEventIds = new Set(subscriptions.map((subscription) => subscription.majorEventId));
    const lecturerMajorEventIds = new Set(
      lecturerMajorEvents
        .map(({ event }) => event.majorEventId)
        .filter((majorEventId): majorEventId is string => !!majorEventId),
    );
    const certificateMajorEventIds = new Set(
      certificates
        .map(({ config }) => config.majorEventId)
        .filter((majorEventId): majorEventId is string => !!majorEventId),
    );

    const selectedEventsByMajorEventId = await this.getSelectedEventsByMajorEvent(personId, [
      ...subscribedMajorEventIds,
    ]);

    const itemsByMajorEventId = new Map<string, CurrentUserMajorEventFeedItem>();
    for (const subscription of subscriptions) {
      itemsByMajorEventId.set(subscription.majorEventId, {
        id: subscription.id,
        majorEventId: subscription.majorEventId,
        majorEvent: this.mapper.mapPublicMajorEvent(subscription.majorEvent),
        subscriptionStatus: subscription.subscriptionStatus,
        amountPaid: subscription.amountPaid ?? undefined,
        paymentDate: subscription.paymentDate ?? undefined,
        paymentTier: subscription.paymentTier ?? undefined,
        selectedEvents: selectedEventsByMajorEventId.get(subscription.majorEventId) ?? [],
        notSubscribedEvents: [],
        participation: {
          isSubscribed: true,
          isLecturer: lecturerMajorEventIds.has(subscription.majorEventId),
          hasIssuedCertificate: certificateMajorEventIds.has(subscription.majorEventId),
        },
      });
    }

    for (const { event } of lecturerMajorEvents) {
      if (!event.majorEventId || itemsByMajorEventId.has(event.majorEventId)) {
        continue;
      }

      itemsByMajorEventId.set(event.majorEventId, {
        id: event.majorEventId,
        majorEventId: event.majorEventId,
        majorEvent: this.mapper.mapPublicMajorEvent(event.majorEvent),
        selectedEvents: [],
        notSubscribedEvents: [],
        participation: {
          isSubscribed: false,
          isLecturer: true,
          hasIssuedCertificate: certificateMajorEventIds.has(event.majorEventId),
        },
      });
    }

    for (const { config } of certificates) {
      if (!config.majorEventId || itemsByMajorEventId.has(config.majorEventId)) {
        continue;
      }

      itemsByMajorEventId.set(config.majorEventId, {
        id: config.majorEventId,
        majorEventId: config.majorEventId,
        majorEvent: this.mapper.mapPublicMajorEvent(config.majorEvent),
        selectedEvents: [],
        notSubscribedEvents: [],
        participation: {
          isSubscribed: false,
          isLecturer: lecturerMajorEventIds.has(config.majorEventId),
          hasIssuedCertificate: true,
        },
      });
    }

    return [...itemsByMajorEventId.values()].sort(
      (left, right) => right.majorEvent.startDate.getTime() - left.majorEvent.startDate.getTime(),
    );
  }

  private getMajorEventSubscriptionSelect(paymentInfoTableExists: boolean) {
    return {
      id: true,
      majorEventId: true,
      subscriptionStatus: true,
      amountPaid: true,
      paymentDate: true,
      paymentTier: true,
      majorEvent: {
        select: {
          ...MAJOR_EVENT_BASE_SELECT,
          ...(paymentInfoTableExists
            ? {
                paymentInfo: {
                  select: {
                    id: true,
                    bankName: true,
                    agency: true,
                    account: true,
                    holder: true,
                    document: true,
                    pixKey: true,
                    pixCity: true,
                    majorEventId: true,
                  },
                },
              }
            : {}),
        },
      },
    } satisfies Prisma.MajorEventSubscriptionSelect;
  }

  private getRankedCapacityByCategory(
    majorEvent: MajorEventBaseRecord,
    events: RankedEventLike[],
  ): Record<RankedCategory, number> {
    const counts = this.countEventsByCategory(events);
    return {
      course: majorEvent.maxCoursesPerAttendee ?? counts.course,
      lecture: majorEvent.maxLecturesPerAttendee ?? counts.lecture,
      uncategorized: majorEvent.maxUncategorizedPerAttendee ?? counts.uncategorized,
    };
  }

  private countEventsByCategory(events: RankedEventLike[]): Record<RankedCategory, number> {
    return events.reduce(
      (counts, event) => {
        counts[this.getEventCategory(event)] += 1;
        return counts;
      },
      {
        course: 0,
        lecture: 0,
        uncategorized: 0,
      } satisfies Record<RankedCategory, number>,
    );
  }

  private getEventCategory(event: RankedEventLike): RankedCategory {
    if (event.type === EventType.MINICURSO) {
      return 'course';
    }
    if (event.type === EventType.PALESTRA) {
      return 'lecture';
    }
    return 'uncategorized';
  }

  private groupRankedEventsByPreferenceItem(events: RankedEventLike[]): Array<{ key: string; events: RankedEventLike[] }> {
    const groups = new Map<string, RankedEventLike[]>();
    for (const event of events) {
      const key = event.eventGroupId ?? event.id;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }

    return [...groups.entries()].map(([key, groupEvents]) => ({
      key,
      events: groupEvents,
    }));
  }

  private itemHasAvailableSlots(events: RankedEventLike[]): boolean {
    return events.every((event) => event.slots == null || event.slotsAvailable == null || event.slotsAvailable > 0);
  }

  private itemConflictsWithSelected(events: RankedEventLike[], selectedEvents: RankedEventLike[]): boolean {
    return events.some((event) =>
      selectedEvents.some(
        (selectedEvent) =>
          (!event.eventGroupId || event.eventGroupId !== selectedEvent.eventGroupId) &&
          event.startDate < selectedEvent.endDate &&
          event.endDate > selectedEvent.startDate,
      ),
    );
  }
}

type MajorEventBaseRecord = Prisma.MajorEventGetPayload<{
  select: typeof MAJOR_EVENT_BASE_SELECT;
}>;
