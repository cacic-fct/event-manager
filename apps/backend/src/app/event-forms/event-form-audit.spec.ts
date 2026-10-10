import { Permission } from '@cacic-fct/shared-permissions';
import {
  AuditLogEntityType,
  AuditLogOperation,
  EventFormResponseMode,
  EventFormSigilo,
  EventFormTargetType,
} from '@prisma/client';
import { eventFormAuditRecord, eventFormResponseAuditRecord } from './event-form-audit';
import { EventFormRecord } from './event-form-records';

function createFormRecord(overrides: Partial<EventFormRecord> = {}): EventFormRecord {
  return {
    id: 'form-1',
    name: 'Formulario de evento',
    description: null,
    ownerEventId: null,
    ownerMajorEventId: null,
    ownerEvent: null,
    ownerMajorEvent: null,
    elements: [],
    sigilo: EventFormSigilo.PUBLIC,
    responseMode: EventFormResponseMode.SINGLE_PER_TARGET,
    resultsPublic: false,
    resultsLive: false,
    allowResponseEdits: false,
    publicationState: 'DRAFT',
    scheduledPublishAt: null,
    publishedAt: null,
    unpublishedAt: null,
    deletedAt: null,
    links: [],
    _count: { responses: 0 },
    ...overrides,
  } as EventFormRecord;
}

function createLinkRecord(overrides: Partial<EventFormRecord['links'][number]> = {}): EventFormRecord['links'][number] {
  return {
    id: 'link-1',
    formId: 'form-1',
    targetType: EventFormTargetType.EVENT,
    eventId: null,
    majorEventId: null,
    audiences: ['ATTENDEES'],
    insertInSubscriptionFlow: false,
    requiredInSubscriptionFlow: false,
    displayOrder: 0,
    availableFrom: null,
    availableUntil: null,
    notifyOnPublish: false,
    allowLecturerManualPublish: false,
    createdAt: new Date('2026-07-07T12:00:00.000Z'),
    updatedAt: new Date('2026-07-07T12:00:00.000Z'),
    deletedAt: null,
    event: null,
    majorEvent: null,
    _count: { responses: 0 },
    ...overrides,
  } as EventFormRecord['links'][number];
}

describe('eventFormAuditRecord', () => {
  it('builds snapshots and scopes owner-event forms', () => {
    const form = createFormRecord({
      ownerEventId: 'event-1',
      ownerEvent: {
        id: 'event-1',
        name: 'Evento 1',
        emoji: null,
        majorEventId: 'major-1',
        eventGroupId: 'group-1',
      },
      links: [
        createLinkRecord({
          eventId: 'event-1',
        }),
      ],
    });

    expect(eventFormAuditRecord(form, AuditLogOperation.CREATE, undefined, null, form, 'Criado.')).toMatchObject({
      entityType: AuditLogEntityType.EVENT_FORM,
      entityId: 'form-1',
      before: null,
      after: expect.objectContaining({
        id: 'form-1',
        links: [
          expect.objectContaining({
            id: 'link-1',
            eventId: 'event-1',
          }),
        ],
      }),
      scope: {
        permission: Permission.EventForm.Create,
        eventId: 'event-1',
        majorEventId: 'major-1',
        eventGroupId: 'group-1',
      },
    });
  });

  it('builds update records without an after snapshot for deleted forms', () => {
    const form = createFormRecord();

    expect(eventFormAuditRecord(form, AuditLogOperation.UPDATE, undefined, form, null, 'Atualizado.')).toMatchObject({
      before: expect.objectContaining({ id: 'form-1' }),
      after: null,
      scope: {
        permission: Permission.EventForm.Update,
      },
    });
  });

  it('scopes forms owned by major events', () => {
    const form = createFormRecord({
      ownerMajorEventId: 'major-1',
      ownerMajorEvent: {
        id: 'major-1',
        name: 'Grande evento 1',
        emoji: null,
      },
    });

    expect(eventFormAuditRecord(form, AuditLogOperation.DELETE, undefined, form, null, 'Excluido.')).toMatchObject({
      scope: {
        permission: Permission.EventForm.Delete,
        majorEventId: 'major-1',
      },
    });
  });

  it('scopes owner-event forms with null hierarchy when the owner event relation is missing', () => {
    const form = createFormRecord({
      ownerEventId: 'event-1',
      ownerEvent: null,
    });

    expect(eventFormAuditRecord(form, AuditLogOperation.UPDATE, undefined, form, form, 'Atualizado.')).toMatchObject({
      scope: {
        permission: Permission.EventForm.Update,
        eventId: 'event-1',
        majorEventId: null,
        eventGroupId: null,
      },
    });
  });

  it('scopes single linked event forms from the linked event', () => {
    const form = createFormRecord({
      links: [
        createLinkRecord({
          eventId: 'event-1',
          event: {
            id: 'event-1',
            name: 'Evento 1',
            emoji: null,
            majorEventId: 'major-1',
            eventGroupId: 'group-1',
            endDate: null,
          },
        }),
      ],
    });

    expect(eventFormAuditRecord(form, AuditLogOperation.UPDATE, undefined, form, form, 'Atualizado.')).toMatchObject({
      scope: {
        permission: Permission.EventForm.Update,
        eventId: 'event-1',
        majorEventId: 'major-1',
        eventGroupId: 'group-1',
      },
    });
  });

  it('scopes single linked major-event forms from the link', () => {
    const form = createFormRecord({
      links: [
        createLinkRecord({
          targetType: EventFormTargetType.MAJOR_EVENT,
          majorEventId: 'major-1',
        }),
      ],
    });

    expect(eventFormAuditRecord(form, AuditLogOperation.UPDATE, undefined, form, form, 'Atualizado.')).toMatchObject({
      scope: {
        permission: Permission.EventForm.Update,
        majorEventId: 'major-1',
      },
    });
  });

  it('scopes single linked event forms with null hierarchy when the event relation is missing', () => {
    const form = createFormRecord({
      links: [
        createLinkRecord({
          eventId: 'event-1',
          event: null,
        }),
      ],
    });

    expect(eventFormAuditRecord(form, AuditLogOperation.UPDATE, undefined, form, form, 'Atualizado.')).toMatchObject({
      scope: {
        permission: Permission.EventForm.Update,
        eventId: 'event-1',
        majorEventId: null,
        eventGroupId: null,
      },
    });
  });

  it('does not add target scope for single links without target ids', () => {
    const form = createFormRecord({
      links: [createLinkRecord()],
    });

    expect(eventFormAuditRecord(form, AuditLogOperation.UPDATE, undefined, form, form, 'Atualizado.')).toMatchObject({
      scope: {
        permission: Permission.EventForm.Update,
      },
    });
  });

  it('does not add target scope for unowned forms without exactly one target link', () => {
    const form = createFormRecord({
      links: [createLinkRecord({ id: 'link-1' }), createLinkRecord({ id: 'link-2' })],
    });

    expect(eventFormAuditRecord(form, AuditLogOperation.UPDATE, undefined, form, form, 'Atualizado.')).toMatchObject({
      scope: {
        permission: Permission.EventForm.Update,
      },
    });
  });
});

describe('event-form audit payloads', () => {
  it('keeps image references without copying stored image metadata', () => {
    const form = createFormRecord({
      descriptionImages: [{ id: 'image-1', altText: 'Cartaz', caption: 'Evento' }] as never,
      images: [{ id: 'image-1', objectKey: 'private/path', sizeBytes: 1024 }] as never,
    });

    const record = eventFormAuditRecord(form, AuditLogOperation.CREATE, undefined, null, form, 'Criado.');

    expect(record.after).toMatchObject({
      descriptionImages: [{ id: 'image-1', altText: 'Cartaz', caption: 'Evento' }],
    });
    expect(record.after).not.toHaveProperty('images');
    expect(record.after).not.toHaveProperty('descriptionImages.0.objectKey');
  });

  it('records answer edits without retaining submitted answer content', () => {
    const form = createFormRecord();
    const previous = {
      id: 'response-1',
      formId: 'form-1',
      personId: 'person-1',
      answers: [{ questionId: 'q1', value: 'old answer' }],
      source: 'PUBLIC_FORM',
    };
    const response = { ...previous, answers: [{ questionId: 'q1', value: 'private answer' }] };

    const record = eventFormResponseAuditRecord(
      form,
      response as never,
      AuditLogOperation.UPDATE,
      undefined,
      previous as never,
    );

    expect(record.force).toBe(true);
    expect(record.metadata).toMatchObject({ formId: 'form-1', answersChanged: true });
    expect(record.before).toMatchObject({ personId: 'person-1' });
    expect(record.after).toMatchObject({ personId: 'person-1' });
    expect(record.before).not.toHaveProperty('answers');
    expect(record.after).not.toHaveProperty('answers');
  });

  it('does not force a record when response answers are unchanged', () => {
    const form = createFormRecord();
    const response = {
      id: 'response-1',
      formId: 'form-1',
      personId: 'person-1',
      answers: [{ questionId: 'q1', value: 'same answer' }],
      source: 'PUBLIC_FORM',
    };

    const record = eventFormResponseAuditRecord(
      form,
      response as never,
      AuditLogOperation.UPDATE,
      undefined,
      { ...response, answers: [{ questionId: 'q1', value: 'same answer' }] } as never,
    );

    expect(record.force).toBe(false);
    expect(record.metadata).toMatchObject({ answersChanged: false });
  });
});
