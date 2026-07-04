import { EventForm as EventFormModel } from '@cacic-fct/shared-data-types';
import { EventFormResponseMode, EventFormSigilo, EventFormTargetType, PublicationState } from '@prisma/client';
import type { EventFormRecord, EventFormResponseRecord } from './event-form-records';

export function formRecord(overrides: Record<string, unknown> = {}): EventFormRecord {
  const now = new Date('2026-07-01T12:00:00.000Z');
  return {
    id: 'form-1',
    name: 'Pesquisa',
    description: null,
    ownerEventId: 'event-1',
    ownerMajorEventId: null,
    ownerEvent: { id: 'event-1', name: 'Credenciamento', emoji: null, majorEventId: null, eventGroupId: null },
    ownerMajorEvent: null,
    elements: [],
    sigilo: EventFormSigilo.PUBLIC,
    responseMode: EventFormResponseMode.SINGLE_PER_TARGET,
    resultsPublic: true,
    resultsLive: true,
    publicationState: PublicationState.PUBLISHED,
    scheduledPublishAt: null,
    publishedAt: now,
    unpublishedAt: null,
    publicationUpdatedBy: null,
    links: [linkRecord()],
    _count: { responses: 0 },
    deletedAt: null,
    createdAt: now,
    createdById: 'admin-user',
    updatedAt: now,
    updatedById: 'admin-user',
    ...overrides,
  } as never;
}

export function linkRecord(overrides: Record<string, unknown> = {}): EventFormRecord['links'][number] {
  const now = new Date('2026-07-01T12:00:00.000Z');
  return {
    id: 'link-1',
    formId: 'form-1',
    targetType: EventFormTargetType.EVENT,
    eventId: 'event-1',
    majorEventId: null,
    event: { id: 'event-1', name: 'Credenciamento', emoji: null, majorEventId: null, eventGroupId: null },
    majorEvent: null,
    audience: 'SUBSCRIBERS_OR_ATTENDEES',
    insertInSubscriptionFlow: false,
    requiredInSubscriptionFlow: false,
    enforceRequiredAnswers: true,
    displayOrder: 0,
    availableFrom: null,
    availableUntil: null,
    notifyOnPublish: true,
    allowLecturerManualPublish: false,
    lastNotifiedAt: null,
    _count: { responses: 0 },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as never;
}

export function eventFormModel(overrides: Partial<EventFormModel> = {}): EventFormModel {
  const now = new Date('2026-07-01T12:00:00.000Z');
  return {
    id: 'form-1',
    name: 'Pesquisa',
    description: null,
    ownerEventId: 'event-1',
    ownerMajorEventId: null,
    owner: { type: EventFormTargetType.EVENT, id: 'event-1', name: 'Credenciamento', emoji: null },
    elementsJson: '[]',
    sigilo: EventFormSigilo.PUBLIC,
    responseMode: EventFormResponseMode.SINGLE_PER_TARGET,
    resultsPublic: true,
    resultsLive: true,
    publicationState: PublicationState.PUBLISHED,
    scheduledPublishAt: null,
    publishedAt: now,
    unpublishedAt: null,
    links: [eventFormLinkModel()],
    responseCount: 0,
    deletedAt: null,
    createdAt: now,
    createdById: 'admin-user',
    updatedAt: now,
    updatedById: 'admin-user',
    ...overrides,
  };
}

export function eventFormLinkModel(
  overrides: Partial<EventFormModel['links'][number]> = {},
): EventFormModel['links'][number] {
  const now = new Date('2026-07-01T12:00:00.000Z');
  return {
    id: 'link-1',
    formId: 'form-1',
    targetType: EventFormTargetType.EVENT,
    eventId: 'event-1',
    majorEventId: null,
    target: { type: EventFormTargetType.EVENT, id: 'event-1', name: 'Credenciamento', emoji: null },
    audience: 'SUBSCRIBERS_OR_ATTENDEES',
    insertInSubscriptionFlow: false,
    requiredInSubscriptionFlow: false,
    enforceRequiredAnswers: true,
    displayOrder: 0,
    availableFrom: null,
    availableUntil: null,
    notifyOnPublish: true,
    allowLecturerManualPublish: false,
    lastNotifiedAt: null,
    responseCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function responseRecord(overrides: Record<string, unknown> = {}): EventFormResponseRecord {
  const now = new Date('2026-07-01T12:00:00.000Z');
  return {
    id: 'response-1',
    formId: 'form-1',
    linkId: 'link-1',
    targetType: EventFormTargetType.EVENT,
    eventId: 'event-1',
    majorEventId: null,
    personId: 'person-1',
    person: { id: 'person-1', name: 'Ada Lovelace', email: 'ada@example.com' },
    answers: [],
    source: 'PUBLIC_FORM',
    submittedAt: now,
    updatedAt: now,
    ...overrides,
  } as never;
}
