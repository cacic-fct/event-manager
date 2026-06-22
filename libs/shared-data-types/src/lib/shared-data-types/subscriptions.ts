import { Field, Int, ObjectType } from '@nestjs/graphql';

import { SubscriptionCreationMethod, SubscriptionStatus } from './enums';
import { Event } from './events';
import { MajorEvent } from './major-events';
import { Person } from './people';

@ObjectType()
export class WorkspaceEventSubscription {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => Event, { nullable: true })
  event?: Event;

  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person?: Person;

  @Field(() => String, { nullable: true })
  eventGroupSubscriptionId?: string;

  @Field(() => String, { nullable: true })
  majorEventSubscriptionId?: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => SubscriptionCreationMethod)
  createdByMethod!: SubscriptionCreationMethod;

  @Field(() => Boolean)
  isLecturerSubscription!: boolean;
}

@ObjectType()
export class WorkspaceMajorEventSubscriptionEvent {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  eventName!: string;

  @Field(() => Date, { nullable: true })
  eventStartDate?: Date;

  @Field(() => Boolean)
  subscribed!: boolean;

  @Field(() => Boolean)
  isLecturerSubscription!: boolean;
}

@ObjectType()
export class WorkspaceMajorEventSubscription {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  majorEventId!: string;

  @Field(() => MajorEvent, { nullable: true })
  majorEvent?: MajorEvent;

  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person?: Person;

  @Field(() => SubscriptionStatus)
  subscriptionStatus!: SubscriptionStatus;

  @Field(() => Int, { nullable: true })
  amountPaid?: number;

  @Field(() => Date, { nullable: true })
  paymentDate?: Date;

  @Field(() => String, { nullable: true })
  paymentTier?: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => SubscriptionCreationMethod)
  createdByMethod!: SubscriptionCreationMethod;

  @Field(() => [WorkspaceMajorEventSubscriptionEvent])
  events!: WorkspaceMajorEventSubscriptionEvent[];
}
