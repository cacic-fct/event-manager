import { Field, Float, InputType, Int, ObjectType } from '@nestjs/graphql';
import { ReceiptRejectionCode } from './receipt.types';

@ObjectType()
export class CurrentUserReceipt {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  fileName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => Int)
  sizeBytes!: number;

  @Field(() => Date)
  uploadedAt!: Date;

  @Field(() => Date)
  expiresAt!: Date;

  @Field(() => String)
  imageUrl!: string;

  @Field(() => String)
  processingStatus!: string;

  @Field(() => Boolean, { nullable: true })
  amountMatched?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  nameMatched?: boolean | null;
}

@ObjectType()
export class AdminReceiptEventSummaryModel {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => String)
  type!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String, { nullable: true })
  locationDescription?: string | null;

  @Field(() => Int, { nullable: true })
  slots?: number | null;

  @Field(() => Int, { nullable: true })
  slotsAvailable?: number | null;

  @Field(() => String, { nullable: true })
  eventGroupId?: string | null;

  @Field(() => String, { nullable: true })
  eventGroupName?: string | null;

  @Field(() => Int, { nullable: true })
  preferenceOrder?: number | null;

  @Field(() => Boolean)
  autoSubscribe!: boolean;

  @Field(() => Boolean)
  selectedForConfirmation!: boolean;

  @Field(() => Boolean)
  hasScheduleConflict!: boolean;

  @Field(() => Boolean)
  hasNoSlots!: boolean;
}

@ObjectType()
export class AdminReceiptModel {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  fileName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => Int)
  sizeBytes!: number;

  @Field(() => Date)
  uploadedAt!: Date;

  @Field(() => Date)
  expiresAt!: Date;

  @Field(() => String)
  imageUrl!: string;

  @Field(() => String)
  processingStatus!: string;

  @Field(() => String, { nullable: true })
  ocrText?: string | null;

  @Field(() => Boolean, { nullable: true })
  amountMatched?: boolean | null;

  @Field(() => String, { nullable: true })
  matchedAmountText?: string | null;

  @Field(() => Boolean, { nullable: true })
  nameMatched?: boolean | null;

  @Field(() => String, { nullable: true })
  matchedNameText?: string | null;
}

@ObjectType()
export class AdminReceiptQueueItemModel {
  @Field(() => String, { nullable: true }) category?: string;
  @Field(() => String, { nullable: true }) purchaseId?: string | null;
  @Field(() => String, { nullable: true }) ticketName?: string | null;
  @Field(() => Date, { nullable: true }) subscriptionCreatedAt?: Date;

  @Field(() => String)
  subscriptionId!: string;

  @Field(() => String)
  majorEventId!: string;

  @Field(() => String)
  majorEventName!: string;

  @Field(() => Date)
  majorEventCreatedAt!: Date;

  @Field(() => Date)
  majorEventEndDate!: Date;

  @Field(() => String)
  personId!: string;

  @Field(() => String)
  personName!: string;

  @Field(() => String, { nullable: true })
  personEmail?: string | null;

  @Field(() => String, { nullable: true })
  personPhone?: string | null;

  @Field(() => Float, { nullable: true })
  amountPaid?: number | null;

  @Field(() => String, { nullable: true })
  paymentTier?: string | null;

  @Field(() => String)
  subscriptionFlow!: string;

  @Field(() => Int, { nullable: true })
  desiredCourses?: number | null;

  @Field(() => Int, { nullable: true })
  desiredLectures?: number | null;

  @Field(() => Int, { nullable: true })
  desiredUncategorized?: number | null;

  @Field(() => String)
  subscriptionStatus!: string;

  @Field(() => Date)
  subscriptionUpdatedAt!: Date;

  @Field(() => String, { nullable: true })
  receiptRejectionReason?: string | null;

  @Field(() => AdminReceiptModel, { nullable: true })
  receipt?: AdminReceiptModel | null;

  @Field(() => [AdminReceiptEventSummaryModel])
  events!: AdminReceiptEventSummaryModel[];
}

@ObjectType()
export class ReceiptPaymentTierModel {
  @Field(() => String) id!: string;
  @Field(() => String) name!: string;
}

@ObjectType()
export class AdminReceiptQueue {
  @Field(() => Int, { nullable: true }) subscriptionCount?: number;
  @Field(() => Int, { nullable: true }) ticketCount?: number;
  @Field(() => [ReceiptPaymentTierModel], { nullable: true }) availablePaymentTiers?: ReceiptPaymentTierModel[];

  @Field(() => Int)
  pendingCount!: number;

  @Field(() => [AdminReceiptQueueItemModel])
  items!: AdminReceiptQueueItemModel[];
}

@ObjectType()
export class AdminReceiptPendingCount {
  @Field(() => Int)
  pendingCount!: number;
}

@ObjectType()
export class AdminReceiptValidationResultModel {
  @Field(() => String)
  actionId!: string;

  @Field(() => AdminReceiptQueueItemModel)
  item!: AdminReceiptQueueItemModel;
}

@InputType()
export class ApproveReceiptInput {
  @Field(() => String)
  subscriptionId!: string;

  @Field(() => String)
  receiptId!: string;

  @Field(() => [String], { nullable: true })
  selectedEventIds?: string[];
}

@InputType()
export class RejectReceiptInput {
  @Field(() => String)
  subscriptionId!: string;

  @Field(() => String, { nullable: true })
  receiptId?: string;

  @Field(() => String)
  rejectionCode!: ReceiptRejectionCode;

  @Field(() => String, { nullable: true })
  reason?: string;
}
