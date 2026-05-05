import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  PUBLIC_EVENT_GROUP_SELECT,
  PUBLIC_EVENT_SELECT,
  PUBLIC_MAJOR_EVENT_SELECT,
} from '../public-events/models';

export const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  identityDocument: true,
  academicId: true,
  role: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.UserSelect;

export const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  secondaryEmails: true,
  phone: true,
  identityDocument: true,
  academicId: true,
  userId: true,
  user: {
    select: USER_SELECT,
  },
  mergedIntoId: true,
  externalRef: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.PeopleSelect;

export const PAYMENT_INFO_SELECT = {
  id: true,
  bankName: true,
  agency: true,
  account: true,
  holder: true,
  document: true,
  majorEventId: true,
} satisfies Prisma.PaymentInfoSelect;

export const MAJOR_EVENT_BASE_SELECT = {
  id: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  description: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  maxCoursesPerAttendee: true,
  maxLecturesPerAttendee: true,
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  isPaymentRequired: true,
  additionalPaymentInfo: true,
  certificateConfigs: {
    where: {
      deletedAt: null,
      isActive: true,
    },
    select: {
      id: true,
    },
    take: 1,
  },
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.MajorEventSelect;

export const MAJOR_EVENT_WITH_PAYMENT_INFO_SELECT = {
  ...MAJOR_EVENT_BASE_SELECT,
  paymentInfo: {
    select: PAYMENT_INFO_SELECT,
  },
} satisfies Prisma.MajorEventSelect;

export const CURRENT_USER_EVENT_ATTENDANCE_SELECT = {
  eventId: true,
  attendedAt: true,
  createdAt: true,
  event: {
    select: PUBLIC_EVENT_SELECT,
  },
} satisfies Prisma.EventAttendanceSelect;

export const CURRENT_USER_EVENT_SUBSCRIPTION_SELECT = {
  eventId: true,
  eventGroupSubscriptionId: true,
  createdAt: true,
  event: {
    select: PUBLIC_EVENT_SELECT,
  },
} satisfies Prisma.EventSubscriptionSelect;

export const CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT = {
  id: true,
  eventGroupId: true,
  createdAt: true,
  eventGroup: {
    select: PUBLIC_EVENT_GROUP_SELECT,
  },
} satisfies Prisma.EventGroupSubscriptionSelect;

export const CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT = {
  id: true,
  eventId: true,
  createdAt: true,
  event: {
    select: PUBLIC_EVENT_SELECT,
  },
} satisfies Prisma.EventSubscriptionSelect;

export const EVENT_GROUP_SELECT = {
  id: true,
  name: true,
  emoji: true,
  shouldIssueCertificateForEachEvent: true,
  shouldIssuePartialCertificate: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventGroupSelect;

export const EVENT_SELECT = {
  id: true,
  name: true,
  creditMinutes: true,
  startDate: true,
  endDate: true,
  type: true,
  emoji: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  majorEventId: true,
  majorEvent: {
    select: MAJOR_EVENT_BASE_SELECT,
  },
  eventGroupId: true,
  eventGroup: {
    select: EVENT_GROUP_SELECT,
  },
  allowSubscription: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  slots: true,
  shouldIssueCertificate: true,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: true,
  onlineAttendanceCode: true,
  onlineAttendanceStartDate: true,
  onlineAttendanceEndDate: true,
  publiclyVisible: true,
  youtubeCode: true,
  buttonText: true,
  buttonLink: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventSelect;

export type UserRecord = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;
export type PersonRecord = Prisma.PeopleGetPayload<{
  select: typeof PERSON_SELECT;
}>;
export type EventRecord = Prisma.EventGetPayload<{
  select: typeof EVENT_SELECT;
}>;
export type PublicEventRecord = Prisma.EventGetPayload<{
  select: typeof PUBLIC_EVENT_SELECT;
}>;
export type PublicEventGroupRecord = Prisma.EventGroupGetPayload<{
  select: typeof PUBLIC_EVENT_GROUP_SELECT;
}>;
export type PublicMajorEventRecord = Prisma.MajorEventGetPayload<{
  select: typeof PUBLIC_MAJOR_EVENT_SELECT;
}>;
export type EventGroupSubscriptionRecord =
  Prisma.EventGroupSubscriptionGetPayload<{
    select: typeof CURRENT_USER_EVENT_GROUP_SUBSCRIPTION_SELECT;
  }>;
export type SubscriptionFeedSingleEventRecord =
  Prisma.EventSubscriptionGetPayload<{
    select: typeof CURRENT_USER_SUBSCRIPTION_FEED_SINGLE_EVENT_SELECT;
  }>;

export type TransactionClient = Prisma.TransactionClient;

type GraphqlRequest = Request & {
  user?: AuthenticatedUser;
};

export type GraphqlContext = {
  req?: GraphqlRequest;
  request?: GraphqlRequest;
};
