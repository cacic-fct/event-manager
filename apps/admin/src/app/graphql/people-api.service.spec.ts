import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { adminFixtureDateFromNow, createAdminPerson } from '../testing/admin-entity-fixtures';
import { GraphqlHttpService } from './graphql-http.service';
import { PeopleApiService } from './people-api.service';

describe('PeopleApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: PeopleApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('ListPeopleSummaries')) {
          return of({ people: [personFixture({ id: 'summary-person' })] });
        }
        if (query.includes('ListPeople')) {
          return of({ people: [personFixture()] });
        }
        if (query.includes('GetPerson')) {
          return of({ person: personFixture({ id: 'person-detail' }) });
        }
        if (query.includes('CreatePerson')) {
          return of({ createPerson: personFixture({ id: 'person-created' }) });
        }
        if (query.includes('UpdatePerson')) {
          return of({ updatePerson: personFixture({ id: 'person-updated' }) });
        }
        if (query.includes('GetLecturerProfile')) {
          return of({ lecturerProfile: lecturerFixture() });
        }
        if (query.includes('UpsertLecturerProfile')) {
          return of({ upsertLecturerProfile: lecturerFixture({ id: 'lecturer-updated' }) });
        }
        if (query.includes('PersonLinkedDataSummary')) {
          return of({ personLinkedDataSummary: linkedSummaryFixture() });
        }
        if (query.includes('PersonLinkedResources')) {
          return of({ personLinkedResources: linkedResourcesFixture() });
        }
        return of({ deletePerson: { deleted: true, id: 'person-1' } });
      }),
    };

    TestBed.configureTestingModule({
      providers: [PeopleApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(PeopleApiService);
  });

  it('maps all people queries and mutations and preserves operation variables', async () => {
    const filters = {
      query: 'Ada',
      email: 'ada@example.edu',
      skip: 5,
      take: 20,
      permissionGrantFilter: 'ACTIVE' as const,
      hasLecturerProfile: true,
    };
    const input = { name: 'Ada Lovelace' } as never;
    const lecturerInput = { biography: 'Matemática' } as never;

    await expect(firstValueFrom(service.listPeople(filters))).resolves.toEqual([personFixture()]);
    await expect(firstValueFrom(service.listPeopleSummaries(filters))).resolves.toEqual([
      personFixture({ id: 'summary-person' }),
    ]);
    await expect(firstValueFrom(service.getPerson('person-detail'))).resolves.toEqual(
      personFixture({ id: 'person-detail' }),
    );
    await expect(firstValueFrom(service.createPerson(input))).resolves.toEqual(
      personFixture({ id: 'person-created' }),
    );
    await expect(firstValueFrom(service.updatePerson('person-1', input))).resolves.toEqual(
      personFixture({ id: 'person-updated' }),
    );
    await expect(firstValueFrom(service.getLecturerProfile('person-1'))).resolves.toEqual(lecturerFixture());
    await expect(firstValueFrom(service.upsertLecturerProfile('person-1', lecturerInput))).resolves.toEqual(
      lecturerFixture({ id: 'lecturer-updated' }),
    );
    await expect(firstValueFrom(service.getPersonLinkedDataSummary('person-1'))).resolves.toEqual(
      linkedSummaryFixture(),
    );
    await expect(firstValueFrom(service.getPersonLinkedResources('person-1', 'EVENT', 10, 25))).resolves.toEqual(
      linkedResourcesFixture(),
    );
    await expect(firstValueFrom(service.deletePerson('person-1'))).resolves.toEqual({
      deleted: true,
      id: 'person-1',
    });

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('query ListPeople('), filters);
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('query ListPeopleSummaries('),
      filters,
    );
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(3, expect.stringContaining('query GetPerson'), {
      id: 'person-detail',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(4, expect.stringContaining('mutation CreatePerson'), {
      input,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(5, expect.stringContaining('mutation UpdatePerson'), {
      id: 'person-1',
      input,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(6, expect.stringContaining('query GetLecturerProfile'), {
      personId: 'person-1',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(7, expect.stringContaining('mutation UpsertLecturerProfile'), {
      personId: 'person-1',
      input: lecturerInput,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(8, expect.stringContaining('query PersonLinkedDataSummary'), {
      id: 'person-1',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(9, expect.stringContaining('query PersonLinkedResources'), {
      personId: 'person-1',
      type: 'EVENT',
      skip: 10,
      take: 25,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(10, expect.stringContaining('mutation DeletePerson'), {
      id: 'person-1',
    });
  });

  it('preserves a missing lecturer profile as null', async () => {
    graphqlHttp.request.mockReturnValueOnce(of({ lecturerProfile: null }));

    await expect(firstValueFrom(service.getLecturerProfile('person-1'))).resolves.toBeNull();
  });

  it('propagates GraphQL errors from people operations', async () => {
    const error = new Error('people query failed');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(firstValueFrom(service.listPeople())).rejects.toBe(error);
  });
});

function personFixture(overrides: Record<string, unknown> = {}) {
  return {
    ...createAdminPerson({ id: 'person-1', name: 'Ada Lovelace', email: 'ada@example.edu' }),
    ...overrides,
  };
}

function lecturerFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lecturer-1',
    personId: 'person-1',
    displayName: 'Ada',
    biography: 'Matemática',
    ...overrides,
  };
}

function linkedSummaryFixture() {
  return {
    personId: 'person-1',
    totalCount: 2,
    hasLinkedData: true,
    canDelete: false,
    groups: [{ type: 'EVENT', label: 'Eventos', icon: 'event', totalCount: 2 }],
  };
}

function linkedResourcesFixture() {
  return {
    personId: 'person-1',
    type: 'EVENT',
    label: 'Eventos',
    icon: 'event',
    total: 1,
    skip: 10,
    take: 25,
    items: [
      {
        id: 'event-1',
        label: 'Evento',
        description: 'Descrição',
        route: '/admin/events/event-1',
        status: 'PUBLISHED',
        occurredAt: adminFixtureDateFromNow(1, 9),
      },
    ],
  };
}
