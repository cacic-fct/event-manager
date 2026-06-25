import { Prisma } from '@prisma/client';
import { PUBLIC_EVENT_GROUP_SELECT } from '../public-events/models';

export const PUBLICATION_EVENT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  type: true,
  description: true,
  shortDescription: true,
  locationDescription: true,
  startDate: true,
  endDate: true,
  majorEventId: true,
  majorEvent: {
    select: {
      id: true,
      name: true,
      deletedAt: true,
      publicationState: true,
    },
  },
  eventGroupId: true,
  eventGroup: {
    select: {
      id: true,
      name: true,
      emoji: true,
      shouldIssueCertificate: true,
      shouldIssueCertificateForEachEvent: true,
      shouldIssuePartialCertificate: true,
      deletedAt: true,
    },
  },
  shouldIssueCertificate: true,
  publiclyVisible: true,
  publicationState: true,
  scheduledPublishAt: true,
  publishedAt: true,
  unpublishedAt: true,
  updatedAt: true,
} satisfies Prisma.EventSelect;

export const PUBLICATION_MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  description: true,
  startDate: true,
  endDate: true,
  publicationState: true,
  scheduledPublishAt: true,
  publishedAt: true,
  unpublishedAt: true,
  updatedAt: true,
  events: {
    where: { deletedAt: null },
    select: PUBLICATION_EVENT_SELECT,
    orderBy: { startDate: 'asc' },
  },
} satisfies Prisma.MajorEventSelect;

export const PUBLICATION_EVENT_GROUP_WITH_EVENTS_SELECT = {
  ...PUBLIC_EVENT_GROUP_SELECT,
  events: {
    where: {
      deletedAt: null,
      majorEventId: null,
    },
    select: PUBLICATION_EVENT_SELECT,
    orderBy: { startDate: 'asc' },
  },
} satisfies Prisma.EventGroupSelect;

export type PublicationEventRecord = Prisma.EventGetPayload<{
  select: typeof PUBLICATION_EVENT_SELECT;
}>;

export type PublicationMajorEventRecord = Prisma.MajorEventGetPayload<{
  select: typeof PUBLICATION_MAJOR_EVENT_SELECT;
}>;

export type PublicationEventGroupRecord = Prisma.EventGroupGetPayload<{
  select: typeof PUBLICATION_EVENT_GROUP_WITH_EVENTS_SELECT;
}>;
