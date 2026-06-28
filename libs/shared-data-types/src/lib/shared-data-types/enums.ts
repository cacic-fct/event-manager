import { registerEnumType } from '@nestjs/graphql';

export const UserRole = {
  USER: 'USER',
  EVENT_MANAGER: 'EVENT_MANAGER',
  CACIC: 'CACIC',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
registerEnumType(UserRole, {
  name: 'UserRole',
});

export const EventType = {
  MINICURSO: 'MINICURSO',
  PALESTRA: 'PALESTRA',
  OTHER: 'OTHER',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];
registerEnumType(EventType, {
  name: 'EventType',
});

export const PublicationState = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'PUBLISHED',
  UNPUBLISHED: 'UNPUBLISHED',
} as const;
export type PublicationState = (typeof PublicationState)[keyof typeof PublicationState];
registerEnumType(PublicationState, {
  name: 'PublicationState',
});

export const PublicationTargetType = {
  EVENT: 'EVENT',
  EVENT_GROUP: 'EVENT_GROUP',
  MAJOR_EVENT: 'MAJOR_EVENT',
} as const;
export type PublicationTargetType = (typeof PublicationTargetType)[keyof typeof PublicationTargetType];
registerEnumType(PublicationTargetType, {
  name: 'PublicationTargetType',
});

export const EventFormSigilo = {
  PUBLIC: 'PUBLIC',
  PARTIALLY_SECRET: 'PARTIALLY_SECRET',
  SECRET: 'SECRET',
  ANONYMOUS: 'ANONYMOUS',
} as const;
export type EventFormSigilo = (typeof EventFormSigilo)[keyof typeof EventFormSigilo];
registerEnumType(EventFormSigilo, {
  name: 'EventFormSigilo',
});

export const EventFormAudience = {
  SUBSCRIBERS: 'SUBSCRIBERS',
  ATTENDEES: 'ATTENDEES',
  SUBSCRIBERS_OR_ATTENDEES: 'SUBSCRIBERS_OR_ATTENDEES',
} as const;
export type EventFormAudience = (typeof EventFormAudience)[keyof typeof EventFormAudience];
registerEnumType(EventFormAudience, {
  name: 'EventFormAudience',
});

export const EventFormTargetType = {
  EVENT: 'EVENT',
  MAJOR_EVENT: 'MAJOR_EVENT',
} as const;
export type EventFormTargetType = (typeof EventFormTargetType)[keyof typeof EventFormTargetType];
registerEnumType(EventFormTargetType, {
  name: 'EventFormTargetType',
});

export const EventFormResponseSource = {
  PUBLIC_FORM: 'PUBLIC_FORM',
  SUBSCRIPTION_FLOW: 'SUBSCRIPTION_FLOW',
  LECTURER_PUBLISH: 'LECTURER_PUBLISH',
} as const;
export type EventFormResponseSource = (typeof EventFormResponseSource)[keyof typeof EventFormResponseSource];
registerEnumType(EventFormResponseSource, {
  name: 'EventFormResponseSource',
});

export const EventFormResponseMode = {
  ONE_PER_TARGET: 'ONE_PER_TARGET',
  MULTIPLE_PER_TARGET: 'MULTIPLE_PER_TARGET',
  SINGLE_PER_FORM: 'SINGLE_PER_FORM',
} as const;
export type EventFormResponseMode = (typeof EventFormResponseMode)[keyof typeof EventFormResponseMode];
registerEnumType(EventFormResponseMode, {
  name: 'EventFormResponseMode',
});

export const ContactType = {
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  WHATSAPP: 'WHATSAPP',
  OTHER: 'OTHER',
} as const;
export type ContactType = (typeof ContactType)[keyof typeof ContactType];
registerEnumType(ContactType, {
  name: 'ContactType',
});

export const PriceType = {
  SINGLE: 'SINGLE',
  TIERED: 'TIERED',
} as const;
export type PriceType = (typeof PriceType)[keyof typeof PriceType];
registerEnumType(PriceType, {
  name: 'PriceType',
});

export const AttendanceCreationMethod = {
  CSV_IMPORT: 'CSV_IMPORT',
  MANUAL_INPUT: 'MANUAL_INPUT',
  SCANNER: 'SCANNER',
  ONLINE_CODE: 'ONLINE_CODE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type AttendanceCreationMethod = (typeof AttendanceCreationMethod)[keyof typeof AttendanceCreationMethod];
registerEnumType(AttendanceCreationMethod, {
  name: 'AttendanceCreationMethod',
});

export const OfflineAttendanceCreationMethod = {
  MANUAL_INPUT: AttendanceCreationMethod.MANUAL_INPUT,
  SCANNER: AttendanceCreationMethod.SCANNER,
} as const;
export type OfflineAttendanceCreationMethod =
  (typeof OfflineAttendanceCreationMethod)[keyof typeof OfflineAttendanceCreationMethod];
registerEnumType(OfflineAttendanceCreationMethod, {
  name: 'OfflineAttendanceCreationMethod',
});

export const OfflineEventAttendanceCommitStatus = {
  CREATED: 'CREATED',
  STAGED: 'STAGED',
  DUPLICATE: 'DUPLICATE',
  CONFLICT: 'CONFLICT',
  FORBIDDEN: 'FORBIDDEN',
  FAILED: 'FAILED',
} as const;
export type OfflineEventAttendanceCommitStatus =
  (typeof OfflineEventAttendanceCommitStatus)[keyof typeof OfflineEventAttendanceCommitStatus];
registerEnumType(OfflineEventAttendanceCommitStatus, {
  name: 'OfflineEventAttendanceCommitStatus',
});

export const OfflineEventAttendanceSubmissionStatus = {
  PENDING: 'PENDING',
  COMMITTED: 'COMMITTED',
  REJECTED: 'REJECTED',
} as const;
export type OfflineEventAttendanceSubmissionStatus =
  (typeof OfflineEventAttendanceSubmissionStatus)[keyof typeof OfflineEventAttendanceSubmissionStatus];
registerEnumType(OfflineEventAttendanceSubmissionStatus, {
  name: 'OfflineEventAttendanceSubmissionStatus',
});

export const SubscriptionCreationMethod = {
  ADMIN_DASHBOARD: 'ADMIN_DASHBOARD',
  SELF_SUBSCRIPTION: 'SELF_SUBSCRIPTION',
  UNKNOWN: 'UNKNOWN',
} as const;
export type SubscriptionCreationMethod = (typeof SubscriptionCreationMethod)[keyof typeof SubscriptionCreationMethod];
registerEnumType(SubscriptionCreationMethod, {
  name: 'SubscriptionCreationMethod',
});

export const SubscriptionStatus = {
  WAITING_RECEIPT_UPLOAD: 'WAITING_RECEIPT_UPLOAD',
  RECEIPT_UNDER_REVIEW: 'RECEIPT_UNDER_REVIEW',
  REJECTED_INVALID_RECEIPT: 'REJECTED_INVALID_RECEIPT',
  REJECTED_NO_SLOTS: 'REJECTED_NO_SLOTS',
  REJECTED_SCHEDULE_CONFLICT: 'REJECTED_SCHEDULE_CONFLICT',
  REJECTED_GENERIC: 'REJECTED_GENERIC',
  CONFIRMED: 'CONFIRMED',
  CANCELED: 'CANCELED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];
registerEnumType(SubscriptionStatus, {
  name: 'SubscriptionStatus',
});

export const CertificateScope = {
  MAJOR_EVENT: 'MAJOR_EVENT',
  EVENT_GROUP: 'EVENT_GROUP',
  EVENT: 'EVENT',
  OTHER: 'OTHER',
} as const;
export type CertificateScope = (typeof CertificateScope)[keyof typeof CertificateScope];
registerEnumType(CertificateScope, {
  name: 'CertificateScope',
});

export const CertificateIssuedTo = {
  ATTENDEE: 'ATTENDEE',
  LECTURER: 'LECTURER',
  OTHER: 'OTHER',
} as const;
export type CertificateIssuedTo = (typeof CertificateIssuedTo)[keyof typeof CertificateIssuedTo];
registerEnumType(CertificateIssuedTo, {
  name: 'CertificateIssuedTo',
});

export const MergeCandidateStatus = {
  PENDING: 'PENDING',
  MERGED: 'MERGED',
  REJECTED: 'REJECTED',
  STALE: 'STALE',
} as const;
export type MergeCandidateStatus = (typeof MergeCandidateStatus)[keyof typeof MergeCandidateStatus];
registerEnumType(MergeCandidateStatus, {
  name: 'MergeCandidateStatus',
});

export const MergeMatchMethod = {
  CPF: 'CPF',
  EMAIL: 'EMAIL',
  NORMALIZED_NAME: 'NORMALIZED_NAME',
} as const;
export type MergeMatchMethod = (typeof MergeMatchMethod)[keyof typeof MergeMatchMethod];
registerEnumType(MergeMatchMethod, {
  name: 'MergeMatchMethod',
});

export const PersonMergeField = {
  NAME: 'NAME',
  EMAIL: 'EMAIL',
  IDENTITY_DOCUMENT: 'IDENTITY_DOCUMENT',
  ACADEMIC_ID: 'ACADEMIC_ID',
  USER_ID: 'USER_ID',
  EXTERNAL_REF: 'EXTERNAL_REF',
} as const;
export type PersonMergeField = (typeof PersonMergeField)[keyof typeof PersonMergeField];
registerEnumType(PersonMergeField, {
  name: 'PersonMergeField',
});

export const AttendanceImportMatchType = {
  IDENTITY_DOCUMENT: 'IDENTITY_DOCUMENT',
  EMAIL: 'EMAIL',
  FULL_NAME: 'FULL_NAME',
} as const;
export type AttendanceImportMatchType = (typeof AttendanceImportMatchType)[keyof typeof AttendanceImportMatchType];
registerEnumType(AttendanceImportMatchType, {
  name: 'AttendanceImportMatchType',
});

export const AttendanceCategory = {
  NON_PAYING: 'NON_PAYING',
  NON_SUBSCRIBED: 'NON_SUBSCRIBED',
  REGULAR: 'REGULAR',
  UNKNOWN: 'UNKNOWN',
} as const;
export type AttendanceCategory = (typeof AttendanceCategory)[keyof typeof AttendanceCategory];
registerEnumType(AttendanceCategory, {
  name: 'AttendanceCategory',
});
