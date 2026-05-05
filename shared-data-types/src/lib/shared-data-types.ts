import {
  Field,
  Float,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

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

export const AttendanceCreationMethod = {
  CSV_IMPORT: 'CSV_IMPORT',
  MANUAL_INPUT: 'MANUAL_INPUT',
  SCANNER: 'SCANNER',
  ONLINE_CODE: 'ONLINE_CODE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type AttendanceCreationMethod =
  (typeof AttendanceCreationMethod)[keyof typeof AttendanceCreationMethod];
registerEnumType(AttendanceCreationMethod, {
  name: 'AttendanceCreationMethod',
});

export const CertificateScope = {
  MAJOR_EVENT: 'MAJOR_EVENT',
  EVENT_GROUP: 'EVENT_GROUP',
  EVENT: 'EVENT',
  OTHER: 'OTHER',
} as const;
export type CertificateScope =
  (typeof CertificateScope)[keyof typeof CertificateScope];
registerEnumType(CertificateScope, {
  name: 'CertificateScope',
});

export const CertificateIssuedTo = {
  ATTENDEE: 'ATTENDEE',
  LECTURER: 'LECTURER',
  OTHER: 'OTHER',
} as const;
export type CertificateIssuedTo =
  (typeof CertificateIssuedTo)[keyof typeof CertificateIssuedTo];
registerEnumType(CertificateIssuedTo, {
  name: 'CertificateIssuedTo',
});

export const MergeCandidateStatus = {
  PENDING: 'PENDING',
  MERGED: 'MERGED',
  REJECTED: 'REJECTED',
} as const;
export type MergeCandidateStatus =
  (typeof MergeCandidateStatus)[keyof typeof MergeCandidateStatus];
registerEnumType(MergeCandidateStatus, {
  name: 'MergeCandidateStatus',
});

export const MergeMatchMethod = {
  CPF: 'CPF',
  EMAIL: 'EMAIL',
  NORMALIZED_NAME: 'NORMALIZED_NAME',
} as const;
export type MergeMatchMethod =
  (typeof MergeMatchMethod)[keyof typeof MergeMatchMethod];
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
export type PersonMergeField =
  (typeof PersonMergeField)[keyof typeof PersonMergeField];
registerEnumType(PersonMergeField, {
  name: 'PersonMergeField',
});

export const AttendanceImportMatchType = {
  IDENTITY_DOCUMENT: 'IDENTITY_DOCUMENT',
  EMAIL: 'EMAIL',
  FULL_NAME: 'FULL_NAME',
} as const;
export type AttendanceImportMatchType =
  (typeof AttendanceImportMatchType)[keyof typeof AttendanceImportMatchType];
registerEnumType(AttendanceImportMatchType, {
  name: 'AttendanceImportMatchType',
});

@ObjectType()
export class AuthenticatedUser {
  @Field(() => String, { nullable: true })
  sub?: string;

  @Field(() => String, { nullable: true })
  preferredUsername?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => String)
  token!: string;

  @Field(() => [String])
  roles!: string[];

  @Field(() => [String])
  permissions!: string[];

  @Field(() => [String])
  oidcScopes!: string[];

  @Field(() => [String], { deprecationReason: 'Use roles instead.' })
  scopes!: string[];
}

@ObjectType()
export class User {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  email!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  identityDocument?: string;

  @Field(() => String, { nullable: true })
  academicId?: string;

  @Field(() => UserRole)
  role!: UserRole;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@ObjectType()
export class PaymentInfo {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  bankName!: string;

  @Field(() => String)
  agency!: string;

  @Field(() => String)
  account!: string;

  @Field(() => String)
  holder!: string;

  @Field(() => String)
  document!: string;

  @Field(() => String)
  majorEventId!: string;
}

@ObjectType()
export class MajorEvent {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date;

  @Field(() => Int, { nullable: true })
  maxCoursesPerAttendee?: number;

  @Field(() => Int, { nullable: true })
  maxLecturesPerAttendee?: number;

  @Field(() => String, { nullable: true })
  buttonText?: string;

  @Field(() => String, { nullable: true })
  buttonLink?: string;

  @Field(() => String, { nullable: true })
  contactInfo?: string;

  @Field(() => ContactType, { nullable: true })
  contactType?: ContactType;

  @Field(() => Boolean)
  isPaymentRequired!: boolean;

  @Field(() => String, { nullable: true })
  additionalPaymentInfo?: string;

  @Field(() => PaymentInfo, { nullable: true })
  paymentInfo?: PaymentInfo;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@ObjectType()
export class EventGroup {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Boolean)
  shouldIssueCertificate!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificateForEachEvent!: boolean;

  @Field(() => Boolean)
  shouldIssuePartialCertificate!: boolean;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@ObjectType()
export class Event {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => Int, { nullable: true })
  creditMinutes?: number;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String)
  emoji!: string;

  @Field(() => EventType)
  type!: EventType;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  shortDescription?: string;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;

  @Field(() => String, { nullable: true })
  locationDescription?: string;

  @Field(() => String, { nullable: true })
  majorEventId?: string;

  @Field(() => MajorEvent, { nullable: true })
  majorEvent?: MajorEvent;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => EventGroup, { nullable: true })
  eventGroup?: EventGroup;

  @Field(() => [EventAttendance], { nullable: true })
  attendances?: EventAttendance[];

  @Field(() => [EventLecturer], { nullable: true })
  lecturers?: EventLecturer[];

  @Field(() => Boolean)
  allowSubscription!: boolean;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date;

  @Field(() => Int, { nullable: true })
  slots?: number;

  @Field(() => Boolean)
  autoSubscribe!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificate!: boolean;

  @Field(() => Boolean)
  shouldCollectAttendance!: boolean;

  @Field(() => Boolean)
  isOnlineAttendanceAllowed!: boolean;

  @Field(() => String, { nullable: true })
  onlineAttendanceCode?: string;

  @Field(() => Date, { nullable: true })
  onlineAttendanceStartDate?: Date;

  @Field(() => Date, { nullable: true })
  onlineAttendanceEndDate?: Date;

  @Field(() => Boolean)
  publiclyVisible!: boolean;

  @Field(() => String, { nullable: true })
  youtubeCode?: string;

  @Field(() => String, { nullable: true })
  buttonText?: string;

  @Field(() => String, { nullable: true })
  buttonLink?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@ObjectType('Person')
export class Person {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => [String], { nullable: true })
  secondaryEmails?: string[];

  @Field(() => String, { nullable: true })
  phone?: string;

  @Field(() => String, { nullable: true })
  identityDocument?: string;

  @Field(() => String, { nullable: true })
  academicId?: string;

  @Field(() => String, { nullable: true })
  userId?: string;

  @Field(() => User, { nullable: true })
  user?: User;

  @Field(() => [EventAttendance], { nullable: true })
  attendances?: EventAttendance[];

  @Field(() => [EventLecturer], { nullable: true })
  lectures?: EventLecturer[];

  @Field(() => String, { nullable: true })
  mergedIntoId?: string;

  @Field(() => String, { nullable: true })
  externalRef?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@ObjectType()
export class EventAttendance {
  @Field(() => String)
  personId!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => Person, { nullable: true })
  person?: Person;

  @Field(() => Event, { nullable: true })
  event?: Event;

  @Field(() => Date)
  attendedAt!: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => AttendanceCreationMethod)
  createdByMethod!: AttendanceCreationMethod;
}

@ObjectType()
export class MajorEventEventAttendanceStatus {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  eventName!: string;

  @Field(() => Date, { nullable: true })
  eventStartDate?: Date;

  @Field(() => Boolean)
  attended!: boolean;

  @Field(() => Date, { nullable: true })
  attendedAt?: Date;
}

@ObjectType()
export class MajorEventUserAttendance {
  @Field(() => String)
  majorEventId!: string;

  @Field(() => String)
  subscriptionId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person?: Person;

  @Field(() => String)
  subscriptionStatus!: string;

  @Field(() => Int, { nullable: true })
  amountPaid?: number;

  @Field(() => Date, { nullable: true })
  paymentDate?: Date;

  @Field(() => String, { nullable: true })
  paymentTier?: string;

  @Field(() => [MajorEventEventAttendanceStatus])
  attendances!: MajorEventEventAttendanceStatus[];
}

@ObjectType()
export class EventAttendanceCsvImportResult {
  @Field(() => Int)
  createdCount!: number;

  @Field(() => Int)
  duplicateCount!: number;

  @Field(() => Int)
  failedCount!: number;

  @Field(() => [String])
  failedValues!: string[];

  @Field(() => AttendanceImportMatchType)
  inferredMatchType!: AttendanceImportMatchType;
}

@ObjectType()
export class MajorEventSubscriptionCsvImportResult {
  @Field(() => Int)
  createdSubscriptionCount!: number;

  @Field(() => Int)
  updatedSubscriptionCount!: number;

  @Field(() => Int)
  duplicateCount!: number;

  @Field(() => Int)
  createdPeopleCount!: number;

  @Field(() => Int)
  failedCount!: number;

  @Field(() => [Person])
  createdPeople!: Person[];

  @Field(() => [String])
  failedRows!: string[];
}

@ObjectType()
export class EventLecturer {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Event, { nullable: true })
  event?: Event;

  @Field(() => Person, { nullable: true })
  person?: Person;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;
}

@ObjectType()
export class CertificateTemplate {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Int)
  version!: number;

  @Field(() => Boolean)
  isActive!: boolean;

  @Field(() => String, { nullable: true })
  certificateFieldsJson?: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;
}

@ObjectType()
export class CertificateConfig {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => CertificateScope)
  scope!: CertificateScope;

  @Field(() => String, { nullable: true })
  majorEventId?: string;

  @Field(() => MajorEvent, { nullable: true })
  majorEvent?: MajorEvent;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => EventGroup, { nullable: true })
  eventGroup?: EventGroup;

  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => Event, { nullable: true })
  event?: Event;

  @Field(() => String)
  certificateTemplateId!: string;

  @Field(() => CertificateTemplate)
  certificateTemplate!: CertificateTemplate;

  @Field(() => String, { nullable: true })
  certificateText?: string;

  @Field(() => Boolean)
  isActive!: boolean;

  @Field(() => CertificateIssuedTo)
  issuedTo!: CertificateIssuedTo;

  @Field(() => String, { nullable: true })
  certificateFieldsJson?: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;
}

@ObjectType()
export class Certificate {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Person)
  person!: Person;

  @Field(() => String)
  configId!: string;

  @Field(() => CertificateConfig)
  config!: CertificateConfig;

  @Field(() => String)
  renderedDataJson!: string;

  @Field(() => Date)
  issuedAt!: Date;

  @Field(() => String, { nullable: true })
  issuedById?: string;

  @Field(() => String)
  certificateTemplateId!: string;

  @Field(() => CertificateTemplate)
  certificateTemplate!: CertificateTemplate;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;
}

@ObjectType()
export class CertificateDownload {
  @Field(() => String)
  fileName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => String)
  contentBase64!: string;
}

@ObjectType()
export class PublicCertificateValidationEvent {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => Int, { nullable: true })
  creditMinutes?: number;
}

@ObjectType()
export class PublicCertificateValidationEventSection {
  @Field(() => String)
  title!: string;

  @Field(() => EventType, { nullable: true })
  type?: EventType;

  @Field(() => Int)
  creditMinutes!: number;

  @Field(() => [PublicCertificateValidationEvent])
  events!: PublicCertificateValidationEvent[];
}

@ObjectType()
export class PublicCertificateValidation {
  @Field(() => String)
  id!: string;

  @Field(() => Date)
  issuedAt!: Date;

  @Field(() => String)
  personName!: string;

  @Field(() => String, { nullable: true })
  maskedIdentityDocument?: string;

  @Field(() => CertificateScope)
  scope!: CertificateScope;

  @Field(() => String)
  certificateName!: string;

  @Field(() => String, { nullable: true })
  targetName?: string;

  @Field(() => String, { nullable: true })
  targetEmoji?: string;

  @Field(() => [PublicCertificateValidationEventSection])
  sections!: PublicCertificateValidationEventSection[];

  @Field(() => Int)
  totalCreditMinutes!: number;
}

@ObjectType()
export class MergeCandidate {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  personAId!: string;

  @Field(() => String)
  personBId!: string;

  @Field(() => Person, { nullable: true })
  personA?: Person;

  @Field(() => Person, { nullable: true })
  personB?: Person;

  @Field(() => String)
  pairKey!: string;

  @Field(() => Float, { nullable: true })
  score?: number;

  @Field(() => MergeMatchMethod, { nullable: true })
  matchMethod?: MergeMatchMethod;

  @Field(() => String, { nullable: true })
  matchValue?: string;

  @Field(() => MergeCandidateStatus)
  status!: MergeCandidateStatus;

  @Field(() => String, { nullable: true })
  resolvedById?: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@ObjectType()
export class DeletionResult {
  @Field(() => Boolean)
  deleted!: boolean;

  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  personId?: string;

  @Field(() => String, { nullable: true })
  eventId?: string;
}

@InputType()
export class PaymentInfoInput {
  @Field(() => String)
  bankName!: string;

  @Field(() => String)
  agency!: string;

  @Field(() => String)
  account!: string;

  @Field(() => String)
  holder!: string;

  @Field(() => String)
  document!: string;
}

@InputType()
export class MajorEventCreateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date;

  @Field(() => Int, { nullable: true })
  maxCoursesPerAttendee?: number;

  @Field(() => Int, { nullable: true })
  maxLecturesPerAttendee?: number;

  @Field(() => String, { nullable: true })
  buttonText?: string;

  @Field(() => String, { nullable: true })
  buttonLink?: string;

  @Field(() => String, { nullable: true })
  contactInfo?: string;

  @Field(() => ContactType, { nullable: true })
  contactType?: ContactType;

  @Field(() => Boolean, { nullable: true })
  isPaymentRequired?: boolean;

  @Field(() => String, { nullable: true })
  additionalPaymentInfo?: string;

  @Field(() => PaymentInfoInput, { nullable: true })
  paymentInfo?: PaymentInfoInput | null;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class MajorEventUpdateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date;

  @Field(() => Int, { nullable: true })
  maxCoursesPerAttendee?: number;

  @Field(() => Int, { nullable: true })
  maxLecturesPerAttendee?: number;

  @Field(() => String, { nullable: true })
  buttonText?: string;

  @Field(() => String, { nullable: true })
  buttonLink?: string;

  @Field(() => String, { nullable: true })
  contactInfo?: string;

  @Field(() => ContactType, { nullable: true })
  contactType?: ContactType;

  @Field(() => Boolean, { nullable: true })
  isPaymentRequired?: boolean;

  @Field(() => String, { nullable: true })
  additionalPaymentInfo?: string;

  @Field(() => PaymentInfoInput, { nullable: true })
  paymentInfo?: PaymentInfoInput | null;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class EventGroupCreateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForEachEvent?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssuePartialCertificate?: boolean;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class EventGroupUpdateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForEachEvent?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssuePartialCertificate?: boolean;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class CertificateConfigCreateInput {
  @Field(() => String)
  name!: string;

  @Field(() => CertificateScope)
  scope!: CertificateScope;

  @Field(() => String, { nullable: true })
  majorEventId?: string;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => String)
  certificateTemplateId!: string;

  @Field(() => String, { nullable: true })
  certificateText?: string;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean;

  @Field(() => CertificateIssuedTo, { nullable: true })
  issuedTo?: CertificateIssuedTo;

  @Field(() => String, { nullable: true })
  certificateFieldsJson?: string;
}

@InputType()
export class CertificateConfigUpdateInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => CertificateScope, { nullable: true })
  scope?: CertificateScope;

  @Field(() => String, { nullable: true })
  majorEventId?: string;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => String, { nullable: true })
  certificateTemplateId?: string;

  @Field(() => String, { nullable: true })
  certificateText?: string;

  @Field(() => Boolean, { nullable: true })
  isActive?: boolean;

  @Field(() => CertificateIssuedTo, { nullable: true })
  issuedTo?: CertificateIssuedTo;

  @Field(() => String, { nullable: true })
  certificateFieldsJson?: string;
}

@InputType()
export class EventCreateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String)
  name!: string;

  @Field(() => Int, { nullable: true })
  creditMinutes?: number;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String)
  emoji!: string;

  @Field(() => EventType, { nullable: true })
  type?: EventType;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  shortDescription?: string;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;

  @Field(() => String, { nullable: true })
  locationDescription?: string;

  @Field(() => String, { nullable: true })
  majorEventId?: string;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => Boolean, { nullable: true })
  allowSubscription?: boolean;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date;

  @Field(() => Int, { nullable: true })
  slots?: number;

  @Field(() => Boolean, { nullable: true })
  autoSubscribe?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldCollectAttendance?: boolean;

  @Field(() => Boolean, { nullable: true })
  isOnlineAttendanceAllowed?: boolean;

  @Field(() => String, { nullable: true })
  onlineAttendanceCode?: string;

  @Field(() => Date, { nullable: true })
  onlineAttendanceStartDate?: Date;

  @Field(() => Date, { nullable: true })
  onlineAttendanceEndDate?: Date;

  @Field(() => Boolean, { nullable: true })
  publiclyVisible?: boolean;

  @Field(() => String, { nullable: true })
  youtubeCode?: string;

  @Field(() => String, { nullable: true })
  buttonText?: string;

  @Field(() => String, { nullable: true })
  buttonLink?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class EventUpdateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => Int, { nullable: true })
  creditMinutes?: number;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => EventType, { nullable: true })
  type?: EventType;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  shortDescription?: string;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;

  @Field(() => String, { nullable: true })
  locationDescription?: string;

  @Field(() => String, { nullable: true })
  majorEventId?: string;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => Boolean, { nullable: true })
  allowSubscription?: boolean;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date;

  @Field(() => Int, { nullable: true })
  slots?: number;

  @Field(() => Boolean, { nullable: true })
  autoSubscribe?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldCollectAttendance?: boolean;

  @Field(() => Boolean, { nullable: true })
  isOnlineAttendanceAllowed?: boolean;

  @Field(() => String, { nullable: true })
  onlineAttendanceCode?: string;

  @Field(() => Date, { nullable: true })
  onlineAttendanceStartDate?: Date;

  @Field(() => Date, { nullable: true })
  onlineAttendanceEndDate?: Date;

  @Field(() => Boolean, { nullable: true })
  publiclyVisible?: boolean;

  @Field(() => String, { nullable: true })
  youtubeCode?: string;

  @Field(() => String, { nullable: true })
  buttonText?: string;

  @Field(() => String, { nullable: true })
  buttonLink?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class PersonCreateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => [String], { nullable: true })
  secondaryEmails?: string[];

  @Field(() => String, { nullable: true })
  phone?: string;

  @Field(() => String, { nullable: true })
  identityDocument?: string;

  @Field(() => String, { nullable: true })
  academicId?: string;

  @Field(() => String, { nullable: true })
  userId?: string;

  @Field(() => String, { nullable: true })
  mergedIntoId?: string;

  @Field(() => String, { nullable: true })
  externalRef?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class PersonUpdateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => [String], { nullable: true })
  secondaryEmails?: string[];

  @Field(() => String, { nullable: true })
  phone?: string;

  @Field(() => String, { nullable: true })
  identityDocument?: string;

  @Field(() => String, { nullable: true })
  academicId?: string;

  @Field(() => String, { nullable: true })
  userId?: string;

  @Field(() => String, { nullable: true })
  mergedIntoId?: string;

  @Field(() => String, { nullable: true })
  externalRef?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class EventAttendanceCreateInput {
  @Field(() => String)
  personId!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => Date, { nullable: true })
  attendedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;
}

@InputType()
export class EventAttendanceCsvImportInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  csvContent!: string;

  @Field(() => String)
  selectedHeader!: string;
}

@InputType()
export class MajorEventSubscriptionCsvColumnMappingInput {
  @Field(() => String, { nullable: true })
  emailHeader?: string;

  @Field(() => String, { nullable: true })
  fullNameHeader?: string;

  @Field(() => String, { nullable: true })
  enrollmentNumberHeader?: string;

  @Field(() => String, { nullable: true })
  identityDocumentHeader?: string;

  @Field(() => String)
  subscribedEventIdsHeader!: string;
}

@InputType()
export class MajorEventSubscriptionCsvImportInput {
  @Field(() => String)
  majorEventId!: string;

  @Field(() => String)
  csvContent!: string;

  @Field(() => String)
  subscriptionStatus!: string;

  @Field(() => MajorEventSubscriptionCsvColumnMappingInput)
  columnMapping!: MajorEventSubscriptionCsvColumnMappingInput;
}

@InputType()
export class EventAttendanceUpdateInput {
  @Field(() => String, { nullable: true })
  personId?: string;

  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => Date, { nullable: true })
  attendedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;
}

@InputType()
export class EventLecturerCreateInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;
}

@InputType()
export class EventLecturerUpdateInput {
  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => String, { nullable: true })
  personId?: string;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;
}

@InputType()
export class MergeCandidateCreateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String)
  personAId!: string;

  @Field(() => String)
  personBId!: string;

  @Field(() => String)
  pairKey!: string;

  @Field(() => Float, { nullable: true })
  score?: number;

  @Field(() => MergeMatchMethod, { nullable: true })
  matchMethod?: MergeMatchMethod;

  @Field(() => String, { nullable: true })
  matchValue?: string;

  @Field(() => MergeCandidateStatus, { nullable: true })
  status?: MergeCandidateStatus;

  @Field(() => String, { nullable: true })
  resolvedById?: string;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class MergeCandidateUpdateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  personAId?: string;

  @Field(() => String, { nullable: true })
  personBId?: string;

  @Field(() => String, { nullable: true })
  pairKey?: string;

  @Field(() => Float, { nullable: true })
  score?: number;

  @Field(() => MergeMatchMethod, { nullable: true })
  matchMethod?: MergeMatchMethod;

  @Field(() => String, { nullable: true })
  matchValue?: string;

  @Field(() => MergeCandidateStatus, { nullable: true })
  status?: MergeCandidateStatus;

  @Field(() => String, { nullable: true })
  resolvedById?: string;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class MergeCandidateMergeInput {
  @Field(() => String)
  candidateId!: string;

  @Field(() => String)
  targetPersonId!: string;

  @Field(() => [PersonMergeField], { nullable: true })
  migrateFields?: PersonMergeField[];
}
