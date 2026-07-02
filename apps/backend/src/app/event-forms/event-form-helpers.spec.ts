import { EventForm as EventFormModel } from '@cacic-fct/shared-data-types';
import { type FormElement } from '@cacic-fct/form-contracts';
import {
  EventFormResponseMode,
  EventFormSigilo,
  EventFormTargetType,
  PublicationState,
} from '@prisma/client';
import {
  buildAccessibleFormWhere,
  isEmptyAccessibleTargets,
  resultResponseWhere,
} from './event-form-access';
import {
  canShowIdentity,
  canShowIndividualAnswers,
  toPublicEventFormModel,
  toResponseModel,
} from './event-form-model.mapper';
import {
  notifyDueAvailableEventFormLinks,
  publishDueScheduledEventForms,
  publishEventFormNow,
} from './event-form-publication';
import {
  buildFormResultSummary,
  eventFormResultsToCsv,
} from './event-form-results';
import { EventFormResultEventsService } from './event-form-result-events.service';
import {
  normalizeFormName,
  replaceEventFormLinks,
} from './event-form-service-support';
import type {
  EventFormRecord,
  EventFormResponseRecord,
} from './event-form-records';

describe('event form helper modules', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds accessible form and response filters for scoped permissions', () => {
    const targets = {
      eventIds: new Set(['event-1']),
      majorEventIds: new Set(['major-1']),
      eventGroupIds: new Set(['group-1']),
    };

    expect(isEmptyAccessibleTargets({ eventIds: new Set(), majorEventIds: new Set(), eventGroupIds: new Set() })).toBe(
      true,
    );
    expect(buildAccessibleFormWhere(targets)).toEqual({
      OR: expect.arrayContaining([
        { ownerEventId: { in: ['event-1'] } },
        { ownerMajorEventId: { in: ['major-1'] } },
        { ownerEvent: { eventGroupId: { in: ['group-1'] } } },
        { links: { some: { eventId: { in: ['event-1'] }, deletedAt: null } } },
      ]),
    });

    expect(
      resultResponseWhere(
        formRecord({
          responseMode: EventFormResponseMode.SINGLE_PER_FORM,
          ownerEventId: 'owner-event',
          ownerEvent: { id: 'owner-event', name: 'Owner', majorEventId: 'other-major', eventGroupId: 'other-group' },
          links: [],
        }),
        { accessibleTargets: targets },
      ),
    ).toEqual({ formId: 'form-1', id: { in: [] } });
    expect(
      resultResponseWhere(
        formRecord({
          responseMode: EventFormResponseMode.SINGLE_PER_FORM,
          links: [
            linkRecord({
              eventId: 'event-1',
              event: { id: 'event-1', name: 'Credenciamento', majorEventId: null, eventGroupId: null },
            }),
          ],
        }),
        { accessibleTargets: targets },
      ),
    ).toEqual({
      formId: 'form-1',
      OR: expect.arrayContaining([
        { eventId: { in: ['event-1'] } },
        { majorEventId: { in: ['major-1'] } },
        { event: { eventGroupId: { in: ['group-1'] } } },
      ]),
    });
    expect(
      resultResponseWhere(formRecord(), {
        target: { targetType: EventFormTargetType.EVENT, eventId: 'event-1', majorEventId: null },
      }),
    ).toEqual({
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
      majorEventId: null,
    });
  });

  it('maps public form and response models without leaking private counts or identities', () => {
    const publicForm = toPublicEventFormModel(
      eventFormModel({
        resultsPublic: false,
        responseCount: 7,
        links: [
          eventFormLinkModel({ id: 'event-link', eventId: 'event-1', responseCount: 5 }),
          eventFormLinkModel({
            id: 'major-link',
            targetType: EventFormTargetType.MAJOR_EVENT,
            eventId: null,
            majorEventId: 'major-1',
            responseCount: 2,
          }),
        ],
      }),
      { targetType: EventFormTargetType.EVENT, eventId: 'event-1' },
    );

    expect(publicForm.responseCount).toBe(0);
    expect(publicForm.links).toEqual([
      expect.objectContaining({
        id: 'event-link',
        responseCount: 0,
      }),
    ]);
    expect(canShowIdentity(EventFormSigilo.ANONYMOUS, 'public')).toBe(false);
    expect(canShowIdentity(EventFormSigilo.ANONYMOUS, 'self')).toBe(true);
    expect(canShowIndividualAnswers(EventFormSigilo.PARTIALLY_SECRET, 'public')).toBe(false);
    expect(
      toResponseModel(
        responseRecord({
          answers: [{ elementId: 'feedback', value: 'Ótimo' }],
        }),
        EventFormSigilo.ANONYMOUS,
        'public',
      ),
    ).toEqual(
      expect.objectContaining({
        personId: null,
        respondentName: null,
        respondentEmail: null,
        submittedAt: null,
        answersJson: JSON.stringify([{ elementId: 'feedback', value: 'Ótimo' }]),
      }),
    );
  });

  it('builds result summaries and CSV exports with formula neutralization', () => {
    const elements: FormElement[] = [
      {
        id: 'track',
        type: 'singleChoice',
        title: 'Trilha',
        required: false,
        options: [
          { id: 'angular', label: 'Angular' },
          { id: 'nestjs', label: 'NestJS' },
        ],
      } as FormElement,
      {
        id: 'feedback',
        type: 'longText',
        title: 'Feedback',
        required: false,
        options: [],
      } as FormElement,
    ];
    const responses = [
      responseRecord({
        id: 'response-1',
        answers: [
          { elementId: 'track', value: 'angular' },
          { elementId: 'feedback', value: '=IMPORTXML("https://example.com")' },
        ],
      }),
      responseRecord({
        id: 'response-2',
        answers: [
          { elementId: 'track', value: 'nestjs' },
          { elementId: 'feedback', value: 'Gostei' },
        ],
      }),
    ];

    expect(buildFormResultSummary(elements, responses as never, true)).toEqual({
      questions: [
        expect.objectContaining({
          elementId: 'track',
          answeredCount: 2,
          buckets: [
            { label: 'Angular', value: 1 },
            { label: 'NestJS', value: 1 },
          ],
          textAnswers: [],
        }),
        expect.objectContaining({
          elementId: 'feedback',
          answeredCount: 2,
          buckets: [],
          textAnswers: ['=IMPORTXML("https://example.com")', 'Gostei'],
        }),
      ],
    });

    const csv = eventFormResultsToCsv({
      form: eventFormModel({ elementsJson: JSON.stringify(elements) }),
      responses: responses.map((response) => ({
        id: response.id,
        respondentName: response.person.name,
        respondentEmail: response.person.email,
        submittedAt: response.submittedAt,
        answersJson: JSON.stringify(response.answers),
      })),
      summary: { questions: [] },
    } as never);

    expect(csv).toContain('"Angular"');
    expect(csv).toContain('"NestJS"');
    expect(csv).toContain('"\'=IMPORTXML(""https://example.com"")"');
  });

  it('emits result delta events once per form id', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
    const service = new EventFormResultEventsService();
    const events: unknown[] = [];
    const subscription = service.watchResults('form-1').subscribe((event) => events.push(event));

    await service.emitResultsDeltas(['form-1', 'form-1', 'form-2']);

    expect(events).toEqual([
      {
        type: 'message',
        data: {
          formId: 'form-1',
          updatedAt: '2026-07-01T12:00:00.000Z',
        },
      },
    ]);
    subscription.unsubscribe();
  });

  it('publishes due forms and notifies available links through extracted helpers', async () => {
    const prisma = {
      eventForm: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'form-1' }, { id: 'form-2' }])
          .mockResolvedValueOnce([formRecord({ id: 'form-3' })]),
        update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) =>
          Promise.resolve(formRecord({
            id: args.where.id,
            publicationState: PublicationState.PUBLISHED,
            scheduledPublishAt: args.data['scheduledPublishAt'] as Date | null,
            publishedAt: args.data['publishedAt'] as Date,
            unpublishedAt: args.data['unpublishedAt'] as Date | null,
            publicationUpdatedBy: args.data['publicationUpdatedBy'] as string | null,
          })),
        ),
      },
    };
    const notifications = {
      notifyEligiblePeople: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(3),
    };

    await expect(publishDueScheduledEventForms(prisma as never, notifications as never)).resolves.toBe(2);
    expect(prisma.eventForm.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'form-1' },
        data: expect.objectContaining({
          publicationState: PublicationState.PUBLISHED,
          scheduledPublishAt: null,
          unpublishedAt: null,
        }),
        include: expect.any(Object),
      }),
    );

    await expect(notifyDueAvailableEventFormLinks(prisma as never, notifications as never)).resolves.toBe(3);
    expect(prisma.eventForm.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicationState: PublicationState.PUBLISHED,
          links: {
            some: expect.objectContaining({
              notifyOnPublish: true,
              lastNotifiedAt: null,
            }),
          },
        }),
        include: expect.any(Object),
      }),
    );
  });

  it('publishes one form and replaces links with subscription-flow constraints', async () => {
    const formNotifications = { notifyEligiblePeople: jest.fn().mockResolvedValue(1) };
    const prisma = {
      eventForm: {
        update: jest.fn().mockResolvedValue(formRecord({ id: 'form-1' })),
      },
    };
    const tx = {
      eventFormLink: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    };

    await expect(publishEventFormNow(prisma as never, formNotifications as never, 'form-1', 'admin-user')).resolves
      .toEqual(expect.objectContaining({ id: 'form-1', publicationState: PublicationState.PUBLISHED }));
    expect(formNotifications.notifyEligiblePeople).toHaveBeenCalledWith(expect.objectContaining({ id: 'form-1' }));

    await replaceEventFormLinks(
      tx as never,
      'form-1',
      [
        {
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          insertInSubscriptionFlow: true,
          requiredInSubscriptionFlow: true,
          notifyOnPublish: true,
          allowLecturerManualPublish: true,
        },
      ],
      'admin-user',
    );

    expect(tx.eventFormLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { formId: 'form-1', deletedAt: null },
        data: expect.objectContaining({ updatedById: 'admin-user' }),
      }),
    );
    expect(tx.eventFormLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        formId: 'form-1',
        eventId: 'event-1',
        insertInSubscriptionFlow: true,
        requiredInSubscriptionFlow: true,
        notifyOnPublish: false,
        allowLecturerManualPublish: false,
        createdById: 'admin-user',
      }),
    });
    expect(normalizeFormName('   ', 'Novo formulário')).toBe('Novo formulário');
  });
});

function formRecord(overrides: Record<string, unknown> = {}): EventFormRecord {
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

function linkRecord(overrides: Record<string, unknown> = {}): EventFormRecord['links'][number] {
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

function eventFormModel(overrides: Partial<EventFormModel> = {}): EventFormModel {
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

function eventFormLinkModel(overrides: Partial<EventFormModel['links'][number]> = {}): EventFormModel['links'][number] {
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

function responseRecord(overrides: Record<string, unknown> = {}): EventFormResponseRecord {
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
