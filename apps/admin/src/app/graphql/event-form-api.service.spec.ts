import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { EventFormApiService } from './event-form-api.service';
import { GraphqlHttpService } from './graphql-http.service';

describe('EventFormApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: EventFormApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('query EventForms')) {
          return of({ eventForms: [formFixture()] });
        }
        if (query.includes('query EventForm(')) {
          return of({ eventForm: formFixture({ id: 'form-detail' }) });
        }
        if (query.includes('SaveEventFormDraft')) {
          return of({ saveEventFormDraft: draftFixture({ id: 'saved-draft' }) });
        }
        if (query.includes('EventFormDrafts')) {
          return of({ eventFormDrafts: [draftFixture()] });
        }
        if (query.includes('SaveEventForm')) {
          return of({ saveEventForm: formFixture({ id: 'saved-form' }) });
        }
        if (query.includes('PublishEventForm')) {
          return of({ publishEventForm: formFixture({ publicationState: 'PUBLISHED' }) });
        }
        if (query.includes('UnpublishEventForm')) {
          return of({ unpublishEventForm: formFixture({ publicationState: 'DRAFT' }) });
        }
        if (query.includes('DeleteEventForm')) {
          return of({ deleteEventForm: formFixture({ deletedAt: '2026-06-01T12:00:00.000Z' }) });
        }
        return of({ eventFormResults: resultsFixture() });
      }),
    };

    TestBed.configureTestingModule({
      providers: [EventFormApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(EventFormApiService);
  });

  it('maps form list, detail, save, publication, and delete operations', async () => {
    await expect(firstValueFrom(service.listForms({ query: 'camiseta', eventId: 'event-1' }))).resolves.toEqual([
      formFixture(),
    ]);
    await expect(firstValueFrom(service.getForm('form-detail'))).resolves.toEqual(formFixture({ id: 'form-detail' }));
    await expect(firstValueFrom(service.saveForm({ name: 'Pesquisa' } as never))).resolves.toEqual(
      formFixture({ id: 'saved-form' }),
    );
    await expect(firstValueFrom(service.publishForm({ formId: 'form-1' }))).resolves.toEqual(
      formFixture({ publicationState: 'PUBLISHED' }),
    );
    await expect(firstValueFrom(service.unpublishForm('form-1'))).resolves.toEqual(
      formFixture({ publicationState: 'DRAFT' }),
    );
    await expect(firstValueFrom(service.deleteForm('form-1'))).resolves.toEqual(
      formFixture({ deletedAt: '2026-06-01T12:00:00.000Z' }),
    );

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('eventForms'), {
      query: 'camiseta',
      eventId: 'event-1',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(4, expect.stringContaining('PublishEventForm'), {
      input: { formId: 'form-1' },
    });
  });

  it('maps draft and result operations', async () => {
    await expect(firstValueFrom(service.listDrafts('form-1'))).resolves.toEqual([draftFixture()]);
    await expect(
      firstValueFrom(service.saveDraft({ sourceFormId: 'form-1', draftId: null, input: { name: 'Rascunho' } as never })),
    ).resolves.toEqual(draftFixture({ id: 'saved-draft' }));
    await expect(firstValueFrom(service.results('form-1'))).resolves.toEqual(resultsFixture());

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('EventFormDrafts'), {
      sourceFormId: 'form-1',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(3, expect.stringContaining('EventFormResults'), {
      formId: 'form-1',
    });
  });
});

function formFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'form-1',
    name: 'Pesquisa de camiseta',
    description: null,
    ownerEventId: 'event-1',
    ownerMajorEventId: null,
    owner: { type: 'EVENT', id: 'event-1', name: 'Oficina de Angular', emoji: 'code' },
    elementsJson: '[]',
    sigilo: false,
    responseMode: 'SINGLE_PER_TARGET',
    resultsPublic: false,
    resultsLive: false,
    allowResponseEdits: false,
    publicationState: 'DRAFT',
    scheduledPublishAt: null,
    publishedAt: null,
    unpublishedAt: null,
    links: [],
    responseCount: 0,
    deletedAt: null,
    createdAt: '2026-06-01T12:00:00.000Z',
    createdById: 'admin-1',
    updatedAt: '2026-06-01T12:00:00.000Z',
    updatedById: 'admin-1',
    ...overrides,
  };
}

function draftFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    sourceFormId: 'form-1',
    name: 'Rascunho',
    payloadJson: '{}',
    createdById: 'admin-1',
    createdByName: 'Admin',
    createdByEmail: 'admin@example.edu',
    updatedById: 'admin-1',
    updatedByName: 'Admin',
    updatedByEmail: 'admin@example.edu',
    createdAt: '2026-06-01T12:00:00.000Z',
    updatedAt: '2026-06-01T12:00:00.000Z',
    expiresAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  };
}

function resultsFixture(overrides: Record<string, unknown> = {}) {
  return {
    responseCount: 1,
    anonymous: false,
    answersReleased: true,
    summaryJson: '{}',
    form: formFixture(),
    responses: [
      {
        id: 'response-1',
        formId: 'form-1',
        linkId: 'link-1',
        targetType: 'EVENT',
        eventId: 'event-1',
        majorEventId: null,
        personId: 'person-1',
        respondentName: 'Ada Lovelace',
        respondentEmail: 'ada@example.edu',
        answersJson: '[]',
        source: 'PUBLIC',
        submittedAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      },
    ],
    ...overrides,
  };
}
