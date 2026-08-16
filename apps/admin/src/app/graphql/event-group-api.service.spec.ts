import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { EventGroupApiService } from './event-group-api.service';
import { GraphqlHttpService } from './graphql-http.service';

describe('EventGroupApiService', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: EventGroupApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('ListEventGroups')) {
          return of({ eventGroups: [eventGroupFixture()] });
        }
        if (query.includes('GetEventGroup')) {
          return of({ eventGroup: eventGroupFixture({ id: 'group-detail' }) });
        }
        if (query.includes('CreateEventGroup')) {
          return of({ createEventGroup: eventGroupFixture({ id: 'group-created' }) });
        }
        if (query.includes('UpdateEventGroup')) {
          return of({ updateEventGroup: eventGroupFixture({ id: 'group-updated' }) });
        }
        if (query.includes('CloneEventGroup')) {
          return of({ cloneEventGroup: eventGroupFixture({ id: 'group-cloned' }) });
        }
        return of({ deleteEventGroup: { deleted: true, id: 'group-1' } });
      }),
    };

    TestBed.configureTestingModule({
      providers: [EventGroupApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(EventGroupApiService);
  });

  it('maps every event-group operation and preserves its variables', async () => {
    const input = { name: 'Grupo atualizado' } as never;
    const cloneInput = { name: 'Grupo clonado' } as never;

    await expect(firstValueFrom(service.listEventGroups({ query: 'Angular', skip: 2, take: 10 }))).resolves.toEqual([
      eventGroupFixture(),
    ]);
    await expect(firstValueFrom(service.getEventGroup('group-detail'))).resolves.toEqual(
      eventGroupFixture({ id: 'group-detail' }),
    );
    await expect(firstValueFrom(service.createEventGroup(input))).resolves.toEqual(
      eventGroupFixture({ id: 'group-created' }),
    );
    await expect(firstValueFrom(service.updateEventGroup('group-1', input))).resolves.toEqual(
      eventGroupFixture({ id: 'group-updated' }),
    );
    await expect(firstValueFrom(service.cloneEventGroup('group-1', cloneInput))).resolves.toEqual(
      eventGroupFixture({ id: 'group-cloned' }),
    );
    await expect(firstValueFrom(service.deleteEventGroup('group-1'))).resolves.toEqual({
      deleted: true,
      id: 'group-1',
    });

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('query ListEventGroups'), {
      query: 'Angular',
      skip: 2,
      take: 10,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(2, expect.stringContaining('query GetEventGroup'), {
      id: 'group-detail',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(3, expect.stringContaining('mutation CreateEventGroup'), {
      input,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(4, expect.stringContaining('mutation UpdateEventGroup'), {
      id: 'group-1',
      input,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(5, expect.stringContaining('mutation CloneEventGroup'), {
      id: 'group-1',
      input: cloneInput,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(6, expect.stringContaining('mutation DeleteEventGroup'), {
      id: 'group-1',
    });
  });

  it('propagates GraphQL errors from event-group operations', async () => {
    const error = new Error('event group write failed');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(firstValueFrom(service.deleteEventGroup('group-1'))).rejects.toBe(error);
  });
});

function eventGroupFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    name: 'Grupo de eventos',
    ...overrides,
  };
}
