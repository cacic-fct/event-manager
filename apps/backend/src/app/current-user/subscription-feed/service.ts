import { Injectable } from '@nestjs/common';
import { CertificateScope } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import {
  CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT,
  CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT,
  PublicEventRecord,
} from '../selects';
import { CurrentUserEventParticipation, CurrentUserSubscriptionFeed, CurrentUserSubscriptionFeedItem } from '../models';
import { PUBLIC_EVENT_GROUP_SELECT, PUBLIC_EVENT_WHERE } from '../../public-events/models';

@Injectable()
export class CurrentUserSubscriptionFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: CurrentUserEventMapperService,
  ) {}

  async getCurrentUserSubscriptionFeed(personId: string): Promise<CurrentUserSubscriptionFeed> {
    const [
      singleEventSubscriptions,
      eventGroupSubscriptions,
      lecturerEvents,
      lecturerEventGroups,
      certificateEvents,
      certificateEventGroups,
      attendanceEvents,
      eventInterests,
      eventGroupInterests,
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
            select: CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT.event.select,
          },
        },
        orderBy: {
          event: {
            startDate: 'desc',
          },
        },
      }),
      this.prisma.eventLecturer.findMany({
        where: {
          personId,
          event: {
            deletedAt: null,
            majorEventId: null,
            eventGroupId: {
              not: null,
            },
            eventGroup: {
              deletedAt: null,
            },
          },
        },
        select: {
          event: {
            select: {
              startDate: true,
              majorEventId: true,
              eventGroupId: true,
              eventGroup: {
                select: PUBLIC_EVENT_GROUP_SELECT,
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
            scope: CertificateScope.EVENT,
            event: {
              deletedAt: null,
              majorEventId: null,
              eventGroupId: null,
            },
          },
        },
        select: {
          config: {
            select: {
              event: {
                select: CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT.event.select,
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
      this.prisma.eventAttendance.findMany({
        where: {
          personId,
          status: 'PRESENT',
          event: {
            AND: [PUBLIC_EVENT_WHERE],
          },
        },
        select: {
          event: {
            select: CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT.event.select,
          },
        },
        orderBy: {
          attendedAt: 'desc',
        },
      }),
      this.prisma.eventInterest.findMany({
        where: {
          personId,
          deletedAt: null,
          event: {
            AND: [PUBLIC_EVENT_WHERE, { majorEventId: null }],
          },
        },
        select: {
          id: true,
          createdAt: true,
          event: {
            select: CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT.event.select,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.eventInterest.findMany({
        where: {
          personId,
          deletedAt: null,
          eventGroup: {
            deletedAt: null,
            events: {
              some: { AND: [PUBLIC_EVENT_WHERE, { majorEventId: null }] },
            },
          },
        },
        select: {
          id: true,
          createdAt: true,
          eventGroup: {
            select: {
              ...PUBLIC_EVENT_GROUP_SELECT,
              events: {
                where: { AND: [PUBLIC_EVENT_WHERE, { majorEventId: null }] },
                select: { startDate: true },
                orderBy: { startDate: 'asc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const subscribedEventIds = new Set(singleEventSubscriptions.map((subscription) => subscription.eventId));
    const interestedEventIds = new Set<string>();
    for (const interest of eventInterests) {
      if (interest.event) {
        interestedEventIds.add(interest.event.id);
      }
    }
    const interestedEventGroupIds = new Set<string>();
    for (const interest of eventGroupInterests) {
      if (interest.eventGroup) {
        interestedEventGroupIds.add(interest.eventGroup.id);
      }
    }
    const lecturerEventIds = new Set(lecturerEvents.map(({ event }) => event.id));
    const attendanceEventsById = new Map<string, PublicEventRecord>();
    for (const { event } of attendanceEvents) {
      attendanceEventsById.set(event.id, event);
    }
    const certificateEventsById = new Map<string, PublicEventRecord>();
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

    const eventGroupDatesBySubscriptionId = await this.getNonMajorEventGroupFeedDatesBySubscription(
      personId,
      eventGroupSubscriptions.map((subscription) => subscription.id),
    );

    const items: CurrentUserSubscriptionFeedItem[] = singleEventSubscriptions.map((subscription) =>
      this.mapper.mapCurrentUserSubscriptionFeedSingleEventItem(
        subscription,
        this.buildParticipation(subscription.eventId, {
          subscribedEventIds,
          interestedEventIds,
          lecturerEventIds,
          certificateEventIds,
        }),
      ),
    );

    const eventsById = new Map<string, PublicEventRecord>();
    for (const [eventId, event] of attendanceEventsById) {
      if (!event.eventGroupId && !event.majorEventId) {
        eventsById.set(eventId, event);
      }
    }
    for (const { event } of lecturerEvents) {
      eventsById.set(event.id, event);
    }
    for (const [eventId, event] of certificateEventsById) {
      if (!event.eventGroupId && !event.majorEventId) {
        eventsById.set(eventId, event);
      }
    }
    for (const { event } of eventInterests) {
      if (event) {
        eventsById.set(event.id, event);
      }
    }

    for (const [eventId, event] of eventsById) {
      if (subscribedEventIds.has(eventId)) {
        continue;
      }

      items.push(
        this.mapper.mapCurrentUserEventFeedItem(
          this.mapper.mapPublicEvent(event),
          this.buildParticipation(eventId, {
            subscribedEventIds,
            interestedEventIds,
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
        this.mapper.mapCurrentUserSubscriptionFeedEventGroupItem(subscription, date, {
          ...this.mapper.getSubscribedParticipation(),
          ...(interestedEventGroupIds.has(subscription.eventGroupId) ? { isInterested: true } : {}),
          hasIssuedCertificate: certificateEventGroupIds.has(subscription.eventGroupId),
        }),
      );
    }

    const subscribedEventGroupIds = new Set(eventGroupSubscriptions.map((subscription) => subscription.eventGroupId));
    const attendanceEventGroupsById = new Map<
      string,
      {
        eventGroup: NonNullable<PublicEventRecord['eventGroup']>;
        firstEventStartDate: Date;
      }
    >();
    for (const event of attendanceEventsById.values()) {
      if (
        !event.eventGroupId ||
        !event.eventGroup ||
        event.majorEventId ||
        subscribedEventGroupIds.has(event.eventGroupId)
      ) {
        continue;
      }

      const current = attendanceEventGroupsById.get(event.eventGroupId);
      if (!current || event.startDate < current.firstEventStartDate) {
        attendanceEventGroupsById.set(event.eventGroupId, {
          eventGroup: event.eventGroup,
          firstEventStartDate: event.startDate,
        });
      }
    }
    const lecturerEventGroupsById = new Map<
      string,
      {
        eventGroup: NonNullable<(typeof lecturerEventGroups)[number]['event']['eventGroup']>;
        firstEventStartDate: Date;
      }
    >();
    for (const { event } of lecturerEventGroups) {
      if (
        !event.eventGroupId ||
        !event.eventGroup ||
        event.majorEventId ||
        subscribedEventGroupIds.has(event.eventGroupId)
      ) {
        continue;
      }

      const current = lecturerEventGroupsById.get(event.eventGroupId);
      if (!current || event.startDate < current.firstEventStartDate) {
        lecturerEventGroupsById.set(event.eventGroupId, {
          eventGroup: event.eventGroup,
          firstEventStartDate: event.startDate,
        });
      }
    }

    for (const [eventGroupId, group] of lecturerEventGroupsById) {
      if (certificateEventGroupIds.has(eventGroupId)) {
        continue;
      }

      items.push({
        type: 'EVENT_GROUP',
        eventGroupId,
        eventGroup: this.mapper.mapPublicEventGroup(group.eventGroup),
        date: group.firstEventStartDate,
        createdAt: group.firstEventStartDate,
        participation: {
          isSubscribed: false,
          isLecturer: true,
          ...(interestedEventGroupIds.has(eventGroupId) ? { isInterested: true } : {}),
          hasIssuedCertificate: false,
        },
      });
    }

    for (const [eventGroupId, group] of attendanceEventGroupsById) {
      if (lecturerEventGroupsById.has(eventGroupId) || certificateEventGroupIds.has(eventGroupId)) {
        continue;
      }

      items.push({
        type: 'EVENT_GROUP',
        eventGroupId,
        eventGroup: this.mapper.mapPublicEventGroup(group.eventGroup),
        date: group.firstEventStartDate,
        createdAt: group.firstEventStartDate,
        participation: {
          isSubscribed: false,
          isLecturer: false,
          ...(interestedEventGroupIds.has(eventGroupId) ? { isInterested: true } : {}),
          hasIssuedCertificate: false,
        },
      });
    }

    for (const { config } of certificateEventGroups) {
      if (!config.eventGroupId || !config.eventGroup || subscribedEventGroupIds.has(config.eventGroupId)) {
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
          isLecturer: lecturerEventGroupsById.has(config.eventGroupId),
          ...(interestedEventGroupIds.has(config.eventGroupId) ? { isInterested: true } : {}),
          hasIssuedCertificate: true,
        },
      });
    }

    const interestedEventGroupsById = new Map<
      string,
      {
        eventGroup: NonNullable<(typeof eventGroupInterests)[number]['eventGroup']>;
        firstEventStartDate: Date;
        createdAt: Date;
      }
    >();
    for (const interest of eventGroupInterests) {
      if (!interest.eventGroup) {
        continue;
      }
      const firstEvent = interest.eventGroup.events[0];
      if (!firstEvent || subscribedEventGroupIds.has(interest.eventGroup.id)) {
        continue;
      }
      interestedEventGroupsById.set(interest.eventGroup.id, {
        eventGroup: interest.eventGroup,
        firstEventStartDate: firstEvent.startDate,
        createdAt: interest.createdAt,
      });
    }
    for (const [eventGroupId, group] of interestedEventGroupsById) {
      if (
        attendanceEventGroupsById.has(eventGroupId) ||
        lecturerEventGroupsById.has(eventGroupId) ||
        certificateEventGroupIds.has(eventGroupId)
      ) {
        continue;
      }
      items.push({
        type: 'EVENT_GROUP',
        eventGroupId,
        eventGroup: this.mapper.mapPublicEventGroup(group.eventGroup),
        date: group.firstEventStartDate,
        createdAt: group.createdAt,
        participation: {
          isSubscribed: false,
          isLecturer: false,
          isInterested: true,
          hasIssuedCertificate: false,
        },
      });
    }

    items.sort((first, second) =>
      this.mapper.compareFeedDatesDescending(first.date, first.createdAt, second.date, second.createdAt),
    );

    return {
      items,
    };
  }

  private buildParticipation(
    eventId: string,
    sets: {
      subscribedEventIds: Set<string>;
      interestedEventIds: Set<string>;
      lecturerEventIds: Set<string>;
      certificateEventIds: Set<string>;
    },
  ): CurrentUserEventParticipation {
    return {
      isSubscribed: sets.subscribedEventIds.has(eventId),
      ...(sets.interestedEventIds.has(eventId) ? { isInterested: true } : {}),
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

      const currentDate = datesBySubscriptionId.get(subscription.eventGroupSubscriptionId);
      if (!currentDate || subscription.event.startDate < currentDate) {
        datesBySubscriptionId.set(subscription.eventGroupSubscriptionId, subscription.event.startDate);
      }
    }

    return datesBySubscriptionId;
  }
}
