import type { Prisma } from '@prisma/client';
import type { TransferResource, TransferResourceKind } from '@cacic-fct/shared-data-transfer';
import type { AssertContract, EqualContract } from '@cacic-fct/shared-data-transfer';

type Resource<K extends TransferResourceKind> = Extract<TransferResource, { kind: K }>;
type Data<K extends TransferResourceKind> = Resource<K>['data'];
type DataField<K extends TransferResourceKind, Field extends keyof Data<K>> = Exclude<Data<K>[Field], undefined>;
type Serialized<T> = T extends Date ? string : T extends readonly (infer Item)[] ? Serialized<Item>[] : T;
type DbField<Row, Field extends keyof Row> = Serialized<Row[Field]>;
type CheckSame<Left, Right> = EqualContract<Left, Right>;

// The generated Prisma scalar IDs remain the storage anchor for the portable resource identities.
type _MajorEventId = AssertContract<
  CheckSame<Resource<'major-event'>['id'], Prisma.MajorEventGetPayload<Record<never, never>>['id']>
>;
type _GroupId = AssertContract<
  CheckSame<Resource<'group'>['id'], Prisma.EventGroupGetPayload<Record<never, never>>['id']>
>;
type _EventId = AssertContract<CheckSame<Resource<'event'>['id'], Prisma.EventGetPayload<Record<never, never>>['id']>>;
type _PriceId = AssertContract<
  CheckSame<Resource<'major-event-price'>['id'], Prisma.MajorEventPriceGetPayload<Record<never, never>>['id']>
>;
type _PriceTierId = AssertContract<
  CheckSame<Resource<'price-tier'>['id'], Prisma.PriceTierGetPayload<Record<never, never>>['id']>
>;
type _PlacePresetId = AssertContract<
  CheckSame<Resource<'place-preset'>['id'], Prisma.PlacePresetGetPayload<Record<never, never>>['id']>
>;
type _FormId = AssertContract<
  CheckSame<Resource<'event-form'>['id'], Prisma.EventFormGetPayload<Record<never, never>>['id']>
>;
type _FormLinkId = AssertContract<
  CheckSame<Resource<'form-link'>['id'], Prisma.EventFormLinkGetPayload<Record<never, never>>['id']>
>;
type _CertificateConfigId = AssertContract<
  CheckSame<Resource<'certificate-config'>['id'], Prisma.CertificateConfigGetPayload<Record<never, never>>['id']>
>;
type _TicketConfigId = AssertContract<
  CheckSame<Resource<'ticket-config'>['id'], Prisma.TicketConfigGetPayload<Record<never, never>>['id']>
>;
type _TicketOptionId = AssertContract<
  CheckSame<Resource<'ticket-price-option'>['id'], Prisma.TicketPriceOptionGetPayload<Record<never, never>>['id']>
>;
type _SportsTournamentId = AssertContract<
  CheckSame<Resource<'sports-tournament'>['id'], Prisma.SportsTournamentGetPayload<Record<never, never>>['id']>
>;
type _SportsCategoryId = AssertContract<
  CheckSame<Resource<'sports-category'>['id'], Prisma.SportsCategoryGetPayload<Record<never, never>>['id']>
>;
type _SportsVenueId = AssertContract<
  CheckSame<Resource<'sports-venue'>['id'], Prisma.SportsVenueGetPayload<Record<never, never>>['id']>
>;
type _SportsStageId = AssertContract<
  CheckSame<Resource<'sports-stage'>['id'], Prisma.SportsStageGetPayload<Record<never, never>>['id']>
>;
type _SportsMatchId = AssertContract<
  CheckSame<Resource<'sports-match'>['id'], Prisma.SportsMatchGetPayload<Record<never, never>>['id']>
>;
type _EventSubscriptionId = AssertContract<
  CheckSame<Resource<'event-subscription'>['id'], Prisma.EventSubscriptionGetPayload<Record<never, never>>['id']>
>;
type _GroupSubscriptionId = AssertContract<
  CheckSame<Resource<'group-subscription'>['id'], Prisma.EventGroupSubscriptionGetPayload<Record<never, never>>['id']>
>;
type _MajorSubscriptionId = AssertContract<
  CheckSame<
    Resource<'major-event-subscription'>['id'],
    Prisma.MajorEventSubscriptionGetPayload<Record<never, never>>['id']
  >
>;
type _AttendanceIdIsPortableString = AssertContract<CheckSame<Resource<'event-attendance'>['id'], string>>;

// References remain strings/nullability-compatible with their storage foreign keys.
type _EventMajorEventRef = AssertContract<
  CheckSame<DataField<'event', 'majorEventId'>, Prisma.EventGetPayload<Record<never, never>>['majorEventId']>
>;
type _EventGroupRef = AssertContract<
  CheckSame<DataField<'event', 'eventGroupId'>, Prisma.EventGetPayload<Record<never, never>>['eventGroupId']>
>;
type _EventPriceTierRefs = AssertContract<
  CheckSame<
    DataField<'event', 'regularAttendancePriceTierIds'>,
    Prisma.EventGetPayload<Record<never, never>>['regularAttendancePriceTierIds']
  >
>;
type _GroupMajorEventRef = AssertContract<
  CheckSame<DataField<'group', 'majorEventId'>, Prisma.EventGroupGetPayload<Record<never, never>>['majorEventId']>
>;
type _PriceMajorEventRef = AssertContract<
  CheckSame<
    DataField<'major-event-price', 'majorEventId'>,
    Prisma.MajorEventPriceGetPayload<Record<never, never>>['majorEventId']
  >
>;
type _TierPriceRef = AssertContract<
  CheckSame<DataField<'price-tier', 'priceId'>, Prisma.PriceTierGetPayload<Record<never, never>>['priceId']>
>;
type _TierEventRefs = AssertContract<
  CheckSame<
    DataField<'price-tier', 'allowedEventIds'>,
    Prisma.PriceTierGetPayload<Record<never, never>>['allowedEventIds']
  >
>;
type _FormOwnerEventRef = AssertContract<
  CheckSame<DataField<'event-form', 'ownerEventId'>, Prisma.EventFormGetPayload<Record<never, never>>['ownerEventId']>
>;
type _FormOwnerMajorRef = AssertContract<
  CheckSame<
    DataField<'event-form', 'ownerMajorEventId'>,
    Prisma.EventFormGetPayload<Record<never, never>>['ownerMajorEventId']
  >
>;
type _FormLinkFormRef = AssertContract<
  CheckSame<DataField<'form-link', 'formId'>, Prisma.EventFormLinkGetPayload<Record<never, never>>['formId']>
>;
type _FormLinkEventRef = AssertContract<
  CheckSame<DataField<'form-link', 'eventId'>, Prisma.EventFormLinkGetPayload<Record<never, never>>['eventId']>
>;
type _FormLinkMajorRef = AssertContract<
  CheckSame<
    DataField<'form-link', 'majorEventId'>,
    Prisma.EventFormLinkGetPayload<Record<never, never>>['majorEventId']
  >
>;
type _FormLinkTierRefs = AssertContract<CheckSame<DataField<'form-link', 'priceTierIds'>, string[]>>;
type _CertificateEventRef = AssertContract<
  CheckSame<
    DataField<'certificate-config', 'eventId'>,
    Prisma.CertificateConfigGetPayload<Record<never, never>>['eventId']
  >
>;
type _CertificateGroupRef = AssertContract<
  CheckSame<
    DataField<'certificate-config', 'eventGroupId'>,
    Prisma.CertificateConfigGetPayload<Record<never, never>>['eventGroupId']
  >
>;
type _CertificateMajorRef = AssertContract<
  CheckSame<
    DataField<'certificate-config', 'majorEventId'>,
    Prisma.CertificateConfigGetPayload<Record<never, never>>['majorEventId']
  >
>;
type _CertificateTemplateRef = AssertContract<
  CheckSame<
    DataField<'certificate-config', 'certificateTemplateId'>,
    Prisma.CertificateConfigGetPayload<Record<never, never>>['certificateTemplateId']
  >
>;
type _TicketEventRef = AssertContract<
  CheckSame<DataField<'ticket-config', 'eventId'>, Prisma.TicketConfigGetPayload<Record<never, never>>['eventId']>
>;
type _TicketTierRefs = AssertContract<
  CheckSame<
    DataField<'ticket-config', 'includedPriceTierIds'>,
    Prisma.TicketConfigGetPayload<Record<never, never>>['includedPriceTierIds']
  >
>;
type _TicketAllowedTierRefs = AssertContract<
  CheckSame<DataField<'ticket-config', 'recipientAllowedPriceTierIds'>, string[]>
>;
type _TicketVisibleTierRefs = AssertContract<
  CheckSame<DataField<'ticket-config', 'purchaseVisiblePriceTierIds'>, string[]>
>;
type _TicketOptionConfigRef = AssertContract<
  CheckSame<
    DataField<'ticket-price-option', 'ticketConfigId'>,
    Prisma.TicketPriceOptionGetPayload<Record<never, never>>['ticketConfigId']
  >
>;
type _TicketOptionTierRef = AssertContract<
  CheckSame<
    DataField<'ticket-price-option', 'priceTierId'>,
    Prisma.TicketPriceOptionGetPayload<Record<never, never>>['priceTierId']
  >
>;
type _TournamentMajorEventRef = AssertContract<
  CheckSame<
    DataField<'sports-tournament', 'majorEventId'>,
    Prisma.SportsTournamentGetPayload<Record<never, never>>['majorEventId']
  >
>;
type _CategoryTournamentRef = AssertContract<
  CheckSame<
    DataField<'sports-category', 'tournamentId'>,
    Prisma.SportsCategoryGetPayload<Record<never, never>>['tournamentId']
  >
>;
type _CategoryGroupRef = AssertContract<
  CheckSame<
    DataField<'sports-category', 'eventGroupId'>,
    Prisma.SportsCategoryGetPayload<Record<never, never>>['eventGroupId']
  >
>;
type _CategoryFormRef = AssertContract<
  CheckSame<
    DataField<'sports-category', 'registrationFormId'>,
    Prisma.SportsCategoryGetPayload<Record<never, never>>['registrationFormId']
  >
>;
type _VenueTournamentRef = AssertContract<
  CheckSame<
    DataField<'sports-venue', 'tournamentId'>,
    Prisma.SportsVenueGetPayload<Record<never, never>>['tournamentId']
  >
>;
type _VenuePlaceRef = AssertContract<
  CheckSame<
    DataField<'sports-venue', 'placePresetId'>,
    Prisma.SportsVenueGetPayload<Record<never, never>>['placePresetId']
  >
>;
type _VenueParentRef = AssertContract<
  CheckSame<
    DataField<'sports-venue', 'parentVenueId'>,
    Prisma.SportsVenueGetPayload<Record<never, never>>['parentVenueId']
  >
>;
type _StageCategoryRef = AssertContract<
  CheckSame<DataField<'sports-stage', 'categoryId'>, Prisma.SportsStageGetPayload<Record<never, never>>['categoryId']>
>;
type _MatchEventRef = AssertContract<
  CheckSame<DataField<'sports-match', 'eventId'>, Prisma.SportsMatchGetPayload<Record<never, never>>['eventId']>
>;
type _MatchCategoryRef = AssertContract<
  CheckSame<DataField<'sports-match', 'categoryId'>, Prisma.SportsMatchGetPayload<Record<never, never>>['categoryId']>
>;
type _MatchStageRef = AssertContract<
  CheckSame<DataField<'sports-match', 'stageId'>, Prisma.SportsMatchGetPayload<Record<never, never>>['stageId']>
>;
type _MatchVenueRef = AssertContract<
  CheckSame<DataField<'sports-match', 'venueId'>, Prisma.SportsMatchGetPayload<Record<never, never>>['venueId']>
>;
type _EventSubscriptionTargetRef = AssertContract<
  CheckSame<
    DataField<'event-subscription', 'eventId'>,
    Prisma.EventSubscriptionGetPayload<Record<never, never>>['eventId']
  >
>;
type _GroupSubscriptionTargetRef = AssertContract<
  CheckSame<
    DataField<'group-subscription', 'eventGroupId'>,
    Prisma.EventGroupSubscriptionGetPayload<Record<never, never>>['eventGroupId']
  >
>;
type _MajorSubscriptionTargetRef = AssertContract<
  CheckSame<
    DataField<'major-event-subscription', 'majorEventId'>,
    Prisma.MajorEventSubscriptionGetPayload<Record<never, never>>['majorEventId']
  >
>;
type _MajorSubscriptionEventRefs = AssertContract<
  CheckSame<DataField<'major-event-subscription', 'selectedEventIds'>, string[]>
>;
type _AttendanceTargetRef = AssertContract<
  CheckSame<DataField<'event-attendance', 'eventId'>, Prisma.EventAttendanceGetPayload<Record<never, never>>['eventId']>
>;
type _PersonReferenceId = AssertContract<
  CheckSame<
    NonNullable<DataField<'event-subscription', 'person'>['id']>,
    Prisma.PeopleGetPayload<Record<never, never>>['id']
  >
>;

// DateTime remains a JSON ISO string at the boundary while Prisma stores Date values.
type _EventDateMatchesStorage = AssertContract<
  CheckSame<DataField<'event', 'startDate'>, DbField<Prisma.EventGetPayload<Record<never, never>>, 'startDate'>>
>;
type _SportsDateMatchesStorage = AssertContract<
  CheckSame<DataField<'sports-match', 'startDate'>, DbField<Prisma.EventGetPayload<Record<never, never>>, 'startDate'>>
>;

export type DataTransferBackendStorageContract =
  | _MajorEventId
  | _GroupId
  | _EventId
  | _PriceId
  | _PriceTierId
  | _PlacePresetId
  | _FormId
  | _FormLinkId
  | _CertificateConfigId
  | _TicketConfigId
  | _TicketOptionId
  | _SportsTournamentId
  | _SportsCategoryId
  | _SportsVenueId
  | _SportsStageId
  | _SportsMatchId
  | _EventSubscriptionId
  | _GroupSubscriptionId
  | _MajorSubscriptionId
  | _AttendanceIdIsPortableString
  | _EventMajorEventRef
  | _EventGroupRef
  | _GroupMajorEventRef
  | _PriceMajorEventRef
  | _EventPriceTierRefs
  | _TierPriceRef
  | _TierEventRefs
  | _FormOwnerEventRef
  | _FormOwnerMajorRef
  | _FormLinkFormRef
  | _FormLinkEventRef
  | _FormLinkMajorRef
  | _FormLinkTierRefs
  | _CertificateEventRef
  | _CertificateGroupRef
  | _CertificateMajorRef
  | _CertificateTemplateRef
  | _TicketEventRef
  | _TicketTierRefs
  | _TicketAllowedTierRefs
  | _TicketVisibleTierRefs
  | _TicketOptionConfigRef
  | _TicketOptionTierRef
  | _TournamentMajorEventRef
  | _CategoryTournamentRef
  | _CategoryGroupRef
  | _CategoryFormRef
  | _VenueTournamentRef
  | _VenuePlaceRef
  | _VenueParentRef
  | _StageCategoryRef
  | _MatchEventRef
  | _MatchCategoryRef
  | _MatchStageRef
  | _MatchVenueRef
  | _EventSubscriptionTargetRef
  | _GroupSubscriptionTargetRef
  | _MajorSubscriptionTargetRef
  | _MajorSubscriptionEventRefs
  | _AttendanceTargetRef
  | _PersonReferenceId
  | _EventDateMatchesStorage
  | _SportsDateMatchesStorage;

// Issued rights retain persisted ticket state; external payments retain their amount/date types.
type StoredTicket = Prisma.EventTicketGetPayload<Record<never, never>>;
type StoredPurchase = Prisma.TicketPurchaseGetPayload<Record<never, never>>;
export type TicketTransferStorageContractTests =
  | AssertContract<CheckSame<DataField<'event-ticket', 'source'>, StoredTicket['source']>>
  | AssertContract<CheckSame<DataField<'event-ticket', 'status'>, StoredTicket['status']>>
  | AssertContract<
      CheckSame<DataField<'event-ticket', 'originalHolderPersonId'>, StoredTicket['originalHolderPersonId']>
    >
  | AssertContract<CheckSame<DataField<'event-ticket', 'issuedAt'>, DbField<StoredTicket, 'issuedAt'>>>
  | AssertContract<CheckSame<DataField<'event-ticket', 'expiresAt'>, DbField<StoredTicket, 'expiresAt'>>>
  | AssertContract<CheckSame<DataField<'ticket-purchase', 'amountCents'>, StoredPurchase['amountCents']>>
  | AssertContract<CheckSame<DataField<'ticket-purchase', 'purchasedAt'>, DbField<StoredPurchase, 'createdAt'>>>;
