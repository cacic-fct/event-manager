import { Field, InputType, Int } from '@nestjs/graphql';

import { ContactType, PriceType } from './enums';

@InputType()
export class PaymentInfoInput {
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
}

@InputType()
export class PriceTierInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => Int)
  value!: number;
}

@InputType()
export class MajorEventPriceInput {
  @Field(() => PriceType)
  type!: PriceType;

  @Field(() => [PriceTierInput])
  tiers!: PriceTierInput[];
}

@InputType()
export class MajorEventCreateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;

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

  @Field(() => Boolean, { nullable: true })
  rankedSubscriptionEnabled?: boolean;

  @Field(() => String, { nullable: true })
  buttonText?: string;

  @Field(() => String, { nullable: true })
  buttonLink?: string;

  @Field(() => String, { nullable: true })
  contactInfo?: string;

  @Field(() => ContactType, { nullable: true })
  contactType?: ContactType;

  @Field(() => Boolean, { nullable: true })
  isPaymentRequired?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForNonPayingAttendees?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;

  @Field(() => String, { nullable: true })
  additionalPaymentInfo?: string;

  @Field(() => PaymentInfoInput, { nullable: true })
  paymentInfo?: PaymentInfoInput | null;

  @Field(() => MajorEventPriceInput, { nullable: true })
  price?: MajorEventPriceInput | null;
}

@InputType()
export class MajorEventUpdateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;

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

  @Field(() => Boolean, { nullable: true })
  rankedSubscriptionEnabled?: boolean;

  @Field(() => String, { nullable: true })
  buttonText?: string;

  @Field(() => String, { nullable: true })
  buttonLink?: string;

  @Field(() => String, { nullable: true })
  contactInfo?: string;

  @Field(() => ContactType, { nullable: true })
  contactType?: ContactType;

  @Field(() => Boolean, { nullable: true })
  isPaymentRequired?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForNonPayingAttendees?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;

  @Field(() => String, { nullable: true })
  additionalPaymentInfo?: string;

  @Field(() => PaymentInfoInput, { nullable: true })
  paymentInfo?: PaymentInfoInput | null;

  @Field(() => MajorEventPriceInput, { nullable: true })
  price?: MajorEventPriceInput | null;
}

@InputType()
export class MajorEventClonePartsInput {
  @Field(() => Boolean, { nullable: true })
  certificateConfig?: boolean;

  @Field(() => Boolean, { nullable: true })
  subscriptionSettings?: boolean;

  @Field(() => Boolean, { nullable: true })
  paymentSettings?: boolean;
}

@InputType()
export class MajorEventCloneInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => MajorEventClonePartsInput, { nullable: true })
  parts?: MajorEventClonePartsInput;
}
