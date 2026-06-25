import { Prisma } from '@prisma/client';

export const EVENT_INSIGHT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  type: true,
  startDate: true,
  endDate: true,
  description: true,
  shortDescription: true,
  locationDescription: true,
  latitude: true,
  longitude: true,
  majorEventId: true,
  majorEvent: {
    select: {
      id: true,
      name: true,
      certificateConfigs: {
        where: { deletedAt: null, isActive: true },
        select: { id: true },
      },
    },
  },
  eventGroupId: true,
  eventGroup: {
    select: {
      id: true,
      name: true,
      shouldIssueCertificate: true,
      certificateConfigs: {
        where: { deletedAt: null, isActive: true },
        select: { id: true },
      },
    },
  },
  shouldCollectAttendance: true,
  shouldIssueCertificate: true,
  allowSubscription: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  certificateConfigs: {
    where: { deletedAt: null, isActive: true },
    select: { id: true },
  },
  lecturers: {
    select: {
      personId: true,
      person: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  subscriptions: {
    where: { deletedAt: null },
    select: { personId: true },
  },
  attendances: {
    select: { personId: true },
  },
  _count: {
    select: {
      attendances: true,
      subscriptions: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.EventSelect;

export type InsightEvent = Prisma.EventGetPayload<{
  select: typeof EVENT_INSIGHT_SELECT;
}>;
