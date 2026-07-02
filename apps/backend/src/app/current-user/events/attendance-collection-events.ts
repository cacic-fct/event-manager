import { Permission } from '@cacic-fct/shared-permissions';
import { Prisma } from '@prisma/client';
import { endOfDay, startOfDay, subHours } from 'date-fns';
import { CurrentUserAttendanceCollectionEvent } from '../models';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_EVENT_SELECT } from '../../public-events/models';
import { getAuthenticatedUser } from './attendance-collection-context';

export const ATTENDANCE_COLLECTION_PERMISSIONS = [
  Permission.EventAttendance.Collect,
  Permission.EventAttendance.Import,
  Permission.EventAttendance.Update,
] as const;

type AttendanceCollectionEventDeps = {
  prisma: PrismaService;
  currentUserContext: CurrentUserContextService;
  authorizationPolicy: AuthorizationPolicyService;
};

export async function requireAttendanceCollector(
  deps: AttendanceCollectionEventDeps,
  eventId: string,
  context: GraphqlContext,
  enforceCollectionWindow: boolean,
) {
  const collectorPerson = await deps.currentUserContext.requireCurrentPerson(context);
  await deps.authorizationPolicy.assertAttendanceCollectorForEvent(eventId, collectorPerson.id, {
    enforceCollectionWindow,
    user: getAuthenticatedUser(deps.currentUserContext, context),
  });

  return collectorPerson;
}

export async function findCurrentUserAttendanceCollectionEvents(
  deps: AttendanceCollectionEventDeps,
  context: GraphqlContext,
): Promise<CurrentUserAttendanceCollectionEvent[]> {
  const person = await deps.currentUserContext.requireCurrentPerson(context);
  const now = new Date();
  const visibleFrom = subHours(startOfDay(now), 6);
  const endOfToday = endOfDay(now);

  const collectors = await deps.prisma.eventAttendanceCollector.findMany({
    where: {
      personId: person.id,
      event: {
        deletedAt: null,
        shouldCollectAttendance: true,
        startDate: {
          gte: visibleFrom,
          lte: endOfToday,
        },
      },
    },
    select: {
      eventId: true,
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

  const collectorEvents = collectors.map((collector) => ({
    eventId: collector.eventId,
    event: collector.event,
  }));
  const managerEvents = await findManagerCollectionEvents(deps, context, visibleFrom, endOfToday);

  return mergeCollectionEvents([...collectorEvents, ...managerEvents]);
}

async function findManagerCollectionEvents(
  deps: AttendanceCollectionEventDeps,
  context: GraphqlContext,
  visibleFrom: Date,
  endOfToday: Date,
): Promise<CurrentUserAttendanceCollectionEvent[]> {
  const user = getAuthenticatedUser(deps.currentUserContext, context);
  const targets = await Promise.all(
    ATTENDANCE_COLLECTION_PERMISSIONS.map((permission) =>
      deps.authorizationPolicy.accessibleEventTargets(user as AuthenticatedUser, permission),
    ),
  );

  const hasGlobalAccess = targets.some((target) => target === null);
  const eventIds = new Set<string>();
  const majorEventIds = new Set<string>();
  const eventGroupIds = new Set<string>();
  for (const target of targets) {
    if (!target) {
      continue;
    }
    target.eventIds.forEach((id) => eventIds.add(id));
    target.majorEventIds.forEach((id) => majorEventIds.add(id));
    target.eventGroupIds.forEach((id) => eventGroupIds.add(id));
  }

  if (!hasGlobalAccess && eventIds.size === 0 && majorEventIds.size === 0 && eventGroupIds.size === 0) {
    return [];
  }

  const scopeFilters: Prisma.EventWhereInput[] = [];
  if (eventIds.size > 0) {
    scopeFilters.push({ id: { in: [...eventIds] } });
  }
  if (majorEventIds.size > 0) {
    scopeFilters.push({ majorEventId: { in: [...majorEventIds] } });
  }
  if (eventGroupIds.size > 0) {
    scopeFilters.push({ eventGroupId: { in: [...eventGroupIds] } });
  }

  const events = await deps.prisma.event.findMany({
    where: {
      deletedAt: null,
      shouldCollectAttendance: true,
      startDate: {
        gte: visibleFrom,
        lte: endOfToday,
      },
      ...(hasGlobalAccess ? {} : { OR: scopeFilters }),
    },
    select: PUBLIC_EVENT_SELECT,
    orderBy: {
      startDate: 'asc',
    },
  });

  return events.map((event) => ({
    eventId: event.id,
    event,
  }));
}

function mergeCollectionEvents(
  events: CurrentUserAttendanceCollectionEvent[],
): CurrentUserAttendanceCollectionEvent[] {
  const byEventId = new Map<string, CurrentUserAttendanceCollectionEvent>();
  for (const event of events) {
    byEventId.set(event.eventId, event);
  }

  return [...byEventId.values()].sort((left, right) => {
    const leftTime = left.event.startDate?.getTime?.() ?? 0;
    const rightTime = right.event.startDate?.getTime?.() ?? 0;
    return leftTime - rightTime;
  });
}
