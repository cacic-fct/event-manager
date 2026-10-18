import type { TProperties, TSchema, Static } from '@sinclair/typebox';
import { resource } from './schema-helpers';
// The shared transfer schema is admin-only; this type-only edge anchors fields to the existing admin owner contracts.
// eslint-disable-next-line @nx/enforce-module-boundaries
import type {
  CertificateConfig as AdminCertificateConfig,
  Event as AdminEvent,
  EventAttendance as AdminEventAttendance,
  EventForm as AdminEventForm,
  EventFormLink as AdminEventFormLink,
  EventGroup as AdminEventGroup,
  MajorEvent as AdminMajorEvent,
  MajorEventPrice as AdminMajorEventPrice,
  MajorEventPriceTier as AdminMajorEventPriceTier,
  Person as AdminPerson,
  PlacePreset as AdminPlacePreset,
} from '@cacic-fct/event-manager-admin-contracts';
import type {
  SportsCategory,
  SportsMatch,
  SportsStage,
  SportsTournament,
  SportsVenue,
  WorkspaceMajorEventSubscription,
  WorkspaceMajorEventSubscriptionEvent,
} from '@cacic-fct/shared-data-types';
import type {
  CurrentUserEventGroupSubscriptionRecord,
  CurrentUserEventSubscription,
} from '@cacic-fct/shared-frontend-types';
import type {
  TicketConfig,
  TicketPriceOption,
  TicketPurchase,
  TicketIssueSource,
  TicketLifecycleState,
} from '@cacic-fct/shared-ticketing';
import type { FormElement } from '@cacic-fct/form-contracts';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false;

type Assert<Condition extends true> = Condition;

export type EqualContract<Left, Right> = Equal<Left, Right>;
export type AssertContract<Condition extends true> = Assert<Condition>;

type Serialized<T> = T extends Date
  ? string
  : T extends readonly (infer Item)[]
    ? Serialized<Item>[]
    : T extends object
      ? { [Key in keyof T]: Serialized<T[Key]> }
      : T;

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

type ContractValue<T> = Mutable<Serialized<Exclude<T, undefined>>>;
type SchemaValue<Schema extends TSchema> = Mutable<Serialized<Exclude<Static<Schema>, undefined>>>;

/** A normal field must remain exactly compatible with its owner contract. */
export type ExactTransferBoundary<Value> = { readonly mode: 'exact'; readonly value: Value };

/** A conversion can intentionally widen the TypeBox envelope; the backend validator checks the owner shape. */
export type ValidatedTransferBoundary<Value> = { readonly mode: 'validated'; readonly value: Value };

type BoundaryCheck<Boundary, Schema extends TSchema> =
  Boundary extends ExactTransferBoundary<infer Value>
    ? Equal<ContractValue<Value>, SchemaValue<Schema>> extends true
      ? Schema
      : never
    : Boundary extends ValidatedTransferBoundary<infer Value>
      ? [ContractValue<Value>] extends [SchemaValue<Schema>]
        ? Schema
        : never
      : never;

type CheckedProperties<Owner, Boundaries, Properties extends TProperties> =
  Exclude<keyof Properties, keyof Owner | keyof Boundaries> extends never
    ? {
        [Key in keyof Properties]: Key extends keyof Boundaries
          ? BoundaryCheck<Boundaries[Key], Properties[Key]>
          : Key extends keyof Owner
            ? Equal<ContractValue<Owner[Key]>, SchemaValue<Properties[Key]>> extends true
              ? Properties[Key]
              : never
            : never;
      }
    : never;

/** Keeps every data property allowlisted while checking it against an owning TypeScript contract. */
export function contractResource<Owner, Boundaries extends Record<string, unknown> = Record<never, never>>() {
  return <const Kind extends string, const Properties extends TProperties>(
    kind: Kind,
    properties: Properties & CheckedProperties<Owner, Boundaries, Properties>,
  ) => resource(kind, properties);
}

type NonNullableOptional<T> = { [Key in keyof T]?: Exclude<T[Key], null | undefined> };
type SerializedJsonObject<T> = T extends string ? Record<string, unknown> : T extends null ? null : never;

export type MajorEventTransferOwner = Pick<
  AdminMajorEvent,
  | 'name'
  | 'emoji'
  | 'startDate'
  | 'endDate'
  | 'description'
  | 'subscriptionStartDate'
  | 'subscriptionEndDate'
  | 'requiresImageLicenseAgreement'
  | 'audience'
  | 'audienceCourseCodes'
  | 'interestEnabled'
  | 'attendanceEligibility'
  | 'maxCoursesPerAttendee'
  | 'maxLecturesPerAttendee'
  | 'maxUncategorizedPerAttendee'
  | 'rankedSubscriptionEnabled'
  | 'buttonText'
  | 'buttonLink'
  | 'contactInfo'
  | 'contactType'
  | 'isPaymentRequired'
  | 'shouldIssueCertificateForNonPayingAttendees'
  | 'shouldIssueCertificateForNonSubscribedAttendees'
  | 'additionalPaymentInfo'
>;

export type EventGroupTransferOwner = Pick<
  AdminEventGroup,
  | 'name'
  | 'emoji'
  | 'majorEventId'
  | 'audience'
  | 'audienceCourseCodes'
  | 'interestEnabled'
  | 'requiresImageLicenseAgreement'
  | 'attendanceEligibility'
  | 'shouldIssueCertificate'
  | 'shouldIssueCertificateForNonPayingAttendees'
  | 'shouldIssueCertificateForNonSubscribedAttendees'
  | 'shouldIssueCertificateForEachEvent'
  | 'shouldIssuePartialCertificate'
>;

export type EventTransferOwner = Pick<
  AdminEvent,
  | 'name'
  | 'emoji'
  | 'startDate'
  | 'endDate'
  | 'type'
  | 'creditMinutes'
  | 'description'
  | 'shortDescription'
  | 'latitude'
  | 'longitude'
  | 'locationDescription'
  | 'majorEventId'
  | 'eventGroupId'
  | 'audience'
  | 'audienceCourseCodes'
  | 'interestEnabled'
  | 'requiresImageLicenseAgreement'
  | 'subscriptionStartDate'
  | 'subscriptionEndDate'
  | 'allowSubscription'
  | 'slots'
  | 'autoSubscribe'
  | 'attendanceEligibility'
  | 'shouldIssueCertificate'
  | 'shouldIssueCertificateForNonPayingAttendees'
  | 'shouldIssueCertificateForNonSubscribedAttendees'
  | 'regularAttendancePriceTierIds'
  | 'shouldCollectAttendance'
  | 'shouldAllowOralAttendance'
  | 'isOnlineAttendanceAllowed'
  | 'onlineAttendanceStartDate'
  | 'onlineAttendanceEndDate'
  | 'shouldProvideSubscriberListToLecturer'
  | 'isPubliclyListed'
  | 'displayLecturerProfile'
  | 'youtubeCode'
  | 'twitchChannel'
  | 'buttonText'
  | 'buttonLink'
>;

export type MajorEventPriceTransferOwner = Pick<AdminMajorEventPrice, 'id' | 'type'> & {
  majorEventId: ExactTransferBoundary<AdminMajorEvent['id']>['value'];
};

export type PriceTierTransferOwner = Pick<
  AdminMajorEventPriceTier,
  | 'name'
  | 'value'
  | 'includesEventRegistration'
  | 'includesSportsRegistration'
  | 'restrictEventSelection'
  | 'allowedEventIds'
  | 'customizeSubscriptionLimits'
  | 'maxCoursesPerAttendee'
  | 'maxLecturesPerAttendee'
  | 'maxUncategorizedPerAttendee'
> & {
  priceId: AdminMajorEventPrice['id'];
};

export type PlacePresetTransferOwner = Pick<
  AdminPlacePreset,
  'name' | 'latitude' | 'longitude' | 'locationDescription'
>;

export type EventFormTransferOwner = Pick<
  AdminEventForm,
  | 'ownerEventId'
  | 'ownerMajorEventId'
  | 'name'
  | 'description'
  | 'sigilo'
  | 'responseMode'
  | 'resultsPublic'
  | 'resultsLive'
  | 'allowResponseEdits'
> & {
  elements: ValidatedTransferBoundary<FormElement[]>['value'];
};

export type EventFormLinkTransferOwner = Pick<
  AdminEventFormLink,
  | 'formId'
  | 'targetType'
  | 'eventId'
  | 'majorEventId'
  | 'audiences'
  | 'insertInSubscriptionFlow'
  | 'requiredInSubscriptionFlow'
  | 'displayOrder'
  | 'availableFrom'
  | 'availableUntil'
  | 'notifyOnPublish'
  | 'allowLecturerManualPublish'
  | 'priceTierIds'
>;

export type CertificateConfigTransferOwner = Pick<
  AdminCertificateConfig,
  | 'name'
  | 'eventId'
  | 'eventGroupId'
  | 'majorEventId'
  | 'certificateTemplateId'
  | 'certificateText'
  | 'shouldAutofillSecondPage'
  | 'secondPageText'
  | 'isActive'
  | 'issuedTo'
  | 'certificateTypeLabel'
  | 'paymentTiers'
  | 'attendeeEligibility'
> & {
  scope: Exclude<AdminCertificateConfig['scope'], 'OTHER'>;
  certificateFields: SerializedJsonObject<AdminCertificateConfig['certificateFieldsJson']>;
};

type TicketRecipientPolicy = TicketConfig['recipientPolicy'];
type TicketPurchasePolicy = TicketConfig['purchaseVisibility'];

export type TicketConfigTransferOwner = Pick<
  TicketConfig,
  | 'eventId'
  | 'enabled'
  | 'displayName'
  | 'displayEmoji'
  | 'description'
  | 'transferEligibilityDescription'
  | 'transferable'
  | 'issueOnEventSubscription'
  | 'issueOnMajorEventSubscription'
  | 'includedPriceTierIds'
  | 'purchaseEnabled'
  | 'purchaseLimit'
  | 'expirationMode'
  | 'customExpiresAt'
> & {
  recipientSubscriptionRequirement: TicketRecipientPolicy['subscriptionRequirement'];
  recipientRequiresUnesp: TicketRecipientPolicy['requiresUnesp'];
  recipientAcademicIdPrefixes: TicketRecipientPolicy['requiredAcademicIdPrefixes'];
  recipientCourseCodes: TicketRecipientPolicy['requiredCourseCodes'];
  recipientRequiresAccountManagerVerification: TicketRecipientPolicy['requiresAccountManagerVerification'];
  recipientAllowedPriceTierIds: TicketRecipientPolicy['allowedPriceTierIds'];
  purchaseRequiresUnesp: TicketPurchasePolicy['requiresUnesp'];
  purchaseAcademicIdPrefixes: TicketPurchasePolicy['requiredAcademicIdPrefixes'];
  purchaseCourseCodes: TicketPurchasePolicy['requiredCourseCodes'];
  purchaseRequiresAccountManagerVerification: TicketPurchasePolicy['requiresAccountManagerVerification'];
  purchaseVisiblePriceTierIds: TicketPurchasePolicy['allowedPriceTierIds'];
};

export type TicketPriceOptionTransferOwner = Pick<TicketPriceOption, 'priceTierId' | 'label' | 'amountCents'> & {
  ticketConfigId: TicketConfig['id'];
};

export type SportsTournamentTransferOwner = Pick<
  SportsTournament,
  | 'majorEventId'
  | 'registrationStartDate'
  | 'registrationEndDate'
  | 'scoringMode'
  | 'selfSubscriptionEnabled'
  | 'selfSubscriptionAllowNoTeam'
  | 'selfSubscriptionAllowNoCategory'
  | 'allowPlayerMultipleTeams'
  | 'shouldIssueCertificate'
>;

export type SportsCategoryTransferOwner = Pick<
  SportsCategory,
  | 'tournamentId'
  | 'eventGroupId'
  | 'name'
  | 'emoji'
  | 'sport'
  | 'customSportName'
  | 'division'
  | 'format'
  | 'registrationStartDate'
  | 'registrationEndDate'
  | 'minimumRosterSize'
  | 'maximumRosterSize'
  | 'maximumCaptains'
  | 'maximumCoaches'
  | 'allowPlayerMultipleTeams'
  | 'shouldIssueCertificate'
  | 'athleteIdentifierMode'
  | 'joiningInstructions'
  | 'periodsEnabled'
  | 'maximumPeriods'
  | 'periodLabel'
  | 'rulesText'
  | 'registrationFormId'
> & {
  timerRules: SerializedJsonObject<SportsCategory['timerRulesJson']>;
  scoreRules: SerializedJsonObject<SportsCategory['scoreRulesJson']>;
  overallScoringRules: SerializedJsonObject<SportsCategory['overallScoringRulesJson']>;
  rosterRules: SerializedJsonObject<SportsCategory['rosterRulesJson']>;
  bracketRules: SerializedJsonObject<SportsCategory['bracketRulesJson']>;
  standingsRules: SerializedJsonObject<SportsCategory['standingsRulesJson']>;
};

export type SportsVenueTransferOwner = Pick<
  SportsVenue,
  'tournamentId' | 'placePresetId' | 'parentVenueId' | 'name' | 'courtLabel' | 'capacity' | 'notes'
>;

export type SportsStageTransferOwner = Pick<SportsStage, 'categoryId' | 'name' | 'type' | 'displayOrder'> & {
  settings: SerializedJsonObject<SportsStage['settingsJson']>;
};

export type SportsMatchTransferOwner = Pick<
  SportsMatch,
  | 'eventId'
  | 'categoryId'
  | 'stageId'
  | 'venueId'
  | 'notes'
  | 'livestreamProvider'
  | 'livestreamUrl'
  | 'roundNumber'
  | 'bracketPosition'
  | 'groupKey'
> &
  Pick<AdminEvent, 'name' | 'emoji' | 'startDate' | 'endDate'>;

export type PersonTransferReferenceOwner = NonNullableOptional<
  Pick<AdminPerson, 'id' | 'name' | 'email' | 'phone' | 'identityDocument' | 'academicId' | 'userId'>
>;

export type EventSubscriptionTransferOwner = Pick<
  CurrentUserEventSubscription,
  'eventId' | 'imageLicenseAgreementAccepted'
> & {
  person: PersonTransferReferenceOwner;
};

export type GroupSubscriptionTransferOwner = Pick<
  CurrentUserEventGroupSubscriptionRecord,
  'eventGroupId' | 'imageLicenseAgreementAccepted'
> & { person: PersonTransferReferenceOwner };

export type MajorEventSubscriptionTransferOwner = Pick<
  WorkspaceMajorEventSubscription,
  'majorEventId' | 'subscriptionStatus' | 'amountPaid' | 'paymentDate' | 'paymentTier' | 'imageLicenseAgreementAccepted'
> & {
  person: PersonTransferReferenceOwner;
  selectedEventIds: WorkspaceMajorEventSubscriptionEvent['eventId'][];
};

export type EventAttendanceTransferOwner = Pick<AdminEventAttendance, 'eventId' | 'attendedAt' | 'status'> & {
  person: PersonTransferReferenceOwner;
};

export type EventTicketTransferOwner = {
  eventId: TicketConfig['eventId'];
  person: PersonTransferReferenceOwner | null;
  originalHolderPersonId: string | null;
  source: TicketIssueSource;
  sourceKey: string | null;
  status: Exclude<TicketLifecycleState, 'EXPIRED' | 'UNAVAILABLE'>;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
};

export type TicketPurchaseTransferOwner = Pick<TicketPurchase, 'eventId' | 'amountCents' | 'priceTierName'> & {
  person: PersonTransferReferenceOwner;
  purchasedAt: TicketPurchase['createdAt'];
};

export type ResourceContractOwnerByKind = {
  'major-event': MajorEventTransferOwner;
  group: EventGroupTransferOwner;
  event: EventTransferOwner;
  'major-event-price': MajorEventPriceTransferOwner;
  'price-tier': PriceTierTransferOwner;
  'place-preset': PlacePresetTransferOwner;
  'event-form': EventFormTransferOwner;
  'form-link': EventFormLinkTransferOwner;
  'certificate-config': CertificateConfigTransferOwner;
  'ticket-config': TicketConfigTransferOwner;
  'ticket-price-option': TicketPriceOptionTransferOwner;
  'ticket-purchase': TicketPurchaseTransferOwner;
  'event-ticket': EventTicketTransferOwner;
  'sports-tournament': SportsTournamentTransferOwner;
  'sports-category': SportsCategoryTransferOwner;
  'sports-venue': SportsVenueTransferOwner;
  'sports-stage': SportsStageTransferOwner;
  'sports-match': SportsMatchTransferOwner;
  'event-subscription': EventSubscriptionTransferOwner;
  'group-subscription': GroupSubscriptionTransferOwner;
  'major-event-subscription': MajorEventSubscriptionTransferOwner;
  'event-attendance': EventAttendanceTransferOwner;
};

export type ResourceContractKind = keyof ResourceContractOwnerByKind;

export type BoundaryMap<Kind extends ResourceContractKind> = Kind extends 'major-event-price'
  ? { majorEventId: ExactTransferBoundary<AdminMajorEvent['id']> }
  : Kind extends 'price-tier'
    ? { priceId: ExactTransferBoundary<AdminMajorEventPrice['id']> }
    : Kind extends 'event-form'
      ? { elements: ValidatedTransferBoundary<FormElement[]> }
      : Kind extends 'certificate-config'
        ? {
            scope: ExactTransferBoundary<Exclude<AdminCertificateConfig['scope'], 'OTHER'>>;
            certificateFields: ExactTransferBoundary<
              SerializedJsonObject<AdminCertificateConfig['certificateFieldsJson']>
            >;
          }
        : Kind extends 'ticket-price-option'
          ? { ticketConfigId: ExactTransferBoundary<TicketConfig['id']> }
          : Kind extends 'event-ticket'
            ? { person: ExactTransferBoundary<PersonTransferReferenceOwner | null> }
            : Kind extends 'sports-category'
              ? {
                  timerRules: ExactTransferBoundary<SerializedJsonObject<SportsCategory['timerRulesJson']>>;
                  scoreRules: ExactTransferBoundary<SerializedJsonObject<SportsCategory['scoreRulesJson']>>;
                  overallScoringRules: ExactTransferBoundary<
                    SerializedJsonObject<SportsCategory['overallScoringRulesJson']>
                  >;
                  rosterRules: ExactTransferBoundary<SerializedJsonObject<SportsCategory['rosterRulesJson']>>;
                  bracketRules: ExactTransferBoundary<SerializedJsonObject<SportsCategory['bracketRulesJson']>>;
                  standingsRules: ExactTransferBoundary<SerializedJsonObject<SportsCategory['standingsRulesJson']>>;
                }
              : Kind extends 'sports-stage'
                ? { settings: ExactTransferBoundary<SerializedJsonObject<SportsStage['settingsJson']>> }
                : Kind extends
                      | 'event-subscription'
                      | 'group-subscription'
                      | 'major-event-subscription'
                      | 'event-attendance'
                      | 'ticket-purchase'
                  ? { person: ExactTransferBoundary<PersonTransferReferenceOwner> }
                  : Record<never, never>;

export function checkedResource<Owner, Boundaries extends Record<string, unknown> = Record<never, never>>() {
  return <const Kind extends string, const Properties extends TProperties>(
    kind: Kind,
    properties: Properties & CheckedProperties<Owner, Boundaries, Properties>,
  ) => resource(kind, properties);
}

/** Derived from the shared owner fields, while excluding unsupported internal target scope OTHER. */
export type TransferableCertificateScope = Exclude<AdminCertificateConfig['scope'], 'OTHER'>;

/** Demonstrates the imported form JSON boundary is the actual form-contract element type. */
export type TransferFormElement = FormElement;
