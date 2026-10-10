import { Field, Int, ObjectType } from '@nestjs/graphql';
import { CurrentUserReceipt } from '../major-event-receipts/receipt.models';

@ObjectType()
export class TicketPurchaseEventModel {
  @Field(() => String) id!: string;
  @Field(() => String) name!: string;
  @Field(() => String) emoji!: string;
  @Field(() => Date) startDate!: Date;
  @Field(() => Date) endDate!: Date;
  @Field(() => Boolean) isPubliclyListed!: boolean;
  @Field(() => String, { nullable: true }) locationDescription?: string | null;
}

@ObjectType()
export class TicketPurchaseOptionModel {
  @Field(() => String) eventId!: string;
  @Field(() => String) majorEventId!: string;
  @Field(() => String) ticketConfigId!: string;
  @Field(() => String) name!: string;
  @Field(() => String) emoji!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => Int) amountCents!: number;
  @Field(() => String, { nullable: true }) priceTierId?: string | null;
  @Field(() => String, { nullable: true }) priceTierName?: string | null;
  @Field(() => Date) expiresAt!: Date;
  @Field(() => TicketPurchaseEventModel) event!: TicketPurchaseEventModel;
}

@ObjectType()
export class TicketPurchaseModel {
  @Field(() => String) id!: string;
  @Field(() => String) eventId!: string;
  @Field(() => String) majorEventId!: string;
  @Field(() => String) ticketConfigId!: string;
  @Field(() => String) name!: string;
  @Field(() => String) emoji!: string;
  @Field(() => String) status!: string;
  @Field(() => Int) amountCents!: number;
  @Field(() => String, { nullable: true }) priceTierName?: string | null;
  @Field(() => String, { nullable: true }) rejectionReason?: string | null;
  @Field(() => Date) createdAt!: Date;
  @Field(() => Date) updatedAt!: Date;
  @Field(() => CurrentUserReceipt) receipt!: CurrentUserReceipt;
}
