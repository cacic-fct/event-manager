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
  pixKey?: string | null;

  @Field(() => String, { nullable: true })
  pixCity?: string | null;

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
  description?: string | null;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date | null;

  @Field(() => Int, { nullable: true })
  maxCoursesPerAttendee?: number | null;

  @Field(() => Int, { nullable: true })
  maxLecturesPerAttendee?: number | null;

  @Field(() => Int, { nullable: true })
  maxUncategorizedPerAttendee?: number | null;

  @Field(() => Boolean)
  rankedSubscriptionEnabled!: boolean;

  @Field(() => String, { nullable: true })
  buttonText?: string | null;

  @Field(() => String, { nullable: true })
  buttonLink?: string | null;

  @Field(() => String, { nullable: true })
  contactInfo?: string | null;

  @Field(() => ContactType, { nullable: true })
  contactType?: ContactType | null;

  @Field(() => Boolean)
  isPaymentRequired!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificateForNonPayingAttendees!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificateForNonSubscribedAttendees!: boolean;

  @Field(() => String, { nullable: true })
  additionalPaymentInfo?: string | null;

  @Field(() => PaymentInfo, { nullable: true })
  paymentInfo?: PaymentInfo | null;

  @Field(() => [MajorEventPrice], { nullable: true })
  majorEventPrices?: MajorEventPrice[] | null;

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
