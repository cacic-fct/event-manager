import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';
import { firstValueFrom } from 'rxjs';
import { PublicMapApiService } from './public-map-api.service';
import { PublicMapCacheService } from './public-map-cache.service';

describe('PublicMapApiService', () => {
  let api: PublicMapApiService;
  let httpTesting: HttpTestingController;
  let cache: {
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    cache = { read: vi.fn(() => null), write: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PublicMapCacheService, useValue: cache },
      ],
    });
    api = TestBed.inject(PublicMapApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('loads and caches public map events for five minutes', async () => {
    const event = eventFixture();
    const response = firstValueFrom(api.getEvents());
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.method).toBe('POST');
    expect(request.request.body.query).toContain('query PublicMapEvents');
    request.flush({ data: { publicMapEvents: [event] } });

    await expect(response).resolves.toEqual([event]);
    expect(cache.write).toHaveBeenCalledWith('events', [event], 300_000);
  });

  it('returns cached events without issuing a request', async () => {
    const event = eventFixture();
    cache.read.mockReturnValueOnce([event]);

    await expect(firstValueFrom(api.getEvents())).resolves.toEqual([event]);
    httpTesting.expectNone('/api/graphql');
    expect(cache.read).toHaveBeenCalledWith('events');
  });

  it('isolates and caches my-event ids by user', async () => {
    const response = firstValueFrom(api.getCurrentUserEventIds('user-1'));
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('currentUserMapEventIds');
    request.flush({ data: { currentUserMapEventIds: ['event-1', 'event-2'] } });

    await expect(response).resolves.toEqual(new Set(['event-1', 'event-2']));
    expect(cache.write).toHaveBeenCalledWith('mine:user-1', ['event-1', 'event-2'], 300_000);
  });

  it('recreates a Set from cached my-event ids', async () => {
    cache.read.mockReturnValueOnce(['event-2']);

    const result = await firstValueFrom(api.getCurrentUserEventIds('user-2'));

    expect(result).toEqual(new Set(['event-2']));
    expect(result).toBeInstanceOf(Set);
    httpTesting.expectNone('/api/graphql');
  });

  it.each([
    [{ errors: [{ message: 'primeiro' }, { message: 'segundo' }] }, /primeiro\nsegundo/],
    [{}, /Resposta GraphQL sem dados/],
  ])('rejects invalid GraphQL responses', async (body, expectedError) => {
    const response = firstValueFrom(api.getEvents());
    httpTesting.expectOne('/api/graphql').flush(body);

    await expect(response).rejects.toThrow(expectedError);
    expect(cache.write).not.toHaveBeenCalled();
  });
});

function eventFixture(): PublicMapEvent {
  return {
    id: 'event-1',
    name: 'Evento no mapa',
    startDate: '2026-08-17T12:00:00.000Z',
    endDate: '2026-08-17T13:00:00.000Z',
    emoji: '🎓',
    longitude: -51.40775,
    latitude: -22.12103,
    locationDescription: 'Auditório',
  };
}
