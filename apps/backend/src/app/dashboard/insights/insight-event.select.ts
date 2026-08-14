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
      publicationState: true,
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
  sportsMatch: {
    select: {
      id: true,
      category: {
        select: {
          tournamentId: true,
          status: true,
          tournament: { select: { status: true } },
        },
      },
    },
  },
  shouldCollectAttendance: true,
  shouldIssueCertificate: true,
  publiclyVisible: true,
  publicationState: true,
  scheduledPublishAt: true,
  allowSubscription: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  slots: true,
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
    where: { status: 'PRESENT' },
    select: { personId: true },
  },
  _count: {
    select: {
      attendances: { where: { status: 'PRESENT' } },
      subscriptions: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.EventSelect;

export type InsightEvent = Prisma.EventGetPayload<{
  select: typeof EVENT_INSIGHT_SELECT;
}>;
