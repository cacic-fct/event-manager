import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { firstValueFrom } from 'rxjs';
import { PublicPrizeDrawApiService } from './prize-draw-api.service';

describe('PublicPrizeDrawApiService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads a sanitized snapshot and keeps spins oldest first', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const service = TestBed.inject(PublicPrizeDrawApiService);
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(service.list({ targetType: 'EVENT', targetId: 'event-1' }));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.variables).toEqual({ eventId: 'event-1', eventGroupId: null, majorEventId: null });
    expect(request.request.body.query).not.toContain('winnerPersonId');
    request.flush({
      data: {
        publicPrizeDraws: [
          {
            id: 'draw-1',
            title: 'Brinde',
            target: { type: 'EVENT', id: 'event-1', name: 'Evento' },
            includePresent: true,
            includeSubscribers: false,
            includeManualEntries: false,
            chanceMode: 'EQUAL',
            removeWinnerAfterDraw: true,
            revision: 2,
            spins: [
              { id: 'spin-2', sequence: 2, drawnAt: '2026-08-26T12:02:00Z' },
              { id: 'spin-1', sequence: 1, drawnAt: '2026-08-26T12:01:00Z' },
            ],
            createdAt: '2026-08-26T12:00:00Z',
            updatedAt: '2026-08-26T12:02:00Z',
          },
        ],
      },
    });

    await expect(result).resolves.toMatchObject([{ spins: [{ id: 'spin-1' }, { id: 'spin-2' }] }]);
    http.verify();
  });

  it('uses the target-scoped replayable SSE endpoint', async () => {
    installFakeEventSource();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(PublicPrizeDrawApiService);
    const update = firstValueFrom(service.watch({ targetType: 'EVENT_GROUP', targetId: 'group / 1' }));
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe('/api/prize-draws/public/event-groups/group%20%2F%201/events');
    source.emitMessage();

    await expect(update).resolves.toBeUndefined();
    expect(source.close).toHaveBeenCalledOnce();
  });
});
