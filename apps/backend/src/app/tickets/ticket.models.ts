import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import { TicketExpirationMode, TicketIssueSource, TicketLifecycleState, TicketSubscriptionRequirement } from '@cacic-fct/shared-ticketing';

@ObjectType()
export class TicketEventSummaryModel {
  @Field(() => String) id!: string;
  @Field(() => String) name!: string;
  @Field(() => String) emoji!: string;
  @Field(() => String) type!: string;
  @Field(() => Date) startsAt!: Date;
  @Field(() => Date) endsAt!: Date;
  @Field(() => String, { nullable: true }) locationDescription!: string | null;
  @Field(() => String, { nullable: true }) publicUrl!: string | null;
}

@ObjectType()
export class TicketPersonSummaryModel {
  @Field(() => String) personId!: string;
  @Field(() => String) fullName!: string;
  @Field(() => String) firstName!: string;
  @Field(() => String, { nullable: true }) avatarUrl!: string | null;
  @Field(() => String, { nullable: true }) redactedIdentityDocument!: string | null;
}

@ObjectType()
export class TicketPriceOptionModel {
  @Field(() => String) id!: string;
  @Field(() => String, { nullable: true }) priceTierId!: string | null;
  @Field(() => String) label!: string;
  @Field(() => Int) amountCents!: number;
}

@InputType('TicketPriceOptionInput')
export class TicketPriceOptionInputModel {
  @Field(() => String, { nullable: true }) id?: string | null;
  @Field(() => String, { nullable: true }) priceTierId?: string | null;
  @Field(() => String) label!: string;
  @Field(() => Int) amountCents!: number;
}

@ObjectType()
export class TicketRecipientPolicyModel {
  @Field(() => String) subscriptionRequirement!: TicketSubscriptionRequirement;
  @Field(() => Boolean) requiresUnesp!: boolean;
  @Field(() => [String]) requiredAcademicIdPrefixes!: string[];
  @Field(() => [String]) requiredCourseCodes!: string[];
  @Field(() => Boolean) requiresAccountManagerVerification!: boolean;
  @Field(() => [String]) allowedPriceTierIds!: string[];
}

@InputType('TicketRecipientPolicyInput')
export class TicketRecipientPolicyInputModel {
  @Field(() => String) subscriptionRequirement!: TicketSubscriptionRequirement;
  @Field(() => Boolean) requiresUnesp!: boolean;
  @Field(() => [String]) requiredAcademicIdPrefixes!: string[];
  @Field(() => [String]) requiredCourseCodes!: string[];
  @Field(() => Boolean) requiresAccountManagerVerification!: boolean;
  @Field(() => [String]) allowedPriceTierIds!: string[];
}

@ObjectType()
export class TicketPurchaseVisibilityModel {
  @Field(() => String) subscriptionRequirement!: 'REQUIRED';
  @Field(() => Boolean) requiresUnesp!: boolean;
  @Field(() => [String]) requiredAcademicIdPrefixes!: string[];
  @Field(() => [String]) requiredCourseCodes!: string[];
  @Field(() => Boolean) requiresAccountManagerVerification!: boolean;
  @Field(() => [String]) allowedPriceTierIds!: string[];
  @Field(() => Boolean) requiresValidatedSubscription!: true;
}

@InputType('TicketPurchaseVisibilityInput')
export class TicketPurchaseVisibilityInputModel {
  @Field(() => String) subscriptionRequirement!: 'REQUIRED';
  @Field(() => Boolean) requiresUnesp!: boolean;
  @Field(() => [String]) requiredAcademicIdPrefixes!: string[];
  @Field(() => [String]) requiredCourseCodes!: string[];
  @Field(() => Boolean) requiresAccountManagerVerification!: boolean;
  @Field(() => [String]) allowedPriceTierIds!: string[];
  @Field(() => Boolean) requiresValidatedSubscription!: true;
}

@ObjectType()
export class TicketConfigModel {
  @Field(() => String) id!: string;
  @Field(() => String) eventId!: string;
  @Field(() => Boolean) enabled!: boolean;
  @Field(() => String, { nullable: true }) displayName!: string | null;
  @Field(() => String, { nullable: true }) displayEmoji!: string | null;
  @Field(() => String, { nullable: true }) description!: string | null;
  @Field(() => String, { nullable: true }) transferEligibilityDescription!: string | null;
  @Field(() => Boolean) transferable!: boolean;
  @Field(() => Boolean) issueOnEventSubscription!: boolean;
  @Field(() => Boolean) issueOnMajorEventSubscription!: boolean;
  @Field(() => [String]) includedPriceTierIds!: string[];
  @Field(() => TicketRecipientPolicyModel) recipientPolicy!: TicketRecipientPolicyModel;
  @Field(() => Boolean) purchaseEnabled!: boolean;
  @Field(() => TicketPurchaseVisibilityModel) purchaseVisibility!: TicketPurchaseVisibilityModel;
  @Field(() => [TicketPriceOptionModel]) priceOptions!: TicketPriceOptionModel[];
  @Field(() => String) expirationMode!: TicketExpirationMode;
  @Field(() => Date, { nullable: true }) customExpiresAt!: Date | null;
  @Field(() => Date) createdAt!: Date;
  @Field(() => Date) updatedAt!: Date;
}

@InputType('TicketConfigInput')
export class TicketConfigInputModel {
  @Field(() => String) eventId!: string;
  @Field(() => Boolean) enabled!: boolean;
  @Field(() => String, { nullable: true }) displayName?: string | null;
  @Field(() => String, { nullable: true }) displayEmoji?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) transferEligibilityDescription?: string | null;
  @Field(() => Boolean) transferable!: boolean;
  @Field(() => Boolean) issueOnEventSubscription!: boolean;
  @Field(() => Boolean) issueOnMajorEventSubscription!: boolean;
  @Field(() => [String]) includedPriceTierIds!: string[];
  @Field(() => TicketRecipientPolicyInputModel) recipientPolicy!: TicketRecipientPolicyInputModel;
  @Field(() => Boolean) purchaseEnabled!: boolean;
  @Field(() => TicketPurchaseVisibilityInputModel) purchaseVisibility!: TicketPurchaseVisibilityInputModel;
  @Field(() => [TicketPriceOptionInputModel]) priceOptions!: TicketPriceOptionInputModel[];
  @Field(() => String) expirationMode!: TicketExpirationMode;
  @Field(() => Date, { nullable: true }) customExpiresAt?: Date | null;
}

@ObjectType()
export class AdminTicketEligibilityWarningModel {
  @Field(() => String) code!: string;
  @Field(() => String) message!: string;
}

@ObjectType()
export class AdminTicketEligibilityModel {
  @Field(() => Boolean) eligible!: boolean;
  @Field(() => [AdminTicketEligibilityWarningModel]) warnings!: AdminTicketEligibilityWarningModel[];
}

@ObjectType()
export class AdminTicketConfigModel extends TicketConfigModel {
  @Field(() => TicketEventSummaryModel) event!: TicketEventSummaryModel;
  @Field(() => String, { nullable: true }) majorEventId!: string | null;
  @Field(() => [AdminTicketEligibilityWarningModel]) warnings!: AdminTicketEligibilityWarningModel[];
}

@ObjectType()
export class WalletTicketModel {
  @Field(() => String) id!: string;
  @Field(() => String) eventId!: string;
  @Field(() => String) name!: string;
  @Field(() => String) emoji!: string;
  @Field(() => String, { nullable: true }) description!: string | null;
  @Field(() => String, { nullable: true }) transferEligibilityDescription!: string | null;
  @Field(() => String) status!: TicketLifecycleState;
  @Field(() => Boolean) transferable!: boolean;
  @Field(() => Date) effectiveExpiresAt!: Date;
  @Field(() => TicketEventSummaryModel) event!: TicketEventSummaryModel;
  @Field(() => TicketPersonSummaryModel, { nullable: true }) holder!: TicketPersonSummaryModel | null;
  @Field(() => String, { nullable: true }) aztecPayload!: string | null;
}

@ObjectType()
export class TicketTransferModel {
  @Field(() => String) id!: string;
  @Field(() => WalletTicketModel) ticket!: WalletTicketModel;
  @Field(() => TicketEventSummaryModel) event!: TicketEventSummaryModel;
  @Field(() => TicketPersonSummaryModel, { nullable: true }) sender!: TicketPersonSummaryModel | null;
  @Field(() => TicketPersonSummaryModel, { nullable: true }) recipient!: TicketPersonSummaryModel | null;
  @Field(() => String, { nullable: true }) submittedDestinationIdentityDocument!: string | null;
  @Field(() => String) senderStatus!: string;
  @Field(() => String) recipientStatus!: string;
  @Field(() => String, { nullable: true }) ignoreReason!: string | null;
  @Field(() => Boolean) initiatedByAdmin!: boolean;
  @Field(() => TicketTransferAdminIdentityModel, { nullable: true }) initiatingAdmin!: TicketTransferAdminIdentityModel | null;
  @Field(() => Date) createdAt!: Date;
  @Field(() => Date) updatedAt!: Date;
  @Field(() => Date, { nullable: true }) expiresFromListAt!: Date | null;
  @Field(() => Boolean) canCancel!: boolean;
  @Field(() => Boolean) canAccept!: boolean;
}

@ObjectType()
export class TicketTransferAdminIdentityModel {
  @Field(() => String) personId!: string;
  @Field(() => String) firstName!: string;
  @Field(() => String, { nullable: true }) avatarUrl!: string | null;
}

@ObjectType()
export class TicketTransferListsModel {
  @Field(() => [TicketTransferModel]) incomingPending!: TicketTransferModel[];
  @Field(() => [TicketTransferModel]) incomingIgnored!: TicketTransferModel[];
  @Field(() => [TicketTransferModel]) outgoing!: TicketTransferModel[];
}

@ObjectType()
export class AdminTicketHistoryEntryModel {
  @Field(() => String) id!: string;
  @Field(() => String) ticketId!: string;
  @Field(() => String) operation!: string;
  @Field(() => TicketPersonSummaryModel, { nullable: true }) previousHolder!: TicketPersonSummaryModel | null;
  @Field(() => TicketPersonSummaryModel, { nullable: true }) newHolder!: TicketPersonSummaryModel | null;
  @Field(() => String, { nullable: true }) actorName!: string | null;
  @Field(() => String, { nullable: true }) reason!: string | null;
  @Field(() => Date) createdAt!: Date;
}

@ObjectType()
export class AdminEventTicketModel extends WalletTicketModel {
  @Field(() => TicketPersonSummaryModel, { nullable: true }) originalHolder!: TicketPersonSummaryModel | null;
  @Field(() => String) source!: TicketIssueSource;
  @Field(() => String, { nullable: true }) sourceReference!: string | null;
  @Field(() => AdminTicketHistoryEntryModel, { nullable: true }) lastHistoryEntry!: AdminTicketHistoryEntryModel | null;
}

@ObjectType()
export class AdminEventTicketListModel {
  @Field(() => [AdminEventTicketModel]) tickets!: AdminEventTicketModel[];
  @Field(() => String, { nullable: true }) nextCursor!: string | null;
  @Field(() => Int) totalCount!: number;
}

@InputType('AdminTicketIssueInput')
export class AdminTicketIssueInputModel {
  @Field(() => String) eventId!: string;
  @Field(() => String) personId!: string;
  @Field(() => String) reason!: string;
}

@InputType('AdminTicketRevokeInput')
export class AdminTicketRevokeInputModel {
  @Field(() => String) ticketId!: string;
  @Field(() => String) reason!: string;
}

@InputType('AdminTicketTransferInput')
export class AdminTicketTransferInputModel {
  @Field(() => String) ticketId!: string;
  @Field(() => String) recipientPersonId!: string;
  @Field(() => String) reason!: string;
}
