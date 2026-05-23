import { Field, Float, InputType, Int, ObjectType } from '@nestjs/graphql';

import { AttendanceCategory, AttendanceCreationMethod, AttendanceImportMatchType, SubscriptionStatus } from './enums';
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

  @Field(() => AttendanceCreationMethod)
  createdByMethod!: AttendanceCreationMethod;

  @Field(() => String, { nullable: true })
  collectedByFullName?: string;

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
