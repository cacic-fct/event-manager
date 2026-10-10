import {
  InterestTargetType,
  SubscriptionStatus,
  type InterestTargetType as InterestTargetTypeValue,
  type SubscriptionStatus as SubscriptionStatusValue,
} from '@cacic-fct/shared-data-types';
import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class EventInterestPerson {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  email?: string | null;
}

@ObjectType()
export class EventInterest {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => EventInterestPerson, { nullable: true })
  person?: EventInterestPerson | null;

  @Field(() => InterestTargetType)
  targetType!: InterestTargetTypeValue;

  @Field(() => String)
  targetId!: string;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  eventGroupId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

  @Field(() => Boolean, { nullable: true })
  isSubscribed?: boolean;
}

@InputType()
export class ConvertEventInterestToSubscriptionInput {
  @Field(() => String)
  interestId!: string;

  @Field(() => [String], { nullable: true })
  selectedEventIds?: string[] | null;

  @Field(() => SubscriptionStatus, { nullable: true })
  subscriptionStatus?: SubscriptionStatusValue | null;

  @Field(() => Int, { nullable: true })
  amountPaid?: number | null;

  @Field(() => Date, { nullable: true })
  paymentDate?: Date | null;

  @Field(() => String, { nullable: true })
  paymentTier?: string | null;

  @Field(() => Boolean, { nullable: true })
  imageLicenseAgreementAccepted?: boolean | null;
}

@ObjectType()
export class EventInterestConversion {
  @Field(() => EventInterest)
  interest!: EventInterest;

  @Field(() => String)
  personId!: string;

  @Field(() => String, { nullable: true })
  subscriptionId?: string | null;

  @Field(() => String, { nullable: true })
  eventSubscriptionId?: string | null;

  @Field(() => String, { nullable: true })
  eventGroupSubscriptionId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventSubscriptionId?: string | null;

  @Field(() => SubscriptionStatus, { nullable: true })
  subscriptionStatus?: SubscriptionStatusValue | null;
}

@ObjectType()
export class CurrentUserInterestState {
  @Field(() => EventInterest, { nullable: true })
  interest?: EventInterest | null;

  @Field(() => Boolean)
  subscribed!: boolean;

  @Field(() => Date)
  endsAt!: Date;

  @Field(() => Boolean)
  enabled!: boolean;
}
