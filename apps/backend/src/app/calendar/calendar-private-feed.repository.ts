import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PRIVATE_FEED_EVENT_TAKE } from './calendar-feed.constants';
import { CALENDAR_EVENT_SELECT, CalendarEventRecord } from './calendar-records';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_EVENT_WHERE } from '../public-events/models';

export async function getPrivateFeedEvents(
  prisma: PrismaService,
  personIds: string[],
): Promise<CalendarEventRecord[]> {
  if (personIds.length === 0) {
    return [];
  }

  const eventWhere = privateFeedEventWhere();

  const [eventSubscriptions, majorEventSelections, lecturerEvents, eventAttendances, certificates] =
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
            startDate: 'asc',
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
            startDate: 'asc',
          },
        },
        take: PRIVATE_FEED_EVENT_TAKE,
      }),
      prisma.eventLecturer.findMany({
        where: {
          personId: {
            in: personIds,
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
            startDate: 'asc',
          },
        },
        take: PRIVATE_FEED_EVENT_TAKE,
      }),
      prisma.eventAttendance.findMany({
        where: {
          personId: {
            in: personIds,
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
            startDate: 'asc',
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
          issuedAt: 'desc',
        },
        take: PRIVATE_FEED_EVENT_TAKE,
      }),
    ]);

  const eventsById = new Map<string, CalendarEventRecord>();
  for (const event of [
    ...eventSubscriptions.map((subscription) => subscription.event),
    ...majorEventSelections.map((selection) => selection.event),
    ...lecturerEvents.map((lecturer) => lecturer.event),
    ...eventAttendances.map((attendance) => attendance.event),
    ...certificates.map((certificate) => certificate.config.event).filter((event): event is CalendarEventRecord => !!event),
  ]) {
    eventsById.set(event.id, event);
  }

  return [...eventsById.values()].sort(
    (left, right) => left.startDate.getTime() - right.startDate.getTime() || left.name.localeCompare(right.name),
  );
}

function privateFeedEventWhere(): Prisma.EventWhereInput {
  return PUBLIC_EVENT_WHERE;
}
