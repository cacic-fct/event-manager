import { EventType } from '@cacic-eventos/shared-data-types';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CertificateScope, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MAJOR_EVENT_BASE_SELECT, EventRecord } from '../selects';
import { PUBLIC_EVENT_SELECT, PublicEvent } from '../../public-events/models';
import { CurrentUserMajorEventFeedItem } from '../models';
import { CurrentUserEventMapperService } from '../mapper.service';

@Injectable()
export class CurrentUserMajorEventSubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: CurrentUserEventMapperService,
  ) {}

  normalizeSelectedEventIds(eventIds: string[]): string[] {
    const normalizedEventIds = eventIds
      .map((eventId) => eventId.trim())
      .filter((eventId) => eventId.length > 0);
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

  ensureMajorEventSubscriptionWindowOpen(
    majorEvent: MajorEventBaseRecord,
  ): void {
    const now = new Date();
    if (
      majorEvent.subscriptionStartDate &&
      now < majorEvent.subscriptionStartDate
    ) {
      throw new BadRequestException(
        `Subscriptions for major event ${majorEvent.id} are not open yet.`,
      );
    }

    if (
      majorEvent.subscriptionEndDate &&
      now > majorEvent.subscriptionEndDate
    ) {
      throw new BadRequestException(
        `Subscriptions for major event ${majorEvent.id} are already closed.`,
      );
    }
  }

  ensureMajorEventEventLimits(
    majorEvent: MajorEventBaseRecord,
    selectedEvents: EventRecord[],
  ): void {
    const selectedCourseCount = selectedEvents.filter(
      (event) => event.type === EventType.MINICURSO,
    ).length;
    if (
      majorEvent.maxCoursesPerAttendee != null &&
      selectedCourseCount > majorEvent.maxCoursesPerAttendee
    ) {
      throw new BadRequestException(
        `Selected ${selectedCourseCount} courses, but maximum is ${majorEvent.maxCoursesPerAttendee}.`,
      );
    }

    const selectedLectureCount = selectedEvents.filter(
      (event) => event.type === EventType.PALESTRA,
    ).length;
    if (
      majorEvent.maxLecturesPerAttendee != null &&
      selectedLectureCount > majorEvent.maxLecturesPerAttendee
    ) {
      throw new BadRequestException(
        `Selected ${selectedLectureCount} lectures, but maximum is ${majorEvent.maxLecturesPerAttendee}.`,
      );
    }
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

  async getSelectedEventsByMajorEvent(
    personId: string,
    majorEventIds: string[],
  ): Promise<Map<string, PublicEvent[]>> {
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

    const selectedEventsByMajorEventId = new Map<string, PublicEvent[]>();
    for (const subscription of eventSubscriptions) {
      const majorEventId = subscription.event.majorEventId;
      if (!majorEventId) {
        continue;
      }

      const events = selectedEventsByMajorEventId.get(majorEventId) ?? [];
      events.push(subscription.event);
      selectedEventsByMajorEventId.set(majorEventId, events);
    }

    return selectedEventsByMajorEventId;
  }

  async getSelectedEventsForMajorEventSubscription(
    personId: string,
    majorEventId: string,
  ): Promise<PublicEvent[]> {
    const eventSubscriptions = await this.prisma.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        event: {
          deletedAt: null,
          majorEventId,
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

    return eventSubscriptions.map((subscription) => subscription.event);
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
        subscriptions: {
          where: {
            personId,
            deletedAt: null,
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
      const { subscriptions, ...publicEvent } = event;
      if (subscriptions.length > 0) {
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
    const [subscriptions, lecturerMajorEvents, certificates] =
      await Promise.all([
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

    const subscribedMajorEventIds = new Set(
      subscriptions.map((subscription) => subscription.majorEventId),
    );
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

    const selectedEventsByMajorEventId =
      await this.getSelectedEventsByMajorEvent(personId, [
        ...subscribedMajorEventIds,
      ]);

    const itemsByMajorEventId = new Map<
      string,
      CurrentUserMajorEventFeedItem
    >();
    for (const subscription of subscriptions) {
      itemsByMajorEventId.set(subscription.majorEventId, {
        id: subscription.id,
        majorEventId: subscription.majorEventId,
        majorEvent: this.mapper.mapPublicMajorEvent(subscription.majorEvent),
        subscriptionStatus: subscription.subscriptionStatus,
        amountPaid: subscription.amountPaid ?? undefined,
        paymentDate: subscription.paymentDate ?? undefined,
        paymentTier: subscription.paymentTier ?? undefined,
        selectedEvents:
          selectedEventsByMajorEventId.get(subscription.majorEventId) ?? [],
        notSubscribedEvents: [],
        participation: {
          isSubscribed: true,
          isLecturer: lecturerMajorEventIds.has(subscription.majorEventId),
          hasIssuedCertificate: certificateMajorEventIds.has(
            subscription.majorEventId,
          ),
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
          hasIssuedCertificate: certificateMajorEventIds.has(
            event.majorEventId,
          ),
        },
      });
    }

    for (const { config } of certificates) {
      if (
        !config.majorEventId ||
        itemsByMajorEventId.has(config.majorEventId)
      ) {
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
      (left, right) =>
        right.majorEvent.startDate.getTime() -
        left.majorEvent.startDate.getTime(),
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
                    majorEventId: true,
                  },
                },
              }
            : {}),
        },
      },
    } satisfies Prisma.MajorEventSubscriptionSelect;
  }
}

type MajorEventBaseRecord = Prisma.MajorEventGetPayload<{
  select: typeof MAJOR_EVENT_BASE_SELECT;
}>;
