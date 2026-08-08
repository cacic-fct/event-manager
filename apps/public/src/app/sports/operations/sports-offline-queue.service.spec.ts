import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { of, throwError } from 'rxjs';
import { NetworkStatusService } from '../../shared/network-status.service';
import { SportsOfflineQueueService } from './sports-offline-queue.service';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { SportsMatchAction } from './sports-operations.types';

describe('SportsOfflineQueueService', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps the client id while replaying an offline action exactly once', async () => {
    const commit = vi.fn((actions: readonly SportsMatchAction[]) =>
      of(actions.length > 0 ? ['accepted-action'] : []),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { user: () => ({ sub: 'official-1' }) } },
        { provide: NetworkStatusService, useValue: { isOnline: () => true } },
        { provide: SportsOperationsApiService, useValue: { commit } },
      ],
    });
    const queue = TestBed.inject(SportsOfflineQueueService);
    queue.enqueueAction({
      clientId: 'offline-1',
      matchId: 'match-1',
      baseRevision: 2,
      type: 'SCORE_DELTA',
      payloadJson: '{"side":"HOME","amount":1}',
      authoredAt: '2026-08-01T12:00:00.000Z',
      offline: true,
    });

    await queue.sync();

    expect(commit).toHaveBeenCalledOnce();
    const replayedAction = commit.mock.calls[0]?.[0]?.[0];
    expect(replayedAction).toEqual(expect.objectContaining({
      clientId: 'offline-1',
      authoredAt: '2026-08-01T12:00:00.000Z',
      offline: true,
    }));
    expect(queue.pending()).toEqual([]);
  });

  it('replays an offline check-in with the same idempotency key', async () => {
    const checkIn = vi.fn(() => of(true));
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { user: () => ({ sub: 'official-1' }) } },
        { provide: NetworkStatusService, useValue: { isOnline: () => true } },
        { provide: SportsOperationsApiService, useValue: { checkIn } },
      ],
    });
    const queue = TestBed.inject(SportsOfflineQueueService);
    queue.enqueueCheckIn({
      clientId: 'check-in-1',
      matchId: 'match-1',
      rosterEntryId: 'roster-entry-1',
      checkedInAt: '2026-08-01T12:05:00.000Z',
      offline: true,
    });

    await queue.sync();

    expect(checkIn).toHaveBeenCalledWith({
      clientId: 'check-in-1',
      matchId: 'match-1',
      rosterEntryId: 'roster-entry-1',
      checkedInAt: '2026-08-01T12:05:00.000Z',
      offline: true,
    });
    expect(queue.pending()).toEqual([]);
  });

  it('exposes a typed timer conflict and discards only replaced timer actions', async () => {
    const commit = vi.fn(() => throwError(() => new Error('A partida mudou em outro dispositivo.')));
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: { user: () => ({ sub: 'official-1' }) } },
        { provide: NetworkStatusService, useValue: { isOnline: () => true } },
        { provide: SportsOperationsApiService, useValue: { commit } },
      ],
    });
    const queue = TestBed.inject(SportsOfflineQueueService);
    queue.enqueueAction({
      clientId: 'timer-1', matchId: 'match-1', baseRevision: 2, type: 'PAUSE', payloadJson: '{}',
      authoredAt: '2026-08-01T12:05:00.000Z', offline: true,
    });
    queue.attachTimerSnapshot('timer-1', {
      overall: { startedAtUnixMs: null, pausedAtUnixMs: 1_754_049_900_000, elapsedBeforePauseMs: 300_000 },
      periods: [],
      activePeriod: 1,
    });
    queue.enqueueAction({
      clientId: 'score-1', matchId: 'match-1', baseRevision: 2, type: 'SCORE_DELTA',
      payloadJson: '{"side":"HOME","amount":1}', authoredAt: '2026-08-01T12:05:01.000Z', offline: true,
    });

    await queue.sync();

    expect(queue.timerConflict()).toEqual(expect.objectContaining({
      matchId: 'match-1',
      queuedActionIds: ['timer-1'],
    }));
    queue.resolveTimerConflict('match-1', ['timer-1'], 9);
    expect(queue.pending().map((item) => item.id)).toEqual(['score-1']);
    const remaining = queue.pending()[0];
    expect(remaining?.kind === 'ACTION' ? remaining.action.baseRevision : null).toBe(9);
  });
});
