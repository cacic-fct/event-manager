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
  creditMinutes?: number | null;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String)
  emoji!: string;

  @Field(() => EventType)
  type!: EventType;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  shortDescription?: string | null;

  @Field(() => Float, { nullable: true })
  latitude?: number | null;

  @Field(() => Float, { nullable: true })
  longitude?: number | null;

  @Field(() => String, { nullable: true })
  locationDescription?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => MajorEvent, { nullable: true })
  majorEvent?: MajorEvent | null;

  @Field(() => String, { nullable: true })
  eventGroupId?: string | null;

  @Field(() => EventGroup, { nullable: true })
  eventGroup?: EventGroup | null;

  @Field(() => [EventAttendance], { nullable: true })
  attendances?: EventAttendance[] | null;

  @Field(() => [EventLecturer], { nullable: true })
  lecturers?: EventLecturer[] | null;

  @Field(() => Boolean)
  allowSubscription!: boolean;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date | null;

  @Field(() => Int, { nullable: true })
  slots?: number | null;

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
  shouldProvideSubscriberListToLecturer?: boolean | null;

  @Field(() => String, { nullable: true })
  onlineAttendanceCode?: string | null;

  @Field(() => Date, { nullable: true })
  onlineAttendanceStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  onlineAttendanceEndDate?: Date | null;

  @Field(() => Boolean)
  publiclyVisible!: boolean;

  @Field(() => String, { nullable: true })
  youtubeCode?: string | null;

  @Field(() => String, { nullable: true })
  buttonText?: string | null;

  @Field(() => String, { nullable: true })
  buttonLink?: string | null;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string | null;
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
