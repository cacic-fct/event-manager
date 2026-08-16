import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { adminFixtureDate, adminFixtureDateFromNow } from '../testing/admin-entity-fixtures';
import { GraphqlHttpService } from './graphql-http.service';
import { PermissionGrantsApiService } from './permission-grants-api.service';

describe('PermissionGrantsApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: PermissionGrantsApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('EventManagerPermissionGrants')) {
          return of({ eventManagerPermissionGrants: [grantFixture()] });
        }
        if (query.includes('EventManagerPermissionGrantTargets')) {
          return of({ eventManagerPermissionGrantTargets: [targetFixture()] });
        }
        if (query.includes('CreateEventManagerPermissionGrant')) {
          return of({ createEventManagerPermissionGrant: grantFixture({ id: 'grant-created' }) });
        }
        if (query.includes('UpdateEventManagerPermissionGrant')) {
          return of({ updateEventManagerPermissionGrant: grantFixture({ id: 'grant-updated' }) });
        }
        return of({ deleteEventManagerPermissionGrant: { deleted: true, id: 'grant-1' } });
      }),
    };

    TestBed.configureTestingModule({
      providers: [PermissionGrantsApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(PermissionGrantsApiService);
  });

  it('maps grant queries and mutations with their exact payloads', async () => {
    const input = { permission: 'EDIT', scope: 'EVENT', eventId: 'event-1' } as never;
    const updateInput = { permission: 'READ' } as never;

    await expect(firstValueFrom(service.listUserGrants('user-1'))).resolves.toEqual([grantFixture()]);
    await expect(firstValueFrom(service.listTargets('EVENT' as never, { take: 25 }))).resolves.toEqual([targetFixture()]);
    await expect(firstValueFrom(service.createGrant(input))).resolves.toEqual(grantFixture({ id: 'grant-created' }));
    await expect(firstValueFrom(service.updateGrant('grant-1', updateInput))).resolves.toEqual(
      grantFixture({ id: 'grant-updated' }),
    );
    await expect(firstValueFrom(service.deleteGrant('grant-1'))).resolves.toEqual({
      deleted: true,
      id: 'grant-1',
    });

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('query EventManagerPermissionGrants'), {
      userId: 'user-1',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('query EventManagerPermissionGrantTargets'),
      { scope: 'EVENT', take: 25 },
    );
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('mutation CreateEventManagerPermissionGrant'),
      { input },
    );
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('mutation UpdateEventManagerPermissionGrant'),
      { id: 'grant-1', input: updateInput },
    );
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('mutation DeleteEventManagerPermissionGrant'),
      { id: 'grant-1' },
    );
  });

  it('normalizes a null target response to an empty list', async () => {
    graphqlHttp.request.mockReturnValueOnce(of({ eventManagerPermissionGrantTargets: null }));

    await expect(firstValueFrom(service.listTargets('EVENT' as never))).resolves.toEqual([]);
  });

  it('propagates GraphQL errors from grant operations', async () => {
    const error = new Error('permission denied');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(firstValueFrom(service.listUserGrants('user-1'))).rejects.toBe(error);
  });
});

function grantFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'grant-1',
    userId: 'user-1',
    personId: 'person-1',
    permission: 'EDIT',
    scope: 'EVENT',
    eventId: 'event-1',
    majorEventId: null,
    eventGroupId: null,
    targetLabel: 'Evento',
    validFrom: null,
    validUntil: null,
    createdAt: adminFixtureDate,
    createdById: 'admin-1',
    updatedAt: null,
    updatedById: null,
    ...overrides,
  };
}

function targetFixture() {
  return {
    id: 'event-1',
    label: 'Evento',
    description: 'Descrição',
    emoji: '📚',
    startDate: adminFixtureDateFromNow(1, 9),
    endDate: adminFixtureDateFromNow(1, 11),
  };
}
