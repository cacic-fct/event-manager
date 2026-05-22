import { Field, Float, InputType, Int } from '@nestjs/graphql';

import { EventType } from './enums';

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
  shouldIssueCertificateForNonPayingAttendees?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldCollectAttendance?: boolean;

  @Field(() => Boolean, { nullable: true })
  isOnlineAttendanceAllowed?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldProvideSubscriberListToLecturer?: boolean;

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

  @Field(() => [String], { nullable: true })
  lecturerPersonIds?: string[];

  @Field(() => [String], { nullable: true })
  attendanceCollectorPersonIds?: string[];

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
  shouldIssueCertificateForNonPayingAttendees?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldCollectAttendance?: boolean;

  @Field(() => Boolean, { nullable: true })
  isOnlineAttendanceAllowed?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldProvideSubscriberListToLecturer?: boolean;

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
