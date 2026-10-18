import { Type } from '@sinclair/typebox';
import { Count, DateTime, Id, IdList, Name, enumeration, nullable } from './schema-helpers';
import {
  type BoundaryMap,
  checkedResource,
  type EventAttendanceTransferOwner,
  type EventSubscriptionTransferOwner,
  type GroupSubscriptionTransferOwner,
  type MajorEventSubscriptionTransferOwner,
  type TicketPurchaseTransferOwner,
  type EventTicketTransferOwner,
} from './schema-contracts';

export const PersonReferenceSchema = Type.Partial(
  Type.Object({
    id: Id,
    name: Name,
    email: Type.String({ format: 'email', maxLength: 300 }),
    phone: Type.String({ minLength: 1, maxLength: 40 }),
    identityDocument: Type.String({ minLength: 1, maxLength: 40 }),
    academicId: Type.String({ minLength: 1, maxLength: 40 }),
    userId: Id,
  }),
  { additionalProperties: false, minProperties: 1 },
);

const subscriptionFields = {
  person: PersonReferenceSchema,
  imageLicenseAgreementAccepted: Type.Boolean(),
};

export const EventSubscriptionResourceSchema = checkedResource<
  EventSubscriptionTransferOwner,
  BoundaryMap<'event-subscription'>
>()('event-subscription', {
  eventId: Id,
  ...subscriptionFields,
});

export const GroupSubscriptionResourceSchema = checkedResource<
  GroupSubscriptionTransferOwner,
  BoundaryMap<'group-subscription'>
>()('group-subscription', {
  eventGroupId: Id,
  ...subscriptionFields,
});

export const MajorSubscriptionResourceSchema = checkedResource<
  MajorEventSubscriptionTransferOwner,
  BoundaryMap<'major-event-subscription'>
>()('major-event-subscription', {
  majorEventId: Id,
  ...subscriptionFields,
  subscriptionStatus: enumeration(
    'WAITING_RECEIPT_UPLOAD',
    'RECEIPT_UNDER_REVIEW',
    'REJECTED_INVALID_RECEIPT',
    'REJECTED_NO_SLOTS',
    'REJECTED_SCHEDULE_CONFLICT',
    'REJECTED_GENERIC',
    'CONFIRMED',
    'CANCELED',
  ),
  amountPaid: nullable(Count),
  paymentDate: nullable(DateTime),
  paymentTier: nullable(Name),
  selectedEventIds: IdList,
});

export const AttendanceResourceSchema = checkedResource<
  EventAttendanceTransferOwner,
  BoundaryMap<'event-attendance'>
>()('event-attendance', {
  eventId: Id,
  person: PersonReferenceSchema,
  attendedAt: DateTime,
  status: enumeration('PRESENT', 'ABSENT'),
});

/** A paid external purchase; receipt storage and approval state are owned by the server. */
export const TicketPurchaseResourceSchema = checkedResource<
  TicketPurchaseTransferOwner,
  BoundaryMap<'ticket-purchase'>
>()('ticket-purchase', {
  eventId: Id,
  person: PersonReferenceSchema,
  amountCents: Count,
  priceTierName: nullable(Name),
  purchasedAt: DateTime,
});

export const EventTicketResourceSchema = checkedResource<EventTicketTransferOwner, BoundaryMap<'event-ticket'>>()(
  'event-ticket',
  {
    eventId: Id,
    person: nullable(PersonReferenceSchema),
    originalHolderPersonId: nullable(Id),
    source: enumeration('EVENT_SUBSCRIPTION', 'MAJOR_EVENT_SUBSCRIPTION', 'ADMIN', 'PURCHASE'),
    sourceKey: nullable(Id),
    status: enumeration('ACTIVE', 'CONSUMED', 'REVOKED'),
    issuedAt: DateTime,
    expiresAt: DateTime,
    consumedAt: nullable(DateTime),
    revokedAt: nullable(DateTime),
    revokedReason: nullable(Type.String({ maxLength: 1000 })),
  },
);
