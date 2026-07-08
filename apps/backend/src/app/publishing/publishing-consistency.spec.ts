import { buildPublicationConsistencyWarnings } from './publishing-consistency';

type PublicationConsistencyInput = Parameters<typeof buildPublicationConsistencyWarnings>[0];
type PublicationConsistencyEvent = PublicationConsistencyInput['events'][number];
type PublicationConsistencyMajorEvent = PublicationConsistencyInput['majorEvents'][number];

const NOW = new Date('2026-07-07T15:00:00.000Z');
const PAST = new Date('2026-07-07T14:00:00.000Z');
const FUTURE = new Date('2026-07-07T16:00:00.000Z');

function createEvent(overrides: Partial<PublicationConsistencyEvent> = {}): PublicationConsistencyEvent {
  return {
    id: 'event-1',
    name: 'Evento 1',
    publiclyVisible: false,
    publicationState: 'DRAFT',
    scheduledPublishAt: null,
    majorEventId: null,
    majorEvent: null,
    ...overrides,
  };
}

function createMajorEvent(
  overrides: Partial<PublicationConsistencyMajorEvent> = {},
): PublicationConsistencyMajorEvent {
  return {
    id: 'major-event-1',
    name: 'Grande evento 1',
    publicationState: 'DRAFT',
    scheduledPublishAt: null,
    events: [],
    ...overrides,
  };
}

describe('buildPublicationConsistencyWarnings', () => {
  it('reports inconsistent event publication states', () => {
    const warnings = buildPublicationConsistencyWarnings({
      now: NOW,
      events: [
        createEvent({
          id: 'hidden-published-event',
          name: 'Evento publicado oculto',
          publicationState: 'PUBLISHED',
          publiclyVisible: false,
        }),
        createEvent({
          id: 'visible-draft-event',
          name: 'Evento rascunho visivel',
          publicationState: 'DRAFT',
          publiclyVisible: true,
        }),
        createEvent({
          id: 'event-with-draft-major',
          name: 'Evento com grande evento em rascunho',
          publicationState: 'PUBLISHED',
          publiclyVisible: true,
          majorEventId: 'major-event-1',
          majorEvent: {
            id: 'major-event-1',
            name: 'Grande evento em rascunho',
            publicationState: 'DRAFT',
          },
        }),
        createEvent({
          id: 'overdue-scheduled-event',
          name: 'Evento agendado atrasado',
          publicationState: 'SCHEDULED',
          publiclyVisible: true,
          scheduledPublishAt: PAST,
        }),
      ],
      majorEvents: [],
    });

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'PUBLISHED_EVENT_HIDDEN_FROM_USERS',
          targetId: 'hidden-published-event',
          eventId: 'hidden-published-event',
          severity: 'WARNING',
        }),
        expect.objectContaining({
          type: 'DRAFT_EVENT_VISIBLE_TO_ADMINS',
          targetId: 'visible-draft-event',
          eventId: 'visible-draft-event',
          severity: 'INFO',
        }),
        expect.objectContaining({
          type: 'PUBLISHED_EVENT_WITH_UNPUBLISHED_MAJOR_EVENT',
          targetId: 'event-with-draft-major',
          eventId: 'event-with-draft-major',
          severity: 'CRITICAL',
        }),
        expect.objectContaining({
          type: 'OVERDUE_SCHEDULED_PUBLICATION',
          targetId: 'overdue-scheduled-event',
          eventId: 'overdue-scheduled-event',
          severity: 'WARNING',
        }),
      ]),
    );
  });

  it('does not report consistent or not-yet-due event states', () => {
    expect(
      buildPublicationConsistencyWarnings({
        now: NOW,
        events: [
          createEvent({
            id: 'visible-published-event',
            publicationState: 'PUBLISHED',
            publiclyVisible: true,
            majorEvent: {
              id: 'published-major-event',
              name: 'Grande evento publicado',
              publicationState: 'PUBLISHED',
            },
          }),
          createEvent({
            id: 'hidden-draft-event',
            publicationState: 'DRAFT',
            publiclyVisible: false,
          }),
          createEvent({
            id: 'scheduled-without-date-event',
            publicationState: 'SCHEDULED',
            scheduledPublishAt: null,
          }),
          createEvent({
            id: 'scheduled-future-event',
            publicationState: 'SCHEDULED',
            scheduledPublishAt: FUTURE,
          }),
        ],
        majorEvents: [],
      }),
    ).toEqual([]);
  });

  it('reports inconsistent major event publication states', () => {
    const warnings = buildPublicationConsistencyWarnings({
      now: NOW,
      events: [],
      majorEvents: [
        createMajorEvent({
          id: 'overdue-scheduled-major',
          name: 'Grande evento agendado atrasado',
          publicationState: 'SCHEDULED',
          scheduledPublishAt: PAST,
        }),
        createMajorEvent({
          id: 'published-major-without-visible-events',
          name: 'Grande evento sem eventos visiveis',
          publicationState: 'PUBLISHED',
          events: [
            {
              id: 'hidden-event',
              publiclyVisible: false,
              publicationState: 'PUBLISHED',
            },
            {
              id: 'draft-event',
              publiclyVisible: true,
              publicationState: 'DRAFT',
            },
          ],
        }),
      ],
    });

    expect(warnings).toEqual([
      expect.objectContaining({
        type: 'OVERDUE_SCHEDULED_PUBLICATION',
        targetId: 'overdue-scheduled-major',
        severity: 'WARNING',
      }),
      expect.objectContaining({
        type: 'PUBLISHED_MAJOR_EVENT_WITHOUT_VISIBLE_CHILDREN',
        targetId: 'published-major-without-visible-events',
        severity: 'WARNING',
      }),
    ]);
  });

  it('does not report consistent or not-yet-due major event states', () => {
    expect(
      buildPublicationConsistencyWarnings({
        now: NOW,
        events: [],
        majorEvents: [
          createMajorEvent({
            id: 'draft-major-event',
            publicationState: 'DRAFT',
            scheduledPublishAt: PAST,
          }),
          createMajorEvent({
            id: 'scheduled-without-date-major',
            publicationState: 'SCHEDULED',
            scheduledPublishAt: null,
          }),
          createMajorEvent({
            id: 'scheduled-future-major',
            publicationState: 'SCHEDULED',
            scheduledPublishAt: FUTURE,
          }),
          createMajorEvent({
            id: 'published-major-with-default-events',
            publicationState: 'PUBLISHED',
            events: undefined,
          }),
          createMajorEvent({
            id: 'published-major-with-visible-event',
            publicationState: 'PUBLISHED',
            events: [
              {
                id: 'draft-event',
                publiclyVisible: true,
                publicationState: 'DRAFT',
              },
              {
                id: 'visible-event',
                publiclyVisible: true,
                publicationState: 'PUBLISHED',
              },
            ],
          }),
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        type: 'PUBLISHED_MAJOR_EVENT_WITHOUT_VISIBLE_CHILDREN',
        targetId: 'published-major-with-default-events',
      }),
    ]);
  });
});
