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
