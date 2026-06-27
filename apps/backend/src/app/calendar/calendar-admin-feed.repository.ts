import { EventManagerPermissionGrantScope, Prisma } from '@prisma/client';
import {
  ADMIN_CALENDAR_EVENT_GROUP_PERMISSION_SET,
  ADMIN_CALENDAR_EVENT_PERMISSION_SET,
  ADMIN_CALENDAR_FEED_PERMISSIONS,
  ADMIN_CALENDAR_MAJOR_EVENT_PERMISSION_SET,
} from './calendar-feed.constants';
import {
  buildAdminEventGroupSelect,
  ADMIN_CALENDAR_GRANT_SELECT,
  ADMIN_MAJOR_EVENT_SELECT,
  CALENDAR_EVENT_SELECT,
  AdminCalendarGrantRecord,
  AdminEventGroupRecord,
  AdminFeedTargetPlan,
  AdminMajorEventRecord,
  CalendarEntry,
  CalendarEventRecord,
} from './calendar-records';
import {
  buildAdminEventUrl,
  mapEventGroupToCalendarEntry,
  mapEventToCalendarEntry,
  mapMajorEventToCalendarEntry,
} from './calendar-ical.builder';
import { PrismaService } from '../prisma/prisma.service';

export async function getAdminCalendarEntriesForUser(
  prisma: PrismaService,
  userId: string,
  now: Date,
  publicAppOrigin: string,
  take: number,
): Promise<CalendarEntry[]> {
  const grants = await findActiveAdminCalendarGrants(prisma, userId, now);
  const targetPlan = buildAdminFeedTargetPlan(grants);
  return getAdminCalendarEntriesFromPlan(prisma, targetPlan, publicAppOrigin, take);
}

export async function getSuperAdminCalendarEntries(
  prisma: PrismaService,
  publicAppOrigin: string,
  take: number,
): Promise<CalendarEntry[]> {
  return getAdminCalendarEntriesFromPlan(
    prisma,
    {
      globalEvents: true,
      globalEventGroups: true,
      globalMajorEvents: true,
      eventIds: new Set(),
      eventMajorEventIds: new Set(),
      eventGroupIdsForEvents: new Set(),
      eventGroupIds: new Set(),
      majorEventIds: new Set(),
    },
    publicAppOrigin,
    take,
  );
}

export async function hasCurrentAdminFeedTargets(
  prisma: PrismaService,
  userId: string,
  now: Date,
  take: number,
): Promise<boolean> {
  const entries = await getAdminCalendarEntriesForUser(prisma, userId, now, 'https://eventos.cacic.dev.br', take);
  return entries.length > 0;
}

async function getAdminCalendarEntriesFromPlan(
  prisma: PrismaService,
  targetPlan: AdminFeedTargetPlan,
  publicAppOrigin: string,
  take: number,
): Promise<CalendarEntry[]> {
  const [events, eventGroups, majorEvents] = await Promise.all([
    getAdminFeedEvents(prisma, targetPlan, take),
    getAdminFeedEventGroups(prisma, targetPlan, take),
    getAdminFeedMajorEvents(prisma, targetPlan, take),
  ]);

  return [
    ...events.map((event) => mapEventToCalendarEntry(event, buildAdminEventUrl(publicAppOrigin, event.id))),
    ...eventGroups
      .map((eventGroup) => mapEventGroupToCalendarEntry(eventGroup, publicAppOrigin))
      .filter((entry): entry is CalendarEntry => Boolean(entry)),
    ...majorEvents.map((majorEvent) => mapMajorEventToCalendarEntry(majorEvent, publicAppOrigin)),
  ].sort((left, right) => left.start.getTime() - right.start.getTime() || left.summary.localeCompare(right.summary));
}

async function getAdminFeedEvents(
  prisma: PrismaService,
  targetPlan: AdminFeedTargetPlan,
  take: number,
): Promise<CalendarEventRecord[]> {
  const where = buildAdminFeedEventWhere(targetPlan);
  if (!where) {
    return [];
  }

  return prisma.event.findMany({
    where,
    select: CALENDAR_EVENT_SELECT,
    orderBy: {
      startDate: 'asc',
    },
    take,
  });
}

async function getAdminFeedEventGroups(
  prisma: PrismaService,
  targetPlan: AdminFeedTargetPlan,
  take: number,
): Promise<AdminEventGroupRecord[]> {
  const where = buildAdminFeedEventGroupWhere(targetPlan);
  if (!where) {
    return [];
  }

  return prisma.eventGroup.findMany({
    where,
    select: buildAdminEventGroupSelect(),
    orderBy: {
      name: 'asc',
    },
    take,
  });
}

async function getAdminFeedMajorEvents(
  prisma: PrismaService,
  targetPlan: AdminFeedTargetPlan,
  take: number,
): Promise<AdminMajorEventRecord[]> {
  const where = buildAdminFeedMajorEventWhere(targetPlan);
  if (!where) {
    return [];
  }

  return prisma.majorEvent.findMany({
    where,
    select: ADMIN_MAJOR_EVENT_SELECT,
    orderBy: {
      startDate: 'asc',
    },
    take,
  });
}

function buildAdminFeedEventWhere(targetPlan: AdminFeedTargetPlan): Prisma.EventWhereInput | null {
  const where: Prisma.EventWhereInput = {
    deletedAt: null,
  };

  if (targetPlan.globalEvents) {
    return where;
  }

  const scopedTargets: Prisma.EventWhereInput[] = [];
  if (targetPlan.eventIds.size > 0) {
    scopedTargets.push({
      id: {
        in: [...targetPlan.eventIds],
      },
    });
  }
  if (targetPlan.eventMajorEventIds.size > 0) {
    scopedTargets.push({
      majorEventId: {
        in: [...targetPlan.eventMajorEventIds],
      },
    });
  }
  if (targetPlan.eventGroupIdsForEvents.size > 0) {
    scopedTargets.push({
      eventGroupId: {
        in: [...targetPlan.eventGroupIdsForEvents],
      },
    });
  }

  if (scopedTargets.length === 0) {
    return null;
  }

  return {
    ...where,
    OR: scopedTargets,
  };
}

function buildAdminFeedEventGroupWhere(
  targetPlan: AdminFeedTargetPlan,
): Prisma.EventGroupWhereInput | null {
  const where: Prisma.EventGroupWhereInput = {
    deletedAt: null,
    events: {
      some: {
        deletedAt: null,
      },
    },
  };

  if (targetPlan.globalEventGroups) {
    return where;
  }

  if (targetPlan.eventGroupIds.size === 0) {
    return null;
  }

  return {
    ...where,
    id: {
      in: [...targetPlan.eventGroupIds],
    },
  };
}

function buildAdminFeedMajorEventWhere(
  targetPlan: AdminFeedTargetPlan,
): Prisma.MajorEventWhereInput | null {
  const where: Prisma.MajorEventWhereInput = {
    deletedAt: null,
  };

  if (targetPlan.globalMajorEvents) {
    return where;
  }

  if (targetPlan.majorEventIds.size === 0) {
    return null;
  }

  return {
    ...where,
    id: {
      in: [...targetPlan.majorEventIds],
    },
  };
}

async function findActiveAdminCalendarGrants(
  prisma: PrismaService,
  userId: string,
  now: Date,
): Promise<AdminCalendarGrantRecord[]> {
  return prisma.eventManagerPermissionGrant.findMany({
    where: {
      userId,
      deletedAt: null,
      permission: {
        in: [...ADMIN_CALENDAR_FEED_PERMISSIONS],
      },
      OR: [{ validFrom: null }, { validFrom: { lte: now } }],
      AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
    },
    select: ADMIN_CALENDAR_GRANT_SELECT,
  });
}

function buildAdminFeedTargetPlan(grants: AdminCalendarGrantRecord[]): AdminFeedTargetPlan {
  const targetPlan: AdminFeedTargetPlan = {
    globalEvents: false,
    globalEventGroups: false,
    globalMajorEvents: false,
    eventIds: new Set(),
    eventMajorEventIds: new Set(),
    eventGroupIdsForEvents: new Set(),
    eventGroupIds: new Set(),
    majorEventIds: new Set(),
  };

  for (const grant of grants) {
    const grantsEvents = ADMIN_CALENDAR_EVENT_PERMISSION_SET.has(grant.permission);
    const grantsEventGroups = ADMIN_CALENDAR_EVENT_GROUP_PERMISSION_SET.has(grant.permission);
    const grantsMajorEvents = ADMIN_CALENDAR_MAJOR_EVENT_PERMISSION_SET.has(grant.permission);

    if (grant.scope === EventManagerPermissionGrantScope.GLOBAL) {
      targetPlan.globalEvents ||= grantsEvents;
      targetPlan.globalEventGroups ||= grantsEventGroups;
      targetPlan.globalMajorEvents ||= grantsMajorEvents;
      continue;
    }

    if (grant.scope === EventManagerPermissionGrantScope.EVENT && grant.eventId && grantsEvents) {
      targetPlan.eventIds.add(grant.eventId);
      continue;
    }

    if (grant.scope === EventManagerPermissionGrantScope.EVENT_GROUP && grant.eventGroupId) {
      if (grantsEvents) {
        targetPlan.eventGroupIdsForEvents.add(grant.eventGroupId);
      }
      if (grantsEventGroups) {
        targetPlan.eventGroupIds.add(grant.eventGroupId);
      }
      continue;
    }

    if (grant.scope === EventManagerPermissionGrantScope.MAJOR_EVENT && grant.majorEventId) {
      if (grantsEvents) {
        targetPlan.eventMajorEventIds.add(grant.majorEventId);
      }
      if (grantsMajorEvents) {
        targetPlan.majorEventIds.add(grant.majorEventId);
      }
    }
  }

  return targetPlan;
}
