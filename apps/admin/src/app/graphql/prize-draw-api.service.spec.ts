import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { PrizeDrawApiService } from './prize-draw-api.service';

describe('PrizeDrawApiService', () => {
  let graphql: { request: ReturnType<typeof vi.fn> };
  let service: PrizeDrawApiService;

  beforeEach(() => {
    graphql = { request: vi.fn() };
    TestBed.configureTestingModule({
      providers: [PrizeDrawApiService, { provide: GraphqlHttpService, useValue: graphql }],
    });
    service = TestBed.inject(PrizeDrawApiService);
  });

  it('maps list, detail, and eligibility queries while requesting the complete audit fields', async () => {
    graphql.request
      .mockReturnValueOnce(of({ prizeDraws: [{ id: 'draw-1' }] }))
      .mockReturnValueOnce(of({ prizeDraw: { id: 'draw-1' } }))
      .mockReturnValueOnce(of({ prizeDrawEligibleEntries: [{ identityKey: 'person:1' }] }));

    await expect(firstValueFrom(service.list())).resolves.toEqual([{ id: 'draw-1' }]);
    await expect(firstValueFrom(service.get('draw-1'))).resolves.toEqual({ id: 'draw-1' });
    await expect(firstValueFrom(service.eligibleEntries('draw-1'))).resolves.toEqual([{ identityKey: 'person:1' }]);

    const listQuery = graphql.request.mock.calls[0][0] as string;
    expect(listQuery).toContain('prizeDraws');
    expect(listQuery).toContain('weightBreakdown');
    expect(listQuery).toContain('notificationStatus');
    expect(graphql.request.mock.calls[1][1]).toEqual({ drawId: 'draw-1' });
    expect(graphql.request.mock.calls[2][1]).toEqual({ drawId: 'draw-1' });
  });

  it('passes the complete save input as a typed GraphQL variable', async () => {
    graphql.request.mockReturnValue(of({ savePrizeDraw: { id: 'draw-1', title: 'Sorteio' } }));
    const input = {
      title: 'Sorteio',
      description: null,
      targetType: 'EVENT' as const,
      eventId: 'event-1',
      majorEventId: null,
      includePresent: true,
      includeSubscribers: false,
      includeManualEntries: false,
      chanceMode: 'EQUAL' as const,
      spinLimit: null,
      removeWinnerAfterDraw: false,
      defaultSpeed: 'QUICK' as const,
      dramaticCountdownSeconds: 3,
      notifyWinner: false,
      plannedSpins: [],
      manualEntries: [],
      weightOverrides: [],
      excludedPersonIds: [],
    };

    await expect(firstValueFrom(service.save(input))).resolves.toEqual({ id: 'draw-1', title: 'Sorteio' });
    expect(graphql.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation SavePrizeDraw($input: SavePrizeDrawInput!)'),
      { input },
    );
  });

  it.each([
    ['freeze', 'freezePrizeDrawEligibility'],
    ['unfreeze', 'unfreezePrizeDrawEligibility'],
    ['undoLast', 'undoLastPrizeDrawSpin'],
  ] as const)('maps %s to its explicit draw mutation', async (method, mutation) => {
    graphql.request.mockReturnValue(of({ [mutation]: { id: 'draw-1' } }));

    await expect(firstValueFrom(service[method]('draw-1'))).resolves.toEqual({ id: 'draw-1' });
    expect(graphql.request).toHaveBeenCalledWith(
      expect.stringContaining(`${mutation}(drawId: $drawId)`),
      { drawId: 'draw-1' },
    );
  });

  it('requests every animation field needed to present a committed spin', async () => {
    graphql.request.mockReturnValue(of({ spinPrizeDraw: { spinId: 'spin-1', winnerFullName: 'Ada' } }));
    const input = { drawId: 'draw-1', demo: false, reducedMotion: true };

    await expect(firstValueFrom(service.spin(input))).resolves.toEqual({ spinId: 'spin-1', winnerFullName: 'Ada' });
    const query = graphql.request.mock.calls[0][0] as string;
    for (const field of ['winnerReelIndex', 'reelNames', 'countdownMs', 'reelDurationMs', 'preRevealPauseMs', 'hasMoreSpins']) {
      expect(query).toContain(field);
    }
    expect(graphql.request.mock.calls[0][1]).toEqual({ input });
  });

  it('keeps winner contact retrieval in a separate permission-protected query', async () => {
    graphql.request.mockReturnValue(of({
      prizeDrawWinnerContact: { spinId: 'spin-1', fullName: 'Ada Lovelace', email: 'ada@example.com' },
    }));

    await expect(firstValueFrom(service.winnerContact('spin-1'))).resolves.toEqual(
      expect.objectContaining({ email: 'ada@example.com' }),
    );
    expect(graphql.request).toHaveBeenCalledWith(
      expect.stringContaining('query PrizeDrawWinnerContact'),
      { spinId: 'spin-1' },
    );
  });
});
