import { Field, InputType, Int } from '@nestjs/graphql';

@InputType()
export class WorkspaceEventSubscriptionCreateInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  personId!: string;
}

@InputType()
export class WorkspaceMajorEventSubscriptionCreateInput {
  @Field(() => String)
  majorEventId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => String, { nullable: true })
  subscriptionStatus?: string;

  @Field(() => Int, { nullable: true })
  amountPaid?: number;

  @Field(() => Date, { nullable: true })
  paymentDate?: Date;

  @Field(() => String, { nullable: true })
  paymentTier?: string;

  @Field(() => [String])
  selectedEventIds!: string[];
}

@InputType()
export class WorkspaceMajorEventSubscriptionUpdateInput {
  @Field(() => String, { nullable: true })
  subscriptionStatus?: string;

  @Field(() => Int, { nullable: true })
  amountPaid?: number;

  @Field(() => Date, { nullable: true })
  paymentDate?: Date;

  @Field(() => String, { nullable: true })
  paymentTier?: string;

  @Field(() => [String], { nullable: true })
  selectedEventIds?: string[];
}

@InputType()
export class MajorEventSubscriptionCsvColumnMappingInput {
  @Field(() => String, { nullable: true })
  emailHeader?: string;

  @Field(() => String, { nullable: true })
  fullNameHeader?: string;

  @Field(() => String, { nullable: true })
  enrollmentNumberHeader?: string;

  @Field(() => String, { nullable: true })
  identityDocumentHeader?: string;

  @Field(() => String)
  subscribedEventIdsHeader!: string;
}

@InputType()
export class MajorEventSubscriptionCsvImportInput {
  @Field(() => String)
  majorEventId!: string;

  @Field(() => String)
  csvContent!: string;

  @Field(() => String)
  subscriptionStatus!: string;

  @Field(() => MajorEventSubscriptionCsvColumnMappingInput)
  columnMapping!: MajorEventSubscriptionCsvColumnMappingInput;
}
