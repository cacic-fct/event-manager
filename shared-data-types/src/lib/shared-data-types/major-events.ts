import { Field, Int, ObjectType } from '@nestjs/graphql';

import { ContactType, PriceType } from './enums';

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

  @Field(() => String, { nullable: true })
  pixKey?: string;

  @Field(() => String, { nullable: true })
  pixCity?: string;

  @Field(() => String)
  majorEventId!: string;
}

@ObjectType()
export class MajorEventPriceTier {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => Int)
  value!: number;
}

@ObjectType()
export class MajorEventPrice {
  @Field(() => String)
  id!: string;

  @Field(() => PriceType)
  type!: PriceType;

  @Field(() => [MajorEventPriceTier])
  tiers!: MajorEventPriceTier[];
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

  @Field(() => Int, { nullable: true })
  maxUncategorizedPerAttendee?: number;

  @Field(() => Boolean)
  rankedSubscriptionEnabled!: boolean;

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

  @Field(() => Boolean)
  shouldIssueCertificateForNonPayingAttendees!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificateForNonSubscribedAttendees!: boolean;

  @Field(() => String, { nullable: true })
  additionalPaymentInfo?: string;

  @Field(() => PaymentInfo, { nullable: true })
  paymentInfo?: PaymentInfo;

  @Field(() => [MajorEventPrice], { nullable: true })
  majorEventPrices?: MajorEventPrice[];

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
