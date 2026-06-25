import { Field, Float, InputType, Int, ObjectType } from '@nestjs/graphql';

import {
  AttendanceCategory,
  AttendanceCreationMethod,
  AttendanceImportMatchType,
  OfflineEventAttendanceCommitStatus,
  OfflineEventAttendanceSubmissionStatus,
  SubscriptionStatus,
} from './enums';
import { Event } from './events';
import { Person } from './people';

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

  @Field(() => AttendanceCategory)
  category!: AttendanceCategory;

  @Field(() => Date)
  attendedAt!: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  committedById?: string;

  @Field(() => AttendanceCreationMethod)
  createdByMethod!: AttendanceCreationMethod;

  @Field(() => String, { nullable: true })
  collectedByFullName?: string;

  @Field(() => String, { nullable: true })
  committedByFullName?: string;

  @Field(() => Float, { nullable: true })
  collectedLatitude?: number;

  @Field(() => Float, { nullable: true })
  collectedLongitude?: number;

  @Field(() => Float, { nullable: true })
  collectedAccuracyMeters?: number;
}

@ObjectType()
export class EventAttendanceScannerFeedItem {
  @Field(() => String)
  personId!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => String, { nullable: true })
  fullName?: string;

  @Field(() => String, { nullable: true })
  unespRole?: string;

  @Field(() => SubscriptionStatus, { nullable: true })
  subscriptionStatus?: SubscriptionStatus;

  @Field(() => Date, { nullable: true })
  attendedAt?: Date;

  @Field(() => AttendanceCreationMethod, { nullable: true })
  createdByMethod?: AttendanceCreationMethod;

  @Field(() => String, { nullable: true })
  collectedByFirstName?: string;

  @Field(() => String, { nullable: true })
  committedByFirstName?: string;
}

@ObjectType()
export class OfflineEventAttendanceSubmission {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  clientId!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => Event, { nullable: true })
  event?: Event;

  @Field(() => String, { nullable: true })
  personId?: string;

  @Field(() => Person, { nullable: true })
  person?: Person;

  @Field(() => OfflineEventAttendanceSubmissionStatus)
  status!: OfflineEventAttendanceSubmissionStatus;

  @Field(() => AttendanceCreationMethod)
  createdByMethod!: AttendanceCreationMethod;

  @Field(() => String, { nullable: true })
  scannerCode?: string;

  @Field(() => String, { nullable: true })
  manualValue?: string;

  @Field(() => Date)
  collectedAt!: Date;

  @Field(() => String, { nullable: true })
  authorUserId?: string;

  @Field(() => String, { nullable: true })
  authorName?: string;

  @Field(() => String, { nullable: true })
  authorEmail?: string;

  @Field(() => String)
  submittedById!: string;

  @Field(() => String, { nullable: true })
  submittedByFullName?: string;

  @Field(() => Date)
  submittedAt!: Date;

  @Field(() => String, { nullable: true })
  stagedReason?: string;

  @Field(() => String, { nullable: true })
  resolutionError?: string;

  @Field(() => Float, { nullable: true })
  collectedLatitude?: number;

  @Field(() => Float, { nullable: true })
  collectedLongitude?: number;

  @Field(() => Float, { nullable: true })
  collectedAccuracyMeters?: number;

  @Field(() => Date, { nullable: true })
  committedAt?: Date;

  @Field(() => String, { nullable: true })
  committedById?: string;

  @Field(() => String, { nullable: true })
  committedByFullName?: string;

  @Field(() => Date, { nullable: true })
  rejectedAt?: Date;

  @Field(() => String, { nullable: true })
  rejectedById?: string;

  @Field(() => String, { nullable: true })
  rejectedByFullName?: string;

  @Field(() => String, { nullable: true })
  rejectionReason?: string;
}

@ObjectType()
export class OfflineEventAttendanceCommitResult {
  @Field(() => String)
  clientId!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => OfflineEventAttendanceCommitStatus)
  status!: OfflineEventAttendanceCommitStatus;

  @Field(() => String, { nullable: true })
  message?: string;

  @Field(() => EventAttendance, { nullable: true })
  attendance?: EventAttendance;

  @Field(() => OfflineEventAttendanceSubmission, { nullable: true })
  stagedSubmission?: OfflineEventAttendanceSubmission;
}

@InputType()
export class AttendanceCollectionLocationInput {
  @Field(() => Float)
  latitude!: number;

  @Field(() => Float)
  longitude!: number;

  @Field(() => Float)
  accuracyMeters!: number;
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

  @Field(() => AttendanceCategory)
  category!: AttendanceCategory;
}

@ObjectType()
export class MajorEventUserAttendance {
  @Field(() => String)
  majorEventId!: string;

  @Field(() => String, { nullable: true })
  subscriptionId?: string;

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
