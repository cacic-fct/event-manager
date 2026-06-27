import {
  EVENT_SEARCH_SELECT,
  isIssuableCertificateEvent,
  materializeMajorEventPublicationState,
  toEventSearchDocument,
} from './typesense-search.events';

describe('typesense event search helpers', () => {
  it('exposes the Prisma select required for event search documents', () => {
    expect(EVENT_SEARCH_SELECT).toMatchObject({
      id: true,
      name: true,
      majorEvent: { select: { name: true, deletedAt: true, publicationState: true } },
      eventGroup: {
        select: {
          name: true,
          deletedAt: true,
          shouldIssueCertificate: true,
          shouldIssueCertificateForEachEvent: true,
        },
      },
    });
  });

  it('maps event search documents with parent names, publication state, and certificate facet', () => {
    expect(
      toEventSearchDocument({
        id: 'event-1',
        name: 'Aula',
        emoji: 'calendar',
        type: 'LECTURE',
        description: '  Descricao  ',
        shortDescription: '  ',
        locationDescription: ' Sala 1 ',
        majorEventId: null,
        majorEvent: null,
        eventGroupId: 'group-1',
        eventGroup: {
          name: ' Grupo ',
          shouldIssueCertificate: true,
          shouldIssueCertificateForEachEvent: true,
        },
        startDate: new Date('2026-06-25T12:00:00.000Z'),
        endDate: new Date('2026-06-25T13:00:00.000Z'),
        shouldIssueCertificate: true,
        publiclyVisible: true,
        publicationState: 'PUBLISHED',
      }),
    ).toEqual({
      id: 'event-1',
      name: 'Aula',
      emoji: 'calendar',
      type: 'LECTURE',
      description: 'Descricao',
      shortDescription: undefined,
      locationDescription: 'Sala 1',
      majorEventId: undefined,
      majorEventName: undefined,
      majorEventPublicationState: 'PUBLISHED',
      eventGroupId: 'group-1',
      eventGroupName: 'Grupo',
      startDate: 1782388800,
      endDate: 1782392400,
      publiclyVisible: true,
      publicationState: 'PUBLISHED',
      isIssuableCertificateEvent: true,
    });
  });

  it('materializes parent publication and certificate eligibility facets', () => {
    expect(materializeMajorEventPublicationState(null)).toBe('PUBLISHED');
    expect(materializeMajorEventPublicationState({ deletedAt: new Date(), publicationState: 'PUBLISHED' })).toBe(
      'UNPUBLISHED',
    );
    expect(materializeMajorEventPublicationState({ deletedAt: null, publicationState: 'PUBLISHED' })).toBe(
      'PUBLISHED',
    );

    expect(isIssuableCertificateEvent({ shouldIssueCertificate: true })).toBe(true);
    expect(isIssuableCertificateEvent({ majorEventId: 'major-1', shouldIssueCertificate: true })).toBe(false);
    expect(
      isIssuableCertificateEvent({
        eventGroupId: 'group-1',
        shouldIssueCertificate: true,
        eventGroup: { shouldIssueCertificate: true, shouldIssueCertificateForEachEvent: false },
      }),
    ).toBe(false);
  });
});
