import { Type } from '@sinclair/typebox';
import {
  AttendanceEligibility,
  Count,
  DateTime,
  Id,
  IdList,
  JsonObject,
  Name,
  StringList,
  Text,
  enumeration,
  nullable,
} from './schema-helpers';
import {
  type BoundaryMap,
  checkedResource,
  type CertificateConfigTransferOwner,
  type EventFormLinkTransferOwner,
  type EventFormTransferOwner,
  type TicketConfigTransferOwner,
  type TicketPriceOptionTransferOwner,
} from './schema-contracts';

export const FormResourceSchema = checkedResource<EventFormTransferOwner, BoundaryMap<'event-form'>>()('event-form', {
  ownerEventId: nullable(Id),
  ownerMajorEventId: nullable(Id),
  name: Name,
  description: nullable(Text),
  elements: Type.Array(JsonObject, { maxItems: 200 }),
  sigilo: enumeration('PUBLIC', 'PARTIALLY_SECRET', 'SECRET', 'ANONYMOUS'),
  responseMode: enumeration('ONE_PER_TARGET', 'MULTIPLE_PER_TARGET', 'SINGLE_PER_FORM'),
  resultsPublic: Type.Boolean(),
  resultsLive: Type.Boolean(),
  allowResponseEdits: Type.Boolean(),
});

export const FormLinkResourceSchema = checkedResource<EventFormLinkTransferOwner, BoundaryMap<'form-link'>>()(
  'form-link',
  {
    formId: Id,
    targetType: enumeration('EVENT', 'MAJOR_EVENT'),
    eventId: nullable(Id),
    majorEventId: nullable(Id),
    audiences: Type.Array(enumeration('INTERESTED', 'SUBSCRIBERS', 'ATTENDEES'), { maxItems: 3, uniqueItems: true }),
    insertInSubscriptionFlow: Type.Boolean(),
    requiredInSubscriptionFlow: Type.Boolean(),
    displayOrder: Count,
    availableFrom: nullable(DateTime),
    availableUntil: nullable(DateTime),
    notifyOnPublish: Type.Boolean(),
    allowLecturerManualPublish: Type.Boolean(),
    priceTierIds: IdList,
  },
);

export const CertificateConfigResourceSchema = checkedResource<
  CertificateConfigTransferOwner,
  BoundaryMap<'certificate-config'>
>()('certificate-config', {
  name: Name,
  scope: enumeration('EVENT', 'EVENT_GROUP', 'MAJOR_EVENT'),
  eventId: nullable(Id),
  eventGroupId: nullable(Id),
  majorEventId: nullable(Id),
  certificateTemplateId: Id,
  certificateText: nullable(Text),
  shouldAutofillSecondPage: Type.Boolean(),
  secondPageText: nullable(Text),
  isActive: Type.Boolean(),
  issuedTo: enumeration(
    'ATTENDEE',
    'LECTURER',
    'SPORTS_PLAYER',
    'SPORTS_CAPTAIN',
    'SPORTS_COACH',
    'SPORTS_REFEREE',
    'SPORTS_INTERMEDIATOR',
    'SPORTS_SCOREKEEPER',
    'SPORTS_ORGANIZER',
    'OTHER',
  ),
  certificateTypeLabel: nullable(Name),
  paymentTiers: StringList,
  attendeeEligibility: nullable(AttendanceEligibility),
  certificateFields: nullable(JsonObject),
});

export const TicketConfigResourceSchema = checkedResource<TicketConfigTransferOwner, BoundaryMap<'ticket-config'>>()(
  'ticket-config',
  {
    eventId: Id,
    enabled: Type.Boolean(),
    displayName: nullable(Name),
    displayEmoji: nullable(Type.String({ maxLength: 64 })),
    description: nullable(Text),
    transferEligibilityDescription: nullable(Text),
    transferable: Type.Boolean(),
    issueOnEventSubscription: Type.Boolean(),
    issueOnMajorEventSubscription: Type.Boolean(),
    includedPriceTierIds: IdList,
    recipientSubscriptionRequirement: enumeration('ANY', 'REQUIRED', 'NONE'),
    recipientRequiresUnesp: Type.Boolean(),
    recipientAcademicIdPrefixes: StringList,
    recipientCourseCodes: StringList,
    recipientRequiresAccountManagerVerification: Type.Boolean(),
    recipientAllowedPriceTierIds: IdList,
    purchaseEnabled: Type.Boolean(),
    purchaseLimit: nullable(Count),
    purchaseRequiresUnesp: Type.Boolean(),
    purchaseAcademicIdPrefixes: StringList,
    purchaseCourseCodes: StringList,
    purchaseRequiresAccountManagerVerification: Type.Boolean(),
    purchaseVisiblePriceTierIds: IdList,
    expirationMode: enumeration('EVENT_END', 'CUSTOM'),
    customExpiresAt: nullable(DateTime),
  },
);

export const TicketPriceOptionResourceSchema = checkedResource<
  TicketPriceOptionTransferOwner,
  BoundaryMap<'ticket-price-option'>
>()('ticket-price-option', {
  ticketConfigId: Id,
  priceTierId: nullable(Id),
  label: Name,
  amountCents: Count,
});
