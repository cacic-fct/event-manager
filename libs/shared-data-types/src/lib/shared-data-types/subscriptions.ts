import { Field, Int, ObjectType } from '@nestjs/graphql';

import { EventType, SubscriptionCreationMethod, SubscriptionStatus } from './enums';
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
  event?: Event | null;

  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person?: Person | null;

  @Field(() => String, { nullable: true })
  eventGroupSubscriptionId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventSubscriptionId!: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

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

  @Field(() => String, { nullable: true })
  eventEmoji?: string | null;

  @Field(() => EventType, { nullable: true })
  eventType?: EventType | null;

  @Field(() => String, { nullable: true })
  eventShortDescription?: string | null;

  @Field(() => Date, { nullable: true })
  eventEndDate?: Date | null;

  @Field(() => String, { nullable: true })
  eventLocationDescription?: string | null;

  @Field(() => Int, { nullable: true })
  eventSlots?: number | null;

  @Field(() => Int, { nullable: true })
  availableSlots?: number | null;

  @Field(() => Int, { nullable: true })
  projectedQueuePosition?: number | null;

  @Field(() => Date, { nullable: true })
  eventStartDate?: Date | null;

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
  majorEvent?: MajorEvent | null;

  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person?: Person | null;

  @Field(() => SubscriptionStatus)
  subscriptionStatus!: SubscriptionStatus;

  @Field(() => Int, { nullable: true })
  amountPaid?: number | null;

  @Field(() => Date, { nullable: true })
  paymentDate?: Date | null;

  @Field(() => String, { nullable: true })
  paymentTier?: string | null;

  @Field(() => Boolean)
  imageLicenseAgreementAccepted!: boolean;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

  @Field(() => SubscriptionCreationMethod)
  createdByMethod!: SubscriptionCreationMethod;

  @Field(() => [WorkspaceMajorEventSubscriptionEvent])
  events!: WorkspaceMajorEventSubscriptionEvent[];
}
