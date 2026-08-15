import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  hasOfflineSportsAttendanceCollectorProof,
  OfflineSportsCollectorCredential,
  OfflineSportsOperationQueueItem,
  SportsOperationOfflineQueueService,
} from '@cacic-fct/offline-public-data-access';
import { AuthService } from '@cacic-fct/shared-angular';
import { NEVER, of, throwError } from 'rxjs';
import { NetworkStatusService } from '../../shared/network-status.service';
import { SportsOfflineQueueService } from './sports-offline-queue.service';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { SportsMatchAction, SportsTimerSnapshot } from './sports-operations.types';

describe('SportsOfflineQueueService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('keeps the client id while replaying an offline action exactly once', async () => {
    const storage = new InMemorySportsQueueStorage();
    const commit = vi.fn((actions: readonly SportsMatchAction[]) => of(actions.length > 0 ? ['accepted-action'] : []));
    const queue = createQueue(storage, { commit });
    await queue.enqueueAction({
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
    expect(replayedAction).toEqual(
      expect.objectContaining({
        clientId: 'offline-1',
        authoredAt: '2026-08-01T12:00:00.000Z',
        offline: true,
      }),
    );
    expect(queue.pending()).toEqual([]);
    expect(storage.get('official-1', 'offline-1')).toBeUndefined();
  });

  it('replays an offline check-in with the same idempotency key', async () => {
    const storage = new InMemorySportsQueueStorage();
    const checkIn = vi.fn(() => of(true));
    const queue = createQueue(storage, { checkIn });
    await queue.enqueueCheckIn({
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
      collectorPersonId: 'person-official-1',
      collectorCredential: 'credential-official-1-match-1',
    });
    expect(queue.pending()).toEqual([]);
  });

  it('replays an official check-in with the assignment id and original collector proof', async () => {
    const storage = new InMemorySportsQueueStorage();
    const checkInOfficial = vi.fn(() => of(true));
    const queue = createQueue(storage, { checkInOfficial });
    await queue.enqueueOfficialCheckIn({
      clientId: 'official-check-in-1',
      matchId: 'match-1',
      officialAssignmentId: 'assignment-referee-1',
      checkedInAt: '2026-08-01T12:05:00.000Z',
      offline: true,
    });

    await queue.sync();

    expect(checkInOfficial).toHaveBeenCalledWith({
      clientId: 'official-check-in-1',
      matchId: 'match-1',
      officialAssignmentId: 'assignment-referee-1',
      checkedInAt: '2026-08-01T12:05:00.000Z',
      offline: true,
      collectorPersonId: 'person-official-1',
      collectorCredential: 'credential-official-1-match-1',
    });
    expect(queue.pending()).toEqual([]);
  });

  it('hands a prior user scanner check-in to the current uploader without changing the raw payload', async () => {
    const storage = new InMemorySportsQueueStorage();
    const online = { value: true };
    const checkInFromScanner = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('Código não reconhecido.')))
      .mockReturnValueOnce(of(true));
    const queue = createQueue(storage, { checkInFromScanner }, online);
    const scannerCheckIn = {
      clientId: 'scanner-1',
      matchId: 'match-1',
      code: '  RAW:user:scanner/á==\n01  ',
      checkedInAt: '2026-08-01T12:05:00.000Z',
      offline: true,
      collectorPersonId: 'person-official-2',
      collectorCredential: 'credential-official-2-match-1',
    };

    storage.seed({
      kind: 'SCANNER',
      id: scannerCheckIn.clientId,
      userScope: 'official-2',
      scannerCheckIn,
      attempts: 0,
      queuedAt: '2026-08-01T12:05:01.000Z',
    });

    await queue.sync();

    expect(storage.get('official-2', scannerCheckIn.clientId)).toEqual(
      expect.objectContaining({
        scannerCheckIn,
        attempts: 1,
        lastError: 'Código não reconhecido.',
      }),
    );

    await queue.sync();

    expect(checkInFromScanner).toHaveBeenLastCalledWith(scannerCheckIn);
    expect(storage.get('official-2', scannerCheckIn.clientId)).toBeUndefined();
  });

  it('uploads prior user attendance while retaining that user score actions', async () => {
    const storage = new InMemorySportsQueueStorage();
    const commit = vi.fn((actions: readonly SportsMatchAction[]) => of(actions.map((action) => action.clientId)));
    const checkIn = vi.fn(() => of(true));
    const queue = createQueue(storage, { commit, checkIn });
    storage.seed(actionItem('prior-action', 'official-2'));
    storage.seed({
      kind: 'CHECK_IN',
      id: 'prior-check-in',
      userScope: 'official-2',
      checkIn: {
        clientId: 'prior-check-in',
        matchId: 'match-1',
        rosterEntryId: 'roster-entry-2',
        checkedInAt: '2026-08-01T12:06:00.000Z',
        offline: true,
        collectorPersonId: 'person-official-2',
        collectorCredential: 'credential-official-2-match-1',
      },
      attempts: 0,
      queuedAt: '2026-08-01T12:06:01.000Z',
    });
    await queue.enqueueAction(actionItem('own-action', 'official-1').action);

    await queue.sync();

    expect(commit).toHaveBeenCalledOnce();
    expect(commit.mock.calls[0]?.[0]?.[0]?.clientId).toBe('own-action');
    expect(checkIn).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'prior-check-in',
        collectorPersonId: 'person-official-2',
        collectorCredential: 'credential-official-2-match-1',
      }),
    );
    expect(storage.get('official-2', 'prior-action')).toBeDefined();
    expect(storage.get('official-2', 'prior-check-in')).toBeUndefined();
  });

  it('counts uploadable handoff attendance separately from retained prior actions and legacy attendance', async () => {
    const storage = new InMemorySportsQueueStorage();
    const queue = createQueue(storage, {}, { value: false });
    storage.seed(actionItem('prior-action', 'official-2'));
    storage.seed({
      kind: 'CHECK_IN',
      id: 'prior-check-in',
      userScope: 'official-2',
      checkIn: {
        clientId: 'prior-check-in',
        matchId: 'match-1',
        rosterEntryId: 'roster-entry-2',
        checkedInAt: '2026-08-01T12:06:00.000Z',
        offline: true,
        collectorPersonId: 'person-official-2',
        collectorCredential: 'credential-official-2-match-1',
      },
      attempts: 0,
      queuedAt: '2026-08-01T12:06:01.000Z',
    });
    storage.seed({
      kind: 'SCANNER',
      id: 'legacy-scanner',
      userScope: 'official-2',
      scannerCheckIn: {
        clientId: 'legacy-scanner',
        matchId: 'match-1',
        code: 'legacy-code',
        checkedInAt: '2026-08-01T12:07:00.000Z',
        offline: true,
      },
      attempts: 0,
      queuedAt: '2026-08-01T12:07:01.000Z',
    });

    queue.start();
    await vi.waitFor(() => expect(queue.pending()).toHaveLength(3));

    expect(queue.pendingForMatch('match-1')).toBe(1);
    expect(queue.retainedActionCountForMatch('match-1')).toBe(1);
    expect(queue.unverifiedAttendanceCountForMatch('match-1')).toBe(1);
  });

  it('obtains and persists the signed collector proof before offline collection', async () => {
    const storage = new InMemorySportsQueueStorage();
    const createOfflineCollectorCredential = vi.fn(() =>
      of({
        credential: 'fresh-signed-proof',
        collectorPersonId: 'person-official-1',
        issuedAt: '2026-08-01T11:30:00.000Z',
      }),
    );
    const queue = createQueue(storage, { createOfflineCollectorCredential });
    storage.removeCollectorCredential('official-1', 'match-1');

    await expect(queue.prepareCollector('match-1')).resolves.toBe(true);

    expect(createOfflineCollectorCredential).toHaveBeenCalledWith('match-1');
    expect(storage.collectorCredential('official-1', 'match-1')).toEqual(
      expect.objectContaining({ credential: 'fresh-signed-proof', collectorPersonId: 'person-official-1' }),
    );
    expect(queue.canCollectAttendance('match-1')).toBe(true);
  });

  it('refuses to create an unproven offline attendance entry', async () => {
    const storage = new InMemorySportsQueueStorage();
    const queue = createQueue(storage, {}, { value: false });
    storage.removeCollectorCredential('official-1', 'match-1');

    await expect(queue.prepareCollector('match-1')).resolves.toBe(false);
    expect(queue.canCollectAttendance('match-1')).toBe(false);
    await expect(
      queue.enqueueCheckIn({
        clientId: 'unproven-check-in',
        matchId: 'match-1',
        rosterEntryId: 'roster-entry-1',
        checkedInAt: '2026-08-01T12:05:00.000Z',
        offline: true,
      }),
    ).rejects.toThrow('A coleta off-line ainda não foi preparada');
    expect(storage.get('official-1', 'unproven-check-in')).toBeUndefined();
  });

  it('exposes a typed timer conflict and discards only replaced timer actions', async () => {
    const storage = new InMemorySportsQueueStorage();
    const commit = vi.fn(() => throwError(() => new Error('A partida mudou em outro dispositivo.')));
    const queue = createQueue(storage, { commit });
    await queue.enqueueAction({
      clientId: 'timer-1',
      matchId: 'match-1',
      baseRevision: 2,
      type: 'PAUSE',
      payloadJson: '{}',
      authoredAt: '2026-08-01T12:05:00.000Z',
      offline: true,
    });
    await queue.attachTimerSnapshot('timer-1', {
      overall: { startedAtUnixMs: null, pausedAtUnixMs: 1_754_049_900_000, elapsedBeforePauseMs: 300_000 },
      periods: [],
      activePeriod: 1,
    });
    await queue.enqueueAction({
      clientId: 'score-1',
      matchId: 'match-1',
      baseRevision: 2,
      type: 'SCORE_DELTA',
      payloadJson: '{"side":"HOME","amount":1}',
      authoredAt: '2026-08-01T12:05:01.000Z',
      offline: true,
    });

    await queue.sync();

    expect(queue.timerConflict()).toEqual(
      expect.objectContaining({
        matchId: 'match-1',
        queuedActionIds: ['timer-1'],
      }),
    );
    await queue.resolveTimerConflict('match-1', ['timer-1'], 9);
    expect(queue.pending().map((item) => item.id)).toEqual(['score-1']);
    const remaining = queue.pending()[0];
    expect(remaining?.kind === 'ACTION' ? remaining.action.baseRevision : null).toBe(9);
  });

  it('does not read or migrate the removed localStorage queue', async () => {
    const getItem = vi.fn(() =>
      JSON.stringify([
        {
          kind: 'SCANNER',
          id: 'legacy-scanner',
          userScope: 'official-1',
          scannerCheckIn: { clientId: 'legacy-scanner', matchId: 'match-1', code: 'legacy' },
        },
      ]),
    );
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() });
    const storage = new InMemorySportsQueueStorage();
    const queue = createQueue(storage, {}, { value: false });

    queue.start();
    await vi.waitFor(() => expect(queue.pending()).toEqual([]));

    expect(getItem).not.toHaveBeenCalled();
    expect(storage.get('official-1', 'legacy-scanner')).toBeUndefined();
  });
});

function createQueue(
  storage: InMemorySportsQueueStorage,
  api: Record<string, unknown>,
  online = { value: true },
): SportsOfflineQueueService {
  storage.seedCollectorCredential({
    userScope: 'official-1',
    matchId: 'match-1',
    credential: 'credential-official-1-match-1',
    collectorPersonId: 'person-official-1',
    issuedAt: '2026-08-01T11:00:00.000Z',
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: AuthService, useValue: { user: () => ({ sub: 'official-1' }) } },
      {
        provide: NetworkStatusService,
        useValue: {
          start: () => undefined,
          isOnline: () => online.value,
          watchStatusChanges: () => NEVER,
        },
      },
      {
        provide: SportsOperationsApiService,
        useValue: {
          createOfflineCollectorCredential: () =>
            of({
              credential: 'credential-official-1-match-1',
              collectorPersonId: 'person-official-1',
              issuedAt: '2026-08-01T11:00:00.000Z',
            }),
          ...api,
        },
      },
      { provide: SportsOperationOfflineQueueService, useValue: storage },
    ],
  });
  return TestBed.inject(SportsOfflineQueueService);
}

class InMemorySportsQueueStorage {
  private readonly records = new Map<string, OfflineSportsOperationQueueItem>();
  private readonly credentials = new Map<string, OfflineSportsCollectorCredential>();

  seed(item: OfflineSportsOperationQueueItem): void {
    this.records.set(this.key(item.userScope, item.id), item);
  }

  get(userScope: string, clientId: string): OfflineSportsOperationQueueItem | undefined {
    return this.records.get(this.key(userScope, clientId));
  }

  seedCollectorCredential(credential: OfflineSportsCollectorCredential): void {
    this.credentials.set(this.credentialKey(credential.userScope, credential.matchId), credential);
  }

  removeCollectorCredential(userScope: string, matchId: string): void {
    this.credentials.delete(this.credentialKey(userScope, matchId));
  }

  collectorCredential(userScope: string, matchId: string): OfflineSportsCollectorCredential | undefined {
    return this.credentials.get(this.credentialKey(userScope, matchId));
  }

  async enqueue(item: OfflineSportsOperationQueueItem): Promise<boolean> {
    const key = this.key(item.userScope, item.id);
    if (this.records.has(key)) {
      return false;
    }
    this.records.set(key, item);
    return true;
  }

  async list(userScope: string): Promise<OfflineSportsOperationQueueItem[]> {
    return [...this.records.values()]
      .filter((item) => item.userScope === userScope)
      .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
  }

  async listAll(): Promise<OfflineSportsOperationQueueItem[]> {
    return [...this.records.values()].sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
  }

  async listUploadable(userScope: string): Promise<OfflineSportsOperationQueueItem[]> {
    return (await this.listAll()).filter((item) =>
      item.kind === 'ACTION' ? item.userScope === userScope : hasOfflineSportsAttendanceCollectorProof(item),
    );
  }

  async saveCollectorCredential(credential: OfflineSportsCollectorCredential): Promise<void> {
    this.seedCollectorCredential(credential);
  }

  async getCollectorCredential(userScope: string, matchId: string): Promise<OfflineSportsCollectorCredential | null> {
    return this.credentials.get(this.credentialKey(userScope, matchId)) ?? null;
  }

  async attachTimerSnapshot(userScope: string, clientId: string, snapshot: SportsTimerSnapshot): Promise<void> {
    const item = this.get(userScope, clientId);
    if (item?.kind === 'ACTION') {
      this.records.set(this.key(userScope, clientId), { ...item, timerSnapshot: snapshot });
    }
  }

  async recordFailure(userScope: string, clientId: string, message: string): Promise<void> {
    const item = this.get(userScope, clientId);
    if (item) {
      this.records.set(this.key(userScope, clientId), {
        ...item,
        attempts: item.attempts + 1,
        lastError: message,
      });
    }
  }

  async remove(userScope: string, clientId: string): Promise<void> {
    this.records.delete(this.key(userScope, clientId));
  }

  async resolveTimerConflict(
    userScope: string,
    matchId: string,
    discardedClientIds: readonly string[],
    baseRevision: number,
  ): Promise<void> {
    const discarded = new Set(discardedClientIds);
    let nextRevision = baseRevision;
    for (const item of await this.list(userScope)) {
      if (item.kind !== 'ACTION' || item.action.matchId !== matchId) {
        continue;
      }
      if (discarded.has(item.id)) {
        await this.remove(userScope, item.id);
        continue;
      }
      this.records.set(this.key(userScope, item.id), {
        ...item,
        action: { ...item.action, baseRevision: nextRevision },
      });
      nextRevision += 1;
    }
  }

  private key(userScope: string, clientId: string): string {
    return `${userScope}:${clientId}`;
  }

  private credentialKey(userScope: string, matchId: string): string {
    return `${userScope}:${matchId}`;
  }
}

function actionItem(id: string, userScope: string): Extract<OfflineSportsOperationQueueItem, { kind: 'ACTION' }> {
  return {
    kind: 'ACTION',
    id,
    userScope,
    attempts: 0,
    queuedAt: '2026-08-01T12:00:00.000Z',
    action: {
      clientId: id,
      matchId: 'match-1',
      baseRevision: 2,
      type: 'SCORE_DELTA',
      payloadJson: '{"side":"HOME","amount":1}',
      authoredAt: '2026-08-01T12:00:00.000Z',
      offline: true,
    },
  };
}
