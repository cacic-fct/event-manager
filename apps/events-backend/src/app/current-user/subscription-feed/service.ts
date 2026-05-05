import { Injectable } from '@nestjs/common';
import { CertificateScope } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import {
  CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
  CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT,
} from '../selects';
import {
  CurrentUserEventParticipation,
  CurrentUserSubscriptionFeed,
  CurrentUserSubscriptionFeedItem,
} from '../models';
import {
  PUBLIC_EVENT_GROUP_SELECT,
  PublicEvent,
} from '../../public-events/models';

@Injectable()
export class CurrentUserSubscriptionFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: CurrentUserEventMapperService,
  ) {}

  async getCurrentUserSubscriptionFeed(
    personId: string,
  ): Promise<CurrentUserSubscriptionFeed> {
    const [
      singleEventSubscriptions,
      eventGroupSubscriptions,
      lecturerEvents,
      certificateEvents,
      certificateEventGroups,
    ] = await Promise.all([
      this.prisma.eventSubscription.findMany({
        where: {
          personId,
          deletedAt: null,
          eventGroupSubscriptionId: null,
          event: {
            deletedAt: null,
            majorEventId: null,
            eventGroupId: null,
          },
        },
        select: CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT,
        orderBy: [
          {
            event: {
              startDate: 'desc',
            },
          },
          {
            createdAt: 'desc',
          },
        ],
      }),
      this.prisma.eventGroupSubscription.findMany({
        where: {
          personId,
          deletedAt: null,
          eventGroup: {
            deletedAt: null,
            events: {
              none: {
                deletedAt: null,
                majorEventId: {
                  not: null,
                },
              },
            },
          },
          eventSubscriptions: {
            some: {
              personId,
              deletedAt: null,
              event: {
                deletedAt: null,
                majorEventId: null,
              },
            },
          },
        },
        select: CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
      }),
      this.prisma.eventLecturer.findMany({
        where: {
          personId,
          event: {
            deletedAt: null,
            majorEventId: null,
            eventGroupId: null,
          },
        },
        select: {
          event: {
            select:
              CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT.event.select,
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
            scope: CertificateScope.EVENT,
            event: {
              deletedAt: null,
              majorEventId: null,
            },
          },
        },
        select: {
          config: {
            select: {
              event: {
                select:
                  CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT.event
                    .select,
              },
            },
          },
        },
        orderBy: {
          issuedAt: 'desc',
        },
      }),
      this.prisma.certificate.findMany({
        where: {
          personId,
          deletedAt: null,
          config: {
            deletedAt: null,
            scope: CertificateScope.EVENT_GROUP,
            eventGroup: {
              deletedAt: null,
              events: {
                none: {
                  deletedAt: null,
                  majorEventId: {
                    not: null,
                  },
                },
              },
            },
          },
        },
        select: {
          config: {
            select: {
              eventGroupId: true,
              eventGroup: {
                select: {
                  ...PUBLIC_EVENT_GROUP_SELECT,
                  events: {
                    where: {
                      deletedAt: null,
                      majorEventId: null,
                    },
                    select: {
                      startDate: true,
                    },
                    orderBy: {
                      startDate: 'asc',
                    },
                    take: 1,
                  },
                },
              },
            },
          },
        },
        orderBy: {
          issuedAt: 'desc',
        },
      }),
    ]);

    const subscribedEventIds = new Set(
      singleEventSubscriptions.map((subscription) => subscription.eventId),
    );
    const lecturerEventIds = new Set(
      lecturerEvents.map(({ event }) => event.id),
    );
    const certificateEventsById = new Map<string, PublicEvent>();
    for (const certificate of certificateEvents) {
      const event = certificate.config.event;
      if (event) {
        certificateEventsById.set(event.id, event);
      }
    }
    const certificateEventIds = new Set(certificateEventsById.keys());
    const certificateEventGroupIds = new Set(
      certificateEventGroups
        .map(({ config }) => config.eventGroupId)
        .filter((eventGroupId): eventGroupId is string => !!eventGroupId),
    );

    const eventGroupDatesBySubscriptionId =
      await this.getNonMajorEventGroupFeedDatesBySubscription(
        personId,
        eventGroupSubscriptions.map((subscription) => subscription.id),
      );

    const items: CurrentUserSubscriptionFeedItem[] =
      singleEventSubscriptions.map((subscription) =>
        this.mapper.mapCurrentUserSubscriptionFeedSingleEventItem(
          subscription,
          this.buildParticipation(subscription.eventId, {
            subscribedEventIds,
            lecturerEventIds,
            certificateEventIds,
          }),
        ),
      );

    const eventsById = new Map<string, PublicEvent>();
    for (const { event } of lecturerEvents) {
      eventsById.set(event.id, event);
    }
    for (const [eventId, event] of certificateEventsById) {
      eventsById.set(eventId, event);
    }

    for (const [eventId, event] of eventsById) {
      if (subscribedEventIds.has(eventId)) {
        continue;
      }

      items.push(
        this.mapper.mapCurrentUserEventFeedItem(
          event,
          this.buildParticipation(eventId, {
            subscribedEventIds,
            lecturerEventIds,
            certificateEventIds,
          }),
        ),
      );
    }

    for (const subscription of eventGroupSubscriptions) {
      const date = eventGroupDatesBySubscriptionId.get(subscription.id);
      if (!date) {
        continue;
      }

      items.push(
        this.mapper.mapCurrentUserSubscriptionFeedEventGroupItem(
          subscription,
          date,
          {
            ...this.mapper.getSubscribedParticipation(),
            hasIssuedCertificate: certificateEventGroupIds.has(
              subscription.eventGroupId,
            ),
          },
        ),
      );
    }

    const subscribedEventGroupIds = new Set(
      eventGroupSubscriptions.map((subscription) => subscription.eventGroupId),
    );
    for (const { config } of certificateEventGroups) {
      if (
        !config.eventGroupId ||
        !config.eventGroup ||
        subscribedEventGroupIds.has(config.eventGroupId)
      ) {
        continue;
      }

      const firstEvent = config.eventGroup.events[0];
      if (!firstEvent) {
        continue;
      }

      items.push({
        type: 'EVENT_GROUP',
        eventGroupId: config.eventGroupId,
        eventGroup: this.mapper.mapPublicEventGroup(config.eventGroup),
        date: firstEvent.startDate,
        createdAt: firstEvent.startDate,
        participation: {
          isSubscribed: false,
          isLecturer: false,
          hasIssuedCertificate: true,
        },
      });
    }

    items.sort((first, second) =>
      this.mapper.compareFeedDatesDescending(
        first.date,
        first.createdAt,
        second.date,
        second.createdAt,
      ),
    );

    return {
      items,
    };
  }

  private buildParticipation(
    eventId: string,
    sets: {
      subscribedEventIds: Set<string>;
      lecturerEventIds: Set<string>;
      certificateEventIds: Set<string>;
    },
  ): CurrentUserEventParticipation {
    return {
      isSubscribed: sets.subscribedEventIds.has(eventId),
      isLecturer: sets.lecturerEventIds.has(eventId),
      hasIssuedCertificate: sets.certificateEventIds.has(eventId),
    };
  }

  private async getNonMajorEventGroupFeedDatesBySubscription(
    personId: string,
    eventGroupSubscriptionIds: string[],
  ): Promise<Map<string, Date>> {
    if (eventGroupSubscriptionIds.length === 0) {
      return new Map();
    }

    const eventSubscriptions = await this.prisma.eventSubscription.findMany({
      where: {
        personId,
        deletedAt: null,
        eventGroupSubscriptionId: {
          in: eventGroupSubscriptionIds,
        },
        event: {
          deletedAt: null,
          majorEventId: null,
        },
      },
      select: {
        eventGroupSubscriptionId: true,
        event: {
          select: {
            startDate: true,
          },
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    const datesBySubscriptionId = new Map<string, Date>();
    for (const subscription of eventSubscriptions) {
      if (!subscription.eventGroupSubscriptionId) {
        continue;
      }

      const currentDate = datesBySubscriptionId.get(
        subscription.eventGroupSubscriptionId,
      );
      if (!currentDate || subscription.event.startDate < currentDate) {
        datesBySubscriptionId.set(
          subscription.eventGroupSubscriptionId,
          subscription.event.startDate,
        );
      }
    }

    return datesBySubscriptionId;
  }
}
