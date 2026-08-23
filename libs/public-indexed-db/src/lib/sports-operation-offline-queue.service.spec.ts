import 'fake-indexeddb/auto';
import '@angular/compiler';
import { EnvironmentInjector, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import Dexie from 'dexie';
import {
  OFFLINE_SPORTS_COLLECTOR_PROOF_MISSING,
  PublicDataDatabase,
  type OfflineSportsOperationQueueItem,
} from './public-data-schema';
import { PublicDatabaseProvider } from './public-database-provider';
import { SportsOperationOfflineQueueService } from './sports-operation-offline-queue.service';
import { UserOfflineDataService } from './user-offline-data.service';

const DATABASE_NAME = 'cacic-public-offline-data-sports-queue-tests';

describe('SportsOperationOfflineQueueService', () => {
  let database: PublicDataDatabase;
  let injector: EnvironmentInjector;
  let service: SportsOperationOfflineQueueService;
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;

  beforeEach(async () => {
    await Dexie.delete(DATABASE_NAME);
    database = new PublicDataDatabase(DATABASE_NAME);
    injector = createEnvironmentInjector(
      [
        {
          provide: PublicDatabaseProvider,
          useValue: { getDatabase: () => database },
        },
        SportsOperationOfflineQueueService,
      ],
      rootEnvironmentInjector,
    );
    service = runInInjectionContext(injector, () => new SportsOperationOfflineQueueService());
  });

  afterEach(async () => {
    injector.destroy();
    database.close();
    await Dexie.delete(DATABASE_NAME);
  });

  it('keeps sports queues while later cache schemas are added and scopes duplicate client ids by user', async () => {
    expect(database.verno).toBe(13);
    expect(database.tables.map((table) => table.name)).toContain('sportsOperationQueue');
    expect(database.tables.map((table) => table.name)).toContain('sportsCollectorCredentials');

    await service.enqueue(actionItem('shared-client-id', 'user-1', 2));
    await service.enqueue(actionItem('shared-client-id', 'user-2', 7));

    await expect(service.list('user-1')).resolves.toEqual([
      expect.objectContaining({ id: 'shared-client-id', userScope: 'user-1' }),
    ]);
    await expect(service.list('user-2')).resolves.toEqual([
      expect.objectContaining({ id: 'shared-client-id', userScope: 'user-2' }),
    ]);

    await service.remove('user-1', 'shared-client-id');

    await expect(service.get('user-1', 'shared-client-id')).resolves.toBeNull();
    await expect(service.get('user-2', 'shared-client-id')).resolves.toEqual(
      expect.objectContaining({ userScope: 'user-2' }),
    );
  });

  it('preserves the raw scanner payload through failures until the owning user discards it', async () => {
    const rawScannerPayload = {
      clientId: 'scanner-1',
      matchId: 'match-1',
      code: '  RAW:user:scanner/á==\n01  ',
      checkedInAt: '2026-08-11T12:05:00.000Z',
      offline: true,
      collectorPersonId: 'person-user-1',
      collectorCredential: 'credential-user-1-match-1',
    };
    await service.enqueue({
      kind: 'SCANNER',
      id: rawScannerPayload.clientId,
      userScope: 'user-1',
      scannerCheckIn: rawScannerPayload,
      attempts: 0,
      queuedAt: '2026-08-11T12:05:01.000Z',
    });
    await expect(
      service.enqueue({
        kind: 'SCANNER',
        id: rawScannerPayload.clientId,
        userScope: 'user-1',
        scannerCheckIn: { ...rawScannerPayload, code: 'overwritten' },
        attempts: 0,
        queuedAt: '2026-08-11T12:06:00.000Z',
      }),
    ).resolves.toBe(false);

    await service.recordFailure('user-1', rawScannerPayload.clientId, 'Sem conexão.');
    await service.remove('user-2', rawScannerPayload.clientId);

    await expect(service.get('user-1', rawScannerPayload.clientId)).resolves.toEqual({
      kind: 'SCANNER',
      id: rawScannerPayload.clientId,
      userScope: 'user-1',
      scannerCheckIn: rawScannerPayload,
      attempts: 1,
      queuedAt: '2026-08-11T12:05:01.000Z',
      lastError: 'Sem conexão.',
      nextAttemptAt: expect.any(Number),
    });

    await service.remove('user-1', rawScannerPayload.clientId);
    await expect(service.get('user-1', rawScannerPayload.clientId)).resolves.toBeNull();
  });

  it('lists proven attendance for handoff without exposing another user actions for upload', async () => {
    await service.enqueue(actionItem('user-1-action', 'user-1', 1));
    await service.enqueue(actionItem('user-2-action', 'user-2', 1));
    await service.enqueue({
      kind: 'CHECK_IN',
      id: 'user-2-check-in',
      userScope: 'user-2',
      checkIn: {
        clientId: 'user-2-check-in',
        matchId: 'match-1',
        rosterEntryId: 'roster-entry-1',
        checkedInAt: '2026-08-11T12:01:00.000Z',
        offline: true,
        collectorPersonId: 'person-user-2',
        collectorCredential: 'credential-user-2-match-1',
      },
      attempts: 0,
      queuedAt: '2026-08-11T12:01:01.000Z',
    });

    await expect(service.listUploadable('user-1')).resolves.toEqual([
      expect.objectContaining({ id: 'user-1-action' }),
      expect.objectContaining({ id: 'user-2-check-in', userScope: 'user-2' }),
    ]);
    await expect(service.listAll()).resolves.toHaveLength(3);
  });

  it('stores a durable collector credential by original user and match', async () => {
    const credential = {
      userScope: 'user-1',
      matchId: 'match-1',
      collectorPersonId: 'person-user-1',
      credential: 'signed-proof',
      issuedAt: '2026-08-11T11:00:00.000Z',
    };

    await service.saveCollectorCredential(credential);

    await expect(service.getCollectorCredential('user-1', 'match-1')).resolves.toEqual(credential);
    await expect(service.getCollectorCredential('user-2', 'match-1')).resolves.toBeNull();
  });

  it('migrates legacy attendance without inventing collector provenance', async () => {
    const legacyDatabaseName = `${DATABASE_NAME}-legacy-v10`;
    await Dexie.delete(legacyDatabaseName);
    const legacy = new Dexie(legacyDatabaseName);
    legacy.version(10).stores({
      sportsOperationQueue: '[userScope+id], userScope, queuedAt',
    });
    await legacy.open();
    await legacy.table('sportsOperationQueue').add({
      kind: 'SCANNER',
      id: 'legacy-scanner',
      userScope: 'user-1',
      scannerCheckIn: {
        clientId: 'legacy-scanner',
        matchId: 'match-1',
        code: 'legacy-code',
        checkedInAt: '2026-08-11T12:05:00.000Z',
        offline: true,
      },
      attempts: 0,
      queuedAt: '2026-08-11T12:05:01.000Z',
    });
    legacy.close();

    const migrated = new PublicDataDatabase(legacyDatabaseName);
    try {
      await migrated.open();
      await expect(migrated.sportsOperationQueue.get(['user-1', 'legacy-scanner'])).resolves.toEqual(
        expect.objectContaining({
          userScope: 'user-1',
          lastError: OFFLINE_SPORTS_COLLECTOR_PROOF_MISSING,
          scannerCheckIn: expect.not.objectContaining({
            collectorPersonId: expect.anything(),
            collectorCredential: expect.anything(),
          }),
        }),
      );
    } finally {
      migrated.close();
      await Dexie.delete(legacyDatabaseName);
    }
  });

  it('resolves timer conflicts atomically without touching another user records', async () => {
    await database.sportsOperationQueue.bulkAdd([
      actionItem('discarded-timer', 'user-1', 1, '2026-08-11T12:00:00.000Z'),
      actionItem('rebased-score', 'user-1', 2, '2026-08-11T12:00:01.000Z'),
      actionItem('other-user-score', 'user-2', 30, '2026-08-11T12:00:00.000Z'),
    ]);

    await service.resolveTimerConflict('user-1', 'match-1', ['discarded-timer'], 9);

    await expect(service.get('user-1', 'discarded-timer')).resolves.toBeNull();
    await expect(service.get('user-1', 'rebased-score')).resolves.toEqual(
      expect.objectContaining({ action: expect.objectContaining({ baseRevision: 9 }) }),
    );
    await expect(service.get('user-2', 'other-user-score')).resolves.toEqual(
      expect.objectContaining({ action: expect.objectContaining({ baseRevision: 30 }) }),
    );
  });

  it('keeps every user sports queue when general signed-out data is purged', async () => {
    await service.enqueue(actionItem('user-1-action', 'user-1', 1));
    await service.enqueue(actionItem('user-2-action', 'user-2', 1));
    await service.saveCollectorCredential({
      userScope: 'user-1',
      matchId: 'match-1',
      collectorPersonId: 'person-user-1',
      credential: 'signed-proof',
      issuedAt: '2026-08-11T11:00:00.000Z',
    });
    const userData = runInInjectionContext(injector, () => new UserOfflineDataService());

    await userData.purgeUserData();

    await expect(service.list('user-1')).resolves.toHaveLength(1);
    await expect(service.list('user-2')).resolves.toHaveLength(1);
    await expect(service.getCollectorCredential('user-1', 'match-1')).resolves.toEqual(
      expect.objectContaining({ credential: 'signed-proof' }),
    );
  });

  it('returns safe reads and rejects writes when IndexedDB is unavailable', async () => {
    const unavailableInjector = createEnvironmentInjector(
      [{ provide: PublicDatabaseProvider, useValue: { getDatabase: () => null } }],
      rootEnvironmentInjector,
    );
    try {
      const unavailable = runInInjectionContext(unavailableInjector, () => new SportsOperationOfflineQueueService());
      await expect(unavailable.list('user-1')).resolves.toEqual([]);
      await expect(unavailable.enqueue(actionItem('action-1', 'user-1', 1))).rejects.toThrow(
        'Armazenamento off-line indisponível neste navegador.',
      );
    } finally {
      unavailableInjector.destroy();
    }
  });
});

function actionItem(
  id: string,
  userScope: string,
  baseRevision: number,
  queuedAt = '2026-08-11T12:00:00.000Z',
): OfflineSportsOperationQueueItem {
  return {
    kind: 'ACTION',
    id,
    userScope,
    attempts: 0,
    queuedAt,
    action: {
      clientId: id,
      matchId: 'match-1',
      baseRevision,
      type: id.includes('timer') ? 'PAUSE' : 'SCORE_DELTA',
      payloadJson: '{}',
      authoredAt: queuedAt,
      offline: true,
    },
  };
}
