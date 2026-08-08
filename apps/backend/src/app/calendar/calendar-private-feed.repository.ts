import {
  Prisma,
  SportsEligibilityStatus,
  SportsParticipantStatus,
  SportsRosterEntryStatus,
  SportsRosterStatus,
  SportsTeamMemberStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { CALENDAR_FEED_ENTRY_LIMIT, PRIVATE_FEED_EVENT_TAKE } from './calendar-feed.constants';
import { CALENDAR_EVENT_SELECT, CalendarEventRecord } from './calendar-records';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';

export async function getPrivateFeedEvents(prisma: PrismaService, personIds: string[]): Promise<CalendarEventRecord[]> {
  if (personIds.length === 0) {
    return [];
  }

  const eventWhere = privateFeedEventWhere();

  const [eventSubscriptions, majorEventSelections, sportsMatches, lecturerEvents, eventAttendances, certificates] =
    await Promise.all([
      prisma.eventSubscription.findMany({
        where: {
          personId: {
            in: personIds,
          },
          deletedAt: null,
          event: eventWhere,
        },
        select: {
          event: {
            select: CALENDAR_EVENT_SELECT,
          },
        },
        orderBy: {
          event: {
            startDate: 'desc',
          },
        },
        take: PRIVATE_FEED_EVENT_TAKE,
      }),
      prisma.majorEventSubscriptionEventSelection.findMany({
        where: {
          deletedAt: null,
          subscription: {
            personId: {
              in: personIds,
            },
            deletedAt: null,
            subscriptionStatus: {
              in: [
                SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
                SubscriptionStatus.RECEIPT_UNDER_REVIEW,
                SubscriptionStatus.CONFIRMED,
              ],
            },
          },
          event: eventWhere,
        },
        select: {
          event: {
            select: CALENDAR_EVENT_SELECT,
          },
        },
        orderBy: {
          event: {
            startDate: 'desc',
          },
        },
        take: PRIVATE_FEED_EVENT_TAKE,
      }),
      prisma.sportsMatch.findMany({
        where: {
          deletedAt: null,
          event: eventWhere,
          rosters: {
            some: {
              deletedAt: null,
              status: SportsRosterStatus.APPROVED,
              entries: {
                some: {
                  deletedAt: null,
                  status: SportsRosterEntryStatus.APPROVED,
                  registrationMember: {
                    deletedAt: null,
                    eligibility: SportsEligibilityStatus.ELIGIBLE,
                    teamMember: {
                      deletedAt: null,
                      status: SportsTeamMemberStatus.APPROVED,
                      participant: {
                        deletedAt: null,
                        status: SportsParticipantStatus.ACTIVE,
                        personId: { in: personIds },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        select: {
          event: {
            select: CALENDAR_EVENT_SELECT,
          },
        },
        orderBy: {
          event: {
            startDate: 'desc',
          },
        },
        take: PRIVATE_FEED_EVENT_TAKE,
      }),
      prisma.eventLecturer.findMany({
        where: {
          personId: {
            in: personIds,
          },
          status: 'PRESENT',
          event: eventWhere,
        },
        select: {
          event: {
            select: CALENDAR_EVENT_SELECT,
          },
        },
        orderBy: {
          event: {
            startDate: 'desc',
          },
        },
        take: PRIVATE_FEED_EVENT_TAKE,
      }),
      prisma.eventAttendance.findMany({
        where: {
          personId: {
            in: personIds,
          },
          status: 'PRESENT',
          event: eventWhere,
        },
        select: {
          event: {
            select: CALENDAR_EVENT_SELECT,
          },
        },
        orderBy: {
          event: {
            startDate: 'desc',
          },
        },
        take: PRIVATE_FEED_EVENT_TAKE,
      }),
      prisma.certificate.findMany({
        where: {
          personId: {
            in: personIds,
          },
          deletedAt: null,
          config: {
            deletedAt: null,
            event: eventWhere,
          },
        },
        select: {
          config: {
            select: {
              event: {
                select: CALENDAR_EVENT_SELECT,
              },
            },
          },
        },
        orderBy: {
          config: {
            event: {
              startDate: 'desc',
            },
          },
        },
        take: PRIVATE_FEED_EVENT_TAKE,
      }),
    ]);

  const eventsById = new Map<string, CalendarEventRecord>();
  for (const event of [
    ...eventSubscriptions.map((subscription) => subscription.event),
    ...majorEventSelections.map((selection) => selection.event),
    ...sportsMatches.map((match) => match.event),
    ...lecturerEvents.map((lecturer) => lecturer.event),
    ...eventAttendances.map((attendance) => attendance.event),
    ...certificates
      .map((certificate) => certificate.config.event)
      .filter((event): event is CalendarEventRecord => !!event),
  ]) {
    eventsById.set(event.id, event);
  }

  return [...eventsById.values()]
    .sort((left, right) => right.startDate.getTime() - left.startDate.getTime() || left.name.localeCompare(right.name))
    .slice(0, CALENDAR_FEED_ENTRY_LIMIT)
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime() || left.name.localeCompare(right.name));
}

function privateFeedEventWhere(): Prisma.EventWhereInput {
  return PUBLIC_EVENT_WHERE;
}
