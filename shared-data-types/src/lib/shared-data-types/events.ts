import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import { EventType } from './enums';
import { EventAttendance } from './attendance';
import { EventLecturer } from './lecturers';
import { EventGroup } from './event-groups';
import { MajorEvent } from './major-events';

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
  shouldIssueCertificateForNonPayingAttendees!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificateForNonSubscribedAttendees!: boolean;

  @Field(() => Boolean)
  shouldCollectAttendance!: boolean;

  @Field(() => Boolean)
  isOnlineAttendanceAllowed!: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldProvideSubscriberListToLecturer?: boolean;

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

@ObjectType()
export class PlacePreset {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;

  @Field(() => String, { nullable: true })
  locationDescription?: string;

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
