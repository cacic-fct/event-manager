import { EventAttendanceScannerFeedItem } from '@cacic-fct/shared-data-types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export async function getAttendanceScannerFeed(
  prisma: PrismaService,
  eventId: string,
): Promise<EventAttendanceScannerFeedItem[]> {
  const attendances = await prisma.eventAttendance.findMany({
    where: {
      eventId,
    },
    select: {
      personId: true,
      eventId: true,
      status: true,
      attendedAt: true,
      createdById: true,
      committedById: true,
      createdByMethod: true,
      person: {
        select: {
          name: true,
          user: {
            select: {
              unespRole: true,
            },
          },
        },
      },
      event: {
        select: {
          allowSubscription: true,
          majorEventId: true,
        },
      },
    },
    orderBy: {
      attendedAt: 'desc',
    },
    take: 80,
  });

  const majorEventId = attendances.find((attendance) => attendance.event.majorEventId)?.event.majorEventId;
  const personIds = attendances.map((attendance) => attendance.personId);
  const collectorIds = getCollectorIds(attendances);
  const standaloneEventIds = [
    ...new Set(
      attendances
        .filter((attendance) => attendance.event.allowSubscription && !attendance.event.majorEventId)
        .map((attendance) => attendance.eventId),
    ),
  ];

  const [majorEventSubscriptions, standaloneEventSubscriptions, collectors] = await Promise.all([
    majorEventId
      ? prisma.majorEventSubscription.findMany({
          where: {
            majorEventId,
            personId: {
              in: personIds,
            },
            deletedAt: null,
          },
          select: {
            personId: true,
            subscriptionStatus: true,
          },
        })
      : Promise.resolve([]),
    standaloneEventIds.length
      ? prisma.eventSubscription.findMany({
          where: {
            eventId: {
              in: standaloneEventIds,
            },
            personId: {
              in: personIds,
            },
            deletedAt: null,
          },
          select: {
            eventId: true,
            personId: true,
          },
        })
      : Promise.resolve([]),
    findCollectors(prisma, collectorIds),
  ]);

  const majorEventSubscriptionStatusByPersonId = new Map(
    majorEventSubscriptions.map((subscription) => [subscription.personId, subscription.subscriptionStatus]),
  );
  const standaloneEventSubscriptionKeys = new Set(
    standaloneEventSubscriptions.map((subscription) => `${subscription.personId}:${subscription.eventId}`),
  );
  const collectorFirstNameById = new Map(collectors.map((collector) => [collector.id, firstName(collector.name)]));

  return attendances.map((attendance) => ({
    personId: attendance.personId,
    eventId: attendance.eventId,
    fullName: attendance.person?.name ?? undefined,
    unespRole: attendance.person?.user?.unespRole?.length
      ? attendance.person.user.unespRole.join(', ')
      : undefined,
    subscriptionStatus:
      majorEventSubscriptionStatusByPersonId.get(attendance.personId) ??
      (standaloneEventSubscriptionKeys.has(`${attendance.personId}:${attendance.eventId}`) ? 'CONFIRMED' : undefined),
    attendedAt: attendance.attendedAt,
    status: attendance.status,
    createdByMethod: attendance.createdByMethod,
    collectedByFirstName: attendance.createdById
      ? collectorFirstNameById.get(attendance.createdById)
      : undefined,
    committedByFirstName:
      attendance.committedById && attendance.committedById !== attendance.createdById
        ? collectorFirstNameById.get(attendance.committedById)
        : undefined,
  }));
}

export async function getAttendanceOralRoster(
  prisma: PrismaService,
  eventId: string,
): Promise<EventAttendanceScannerFeedItem[]> {
  const event = await findOralRosterEvent(prisma, eventId);
  const majorEventSubscriptionFilter = majorEventSubscriptionWhere(eventId, event);
  const subscribers = await prisma.people.findMany({
    where: oralRosterPeopleWhere(eventId, event),
    select: {
      id: true,
      name: true,
      identityDocument: true,
      isCPF: true,
      user: { select: { unespRole: true } },
      majorEventSubscriptions: {
        where: majorEventSubscriptionFilter ?? { majorEventId: '__standalone-event__' },
        select: { subscriptionStatus: true },
        take: 1,
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  const attendances = await prisma.eventAttendance.findMany({
    where: {
      eventId,
      personId: { in: subscribers.map((subscriber) => subscriber.id) },
    },
    select: {
      personId: true,
      eventId: true,
      status: true,
      attendedAt: true,
      createdById: true,
      committedById: true,
      createdByMethod: true,
    },
  });

  const attendanceByPersonId = new Map(attendances.map((attendance) => [attendance.personId, attendance]));
  const collectorIds = getCollectorIds(attendances);
  const collectors = await findCollectors(prisma, collectorIds);
  const collectorFirstNameById = new Map(collectors.map((collector) => [collector.id, firstName(collector.name)]));

  return subscribers.map((subscriber) => {
    const attendance = attendanceByPersonId.get(subscriber.id);
    return {
      personId: subscriber.id,
      eventId,
      fullName: subscriber.name,
      identityDocument: maskIdentityDocument(subscriber.identityDocument, subscriber.isCPF),
      unespRole: subscriber.user?.unespRole?.length ? subscriber.user.unespRole.join(', ') : undefined,
      subscriptionStatus: subscriber.majorEventSubscriptions?.[0]?.subscriptionStatus,
      attendedAt: attendance?.attendedAt,
      status: attendance?.status,
      createdByMethod: attendance?.createdByMethod,
      collectedByFirstName: attendance?.createdById
        ? collectorFirstNameById.get(attendance.createdById)
        : undefined,
      committedByFirstName:
        attendance?.committedById && attendance.committedById !== attendance.createdById
          ? collectorFirstNameById.get(attendance.committedById)
          : undefined,
    };
  });
}

export async function isOnAttendanceOralRoster(
  prisma: PrismaService,
  eventId: string,
  personId: string,
): Promise<boolean> {
  const event = await findOralRosterEvent(prisma, eventId);
  return Boolean(
    await prisma.people.findFirst({
      where: {
        ...oralRosterPeopleWhere(eventId, event),
        id: personId,
      },
      select: { id: true },
    }),
  );
}

export async function findAttendanceOralRosterPersonIds(
  prisma: PrismaService,
  eventId: string,
  personIds: readonly string[],
): Promise<Set<string>> {
  const event = await findOralRosterEvent(prisma, eventId);
  const people = await prisma.people.findMany({
    where: {
      ...oralRosterPeopleWhere(eventId, event),
      id: { in: [...new Set(personIds)] },
    },
    select: { id: true },
  });
  return new Set(people.map((person) => person.id));
}

function findOralRosterEvent(prisma: PrismaService, eventId: string) {
  return prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { id: true, majorEventId: true, autoSubscribe: true },
  });
}

function oralRosterPeopleWhere(
  eventId: string,
  event: { majorEventId: string | null; autoSubscribe: boolean },
): Prisma.PeopleWhereInput {
  const subscriptionFilters: Prisma.PeopleWhereInput[] = [
    { eventSubscriptions: { some: { eventId, deletedAt: null } } },
  ];
  const majorEventSubscriptionFilter = majorEventSubscriptionWhere(eventId, event);
  if (majorEventSubscriptionFilter) {
    subscriptionFilters.push({
      majorEventSubscriptions: {
        some: majorEventSubscriptionFilter,
      },
    });
  }
  return {
    deletedAt: null,
    mergedIntoId: null,
    OR: subscriptionFilters,
  };
}

function majorEventSubscriptionWhere(
  eventId: string,
  event: { majorEventId: string | null; autoSubscribe: boolean },
): Prisma.MajorEventSubscriptionWhereInput | null {
  if (!event.majorEventId) {
    return null;
  }
  return {
    majorEventId: event.majorEventId,
    deletedAt: null,
    subscriptionStatus: 'CONFIRMED',
    ...(event.autoSubscribe ? {} : { selectedEvents: { some: { eventId, deletedAt: null } } }),
  };
}

function getCollectorIds(
  attendances: readonly { createdById: string | null; committedById: string | null }[],
): string[] {
  return [
    ...new Set(
      attendances
        .flatMap((attendance) => [attendance.createdById, attendance.committedById])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

function findCollectors(prisma: PrismaService, collectorIds: readonly string[]) {
  return collectorIds.length
    ? prisma.user.findMany({
        where: { id: { in: [...collectorIds] } },
        select: { id: true, name: true },
      })
    : Promise.resolve([]);
}

function maskIdentityDocument(value: string | null, isCpf: boolean | null): string | undefined {
  if (!value) {
    return undefined;
  }
  if (isCpf !== true) {
    return value;
  }
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 ? `•••.${digits.slice(3, 6)}.${digits.slice(6, 9)}-••` : '••••••••';
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
