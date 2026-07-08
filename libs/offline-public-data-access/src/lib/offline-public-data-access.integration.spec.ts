import 'fake-indexeddb/auto';
import '@angular/compiler';
import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import Dexie from 'dexie';
import { firstValueFrom } from 'rxjs';
import { AttendanceOfflineQueueService } from './attendance-offline-queue.service';
import type { OfflineAttendanceQueueItem, OfflineTotpSeedRecord } from './offline-public-data-schema';
import { OfflinePublicDataDatabase } from './offline-public-data-schema';
import { OfflinePublicDatabaseProvider } from './offline-public-database-provider';
import { CalendarOfflineDataService } from './calendar-offline-data.service';
import { CalendarPreferencesStorageService } from './calendar-preferences-storage.service';
import { TotpSeedCacheService } from './totp-seed-cache.service';
import { OfflinePublicDataAccessService } from './public-offline-database';
import { UserOfflineDataService } from './user-offline-data.service';

describe('offline public data access integration', () => {
  let database: OfflinePublicDataDatabase;
  let injector: EnvironmentInjector;
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;

  beforeEach(async () => {
    await Dexie.delete('cacic-public-offline-data');
    database = new OfflinePublicDataDatabase();

    injector = createEnvironmentInjector([
      {
        provide: OfflinePublicDatabaseProvider,
        useValue: {
          getDatabase: () => database,
        },
      },
      CalendarOfflineDataService,
      CalendarPreferencesStorageService,
      UserOfflineDataService,
      TotpSeedCacheService,
      OfflinePublicDataAccessService,
    ], rootEnvironmentInjector);
  });

  afterEach(async () => {
    injector?.destroy();
    database?.close();
    await Dexie.delete('cacic-public-offline-data');
  });

  it('persists calendar events, expires old rows, and records the refresh timestamp', async () => {
    const service = injectService(CalendarOfflineDataService);
    await database.calendarEvents.put({
      id: 'expired-event',
      startDate: '2000-04-20T09:00:00.000Z',
      cachedAt: Date.now() - 1,
      event: event('expired-event', '2000-04-20T09:00:00.000Z'),
    });

    await service.upsertEvents([
      event('later-event', '2026-06-27T14:00:00.000Z'),
      event('early-event', '2026-06-26T09:00:00.000Z'),
    ]);

    await expect(service.getLastRefresh('calendarEvents')).resolves.toEqual(expect.any(Number));
    await expect(service.getEvents('2026-06-01T00:00:00.000Z')).resolves.toEqual([
      event('early-event', '2026-06-26T09:00:00.000Z'),
      event('later-event', '2026-06-27T14:00:00.000Z'),
    ]);
    await expect(database.calendarEvents.get('expired-event')).resolves.toBeUndefined();
  });

  it('keeps attendance collection events scoped by user and sorted by event date', async () => {
    const service = injectService(AttendanceOfflineQueueService);

    await service.replaceCollectionEvents('user-1', [
      { eventId: 'late-event', event: event('late-event', '2026-06-27T14:00:00.000Z') },
      { eventId: 'early-event', event: event('early-event', '2026-06-26T09:00:00.000Z') },
    ]);
    await service.replaceCollectionEvents('user-2', [
      { eventId: 'other-user-event', event: event('other-user-event', '2026-06-25T09:00:00.000Z') },
    ]);

    await expect(service.getCollectionEvents('user-1')).resolves.toEqual([
      { eventId: 'early-event', event: event('early-event', '2026-06-26T09:00:00.000Z') },
      { eventId: 'late-event', event: event('late-event', '2026-06-27T14:00:00.000Z') },
    ]);
    await expect(service.getCollectionEvent('user-1', 'other-user-event')).resolves.toBeNull();
  });

  it('stores the calendar default item view preference in IndexedDB', async () => {
    const service = injectService(CalendarPreferencesStorageService);

    await expect(service.getDefaultItemView()).resolves.toBe('automatic');
    await expect(firstValueFrom(service.watchDefaultItemView())).resolves.toBe('automatic');

    await service.setDefaultItemView('week');

    await expect(service.getDefaultItemView()).resolves.toBe('week');
    await expect(firstValueFrom(service.watchDefaultItemView())).resolves.toBe('week');
    await expect(database.calendarPreferences.get('calendar')).resolves.toEqual(
      expect.objectContaining({
        key: 'calendar',
        defaultItemView: 'week',
        updatedAt: expect.any(Number),
      }),
    );
  });

  it('watches queued attendance items sorted newest first while hiding in-flight syncs', async () => {
    const service = injectService(AttendanceOfflineQueueService);
    await database.attendanceQueue.bulkPut([
      queueItem('newer-event-item', 'PENDING', {
        eventId: 'event-1',
        collectedAt: '2026-06-26T12:00:00.000Z',
      }),
      queueItem('older-event-item', 'FAILED', {
        eventId: 'event-1',
        collectedAt: '2026-06-26T09:00:00.000Z',
      }),
      queueItem('syncing-event-item', 'SYNCING', {
        eventId: 'event-1',
        collectedAt: '2026-06-26T13:00:00.000Z',
      }),
      queueItem('other-event-item', 'PENDING', {
        eventId: 'event-2',
        collectedAt: '2026-06-26T14:00:00.000Z',
      }),
      queueItem('other-user-item', 'PENDING', {
        queuedByUserId: 'user-2',
        eventId: 'event-1',
        collectedAt: '2026-06-26T15:00:00.000Z',
      }),
    ]);

    await expect(firstValueFrom(service.watchEventItems('user-1', 'event-1'))).resolves.toEqual([
      expect.objectContaining({ clientId: 'newer-event-item' }),
      expect.objectContaining({ clientId: 'older-event-item' }),
    ]);
    await expect(firstValueFrom(service.watchUnresolvedItems('user-1'))).resolves.toEqual([
      expect.objectContaining({ clientId: 'other-event-item' }),
      expect.objectContaining({ clientId: 'newer-event-item' }),
      expect.objectContaining({ clientId: 'older-event-item' }),
    ]);
  });

  it('resets interrupted syncs once, lists retryable items oldest first, and counts unresolved items', async () => {
    const service = injectService(AttendanceOfflineQueueService);
    await database.attendanceQueue.bulkPut([
      queueItem('pending-newer', 'PENDING', { queuedAt: 300 }),
      queueItem('failed-older', 'FAILED', { queuedAt: 100 }),
      queueItem('syncing', 'SYNCING', { queuedAt: 200 }),
      queueItem('other-user', 'PENDING', { queuedByUserId: 'user-2', queuedAt: 50 }),
    ]);

    await expect(service.listPending('user-1')).resolves.toEqual([
      expect.objectContaining({ clientId: 'failed-older', status: 'FAILED' }),
      expect.objectContaining({
        clientId: 'syncing',
        status: 'FAILED',
        lastError: 'Sincronização interrompida. Tente enviar novamente.',
      }),
      expect.objectContaining({ clientId: 'pending-newer', status: 'PENDING' }),
    ]);
    await expect(service.countPending('user-1')).resolves.toBe(3);
    await expect(service.countUnresolved('user-1')).resolves.toBe(3);
  });

  it('applies commit results without mutating queue items from another user', async () => {
    const service = injectService(AttendanceOfflineQueueService);
    await database.attendanceQueue.bulkPut([
      queueItem('created', 'SYNCING'),
      queueItem('forbidden', 'SYNCING'),
      queueItem('other-user', 'SYNCING', { queuedByUserId: 'user-2' }),
    ]);

    await service.applyCommitResults('user-1', [
      { clientId: 'created', status: 'CREATED' },
      { clientId: 'forbidden', status: 'FORBIDDEN' },
      { clientId: 'other-user', status: 'CREATED' },
    ]);

    await expect(database.attendanceQueue.get('created')).resolves.toBeUndefined();
    await expect(database.attendanceQueue.get('forbidden')).resolves.toEqual(
      expect.objectContaining({
        clientId: 'forbidden',
        status: 'FORBIDDEN',
        attempts: 1,
        lastError: 'Sem permissão para sincronizar esta presença.',
      }),
    );
    await expect(database.attendanceQueue.get('other-user')).resolves.toEqual(
      expect.objectContaining({
        clientId: 'other-user',
        queuedByUserId: 'user-2',
        status: 'SYNCING',
      }),
    );
  });

  it('marks, retries, removes, and records failures only for the current user queue', async () => {
    const service = injectService(AttendanceOfflineQueueService);
    await database.attendanceQueue.bulkPut([
      queueItem('pending', 'PENDING', { queuedAt: 300 }),
      queueItem('failed', 'FAILED', { queuedAt: 100, attempts: 1, lastError: 'Falha anterior.' }),
      queueItem('other-user', 'PENDING', { queuedByUserId: 'user-2', queuedAt: 50 }),
    ]);

    await service.markSyncing('user-1', ['pending', 'other-user']);
    await expect(database.attendanceQueue.get('pending')).resolves.toEqual(
      expect.objectContaining({
        clientId: 'pending',
        status: 'SYNCING',
      }),
    );
    await expect(database.attendanceQueue.get('other-user')).resolves.toEqual(
      expect.objectContaining({
        clientId: 'other-user',
        status: 'PENDING',
      }),
    );

    await service.recordSyncFailure('user-1', ['pending', 'other-user'], 'Falha ao enviar presença.');
    await expect(database.attendanceQueue.get('pending')).resolves.toEqual(
      expect.objectContaining({
        status: 'FAILED',
        attempts: 1,
        lastError: 'Falha ao enviar presença.',
      }),
    );
    await expect(database.attendanceQueue.get('other-user')).resolves.toEqual(
      expect.objectContaining({
        queuedByUserId: 'user-2',
        status: 'PENDING',
        attempts: 0,
      }),
    );

    await service.retry('user-1', 'failed');
    await service.remove('user-1', 'pending');
    await service.remove('user-1', 'other-user');

    await expect(database.attendanceQueue.get('pending')).resolves.toBeUndefined();
    await expect(database.attendanceQueue.get('failed')).resolves.toEqual(
      expect.objectContaining({
        status: 'PENDING',
        lastError: null,
      }),
    );
    await expect(database.attendanceQueue.get('other-user')).resolves.toEqual(
      expect.objectContaining({
        queuedByUserId: 'user-2',
        status: 'PENDING',
      }),
    );
  });

  it('keeps commit cleanup and status messages aligned with server outcomes', async () => {
    const service = injectService(AttendanceOfflineQueueService);
    await database.attendanceQueue.bulkPut([
      queueItem('duplicate', 'SYNCING'),
      queueItem('conflict', 'SYNCING'),
      queueItem('failed', 'SYNCING'),
      queueItem('custom-message', 'SYNCING'),
    ]);

    await service.applyCommitResults('user-1', [
      { clientId: 'duplicate', status: 'DUPLICATE' },
      { clientId: 'conflict', status: 'CONFLICT' },
      { clientId: 'failed', status: 'FAILED' },
      { clientId: 'custom-message', status: 'FAILED', message: 'Código expirado.' },
    ]);

    await expect(database.attendanceQueue.get('duplicate')).resolves.toBeUndefined();
    await expect(database.attendanceQueue.get('conflict')).resolves.toEqual(
      expect.objectContaining({
        status: 'CONFLICT',
        attempts: 1,
        lastError: 'Conflito encontrado. Revise antes de reenviar.',
      }),
    );
    await expect(database.attendanceQueue.get('failed')).resolves.toEqual(
      expect.objectContaining({
        status: 'FAILED',
        attempts: 1,
        lastError: 'Não foi possível sincronizar.',
      }),
    );
    await expect(database.attendanceQueue.get('custom-message')).resolves.toEqual(
      expect.objectContaining({
        status: 'FAILED',
        attempts: 1,
        lastError: 'Código expirado.',
      }),
    );
  });

  it('stores user snapshots, attendance feeds, and attendance details through the facade', async () => {
    const service = injectService(OfflinePublicDataAccessService);
    const feed = {
      majorEventItems: [],
      eventItems: [],
      standaloneCertificateFolders: [],
      attendances: [],
    };
    const detail = {
      eventType: 'event',
      details: {
        subscription: null,
        event: event('event-1', '2026-06-26T09:00:00.000Z'),
        hasIssuedCertificate: true,
        attendance: null,
      },
    } as const;

    await service.replaceUserSnapshot({
      userId: 'user-1',
      name: 'Ana',
      picture: null,
      unespRole: 'professor',
      identityDocument: '52998224725',
      updatedAt: 10,
    });
    await service.replaceUserSnapshot({
      userId: 'user-2',
      name: 'Bruno',
      picture: null,
      unespRole: null,
      identityDocument: null,
      updatedAt: 20,
    });
    await service.replaceAttendanceFeed('user-1', feed);
    await service.replaceAttendanceDetail('user-1', 'event-1', detail);

    await expect(service.getLatestUserSnapshot()).resolves.toEqual(
      expect.objectContaining({
        userId: 'user-2',
        name: 'Bruno',
      }),
    );
    await expect(service.getAttendanceFeed('user-1')).resolves.toEqual(feed);
    await expect(service.getAttendanceDetail('user-1', 'event', 'event-1')).resolves.toEqual(detail);

    await service.purgeUserData();

    await expect(service.getLatestUserSnapshot()).resolves.toBeNull();
    await expect(service.getAttendanceFeed('user-1')).resolves.toBeNull();
    await expect(service.getAttendanceDetail('user-1', 'event', 'event-1')).resolves.toBeNull();
  });

  it('returns safe fallback values when offline storage is unavailable', async () => {
    const unavailableInjector = createEnvironmentInjector([
      {
        provide: OfflinePublicDatabaseProvider,
        useValue: {
          getDatabase: () => null,
        },
      },
      AttendanceOfflineQueueService,
      CalendarOfflineDataService,
      CalendarPreferencesStorageService,
      UserOfflineDataService,
      TotpSeedCacheService,
    ], rootEnvironmentInjector);

    try {
      const attendanceQueue = runInInjectionContext(unavailableInjector, () => new AttendanceOfflineQueueService());
      const calendarData = runInInjectionContext(unavailableInjector, () => new CalendarOfflineDataService());
      const calendarPreferences = runInInjectionContext(
        unavailableInjector,
        () => new CalendarPreferencesStorageService(),
      );
      const userData = runInInjectionContext(unavailableInjector, () => new UserOfflineDataService());
      const totpSeeds = runInInjectionContext(unavailableInjector, () => new TotpSeedCacheService());

      await expect(calendarData.getEvents('2026-01-01T00:00:00.000Z')).resolves.toEqual([]);
      await expect(calendarData.getLastRefresh('calendarEvents')).resolves.toBeNull();
      await expect(calendarData.upsertEvents([event('event-1', '2026-06-26T09:00:00.000Z')])).resolves.toBeUndefined();
      await expect(calendarPreferences.getDefaultItemView()).resolves.toBe('automatic');
      await expect(firstValueFrom(calendarPreferences.watchDefaultItemView())).resolves.toBe('automatic');
      await expect(calendarPreferences.setDefaultItemView('list')).resolves.toBeUndefined();
      await expect(attendanceQueue.getCollectionEvents('user-1')).resolves.toEqual([]);
      await expect(attendanceQueue.getCollectionEvent('user-1', 'event-1')).resolves.toBeNull();
      await expect(attendanceQueue.listPending('user-1')).resolves.toEqual([]);
      await expect(attendanceQueue.countPending('user-1')).resolves.toBe(0);
      await expect(attendanceQueue.countUnresolved('user-1')).resolves.toBe(0);
      await expect(firstValueFrom(attendanceQueue.watchEventItems('user-1', 'event-1'))).resolves.toEqual([]);
      await expect(firstValueFrom(attendanceQueue.watchUnresolvedItems('user-1'))).resolves.toEqual([]);
      await expect(attendanceQueue.enqueue(queueItem('offline', 'PENDING'))).rejects.toThrow(
        'Armazenamento off-line indisponível neste navegador.',
      );
      await expect(attendanceQueue.resetSyncing('user-1')).resolves.toBeUndefined();
      await expect(attendanceQueue.recordSyncFailure('user-1', ['offline'], 'Falha')).resolves.toBeUndefined();
      await expect(attendanceQueue.applyCommitResults('user-1', [])).resolves.toBeUndefined();
      await expect(attendanceQueue.remove('user-1', 'offline')).resolves.toBeUndefined();
      await expect(attendanceQueue.retry('user-1', 'offline')).resolves.toBeUndefined();
      await expect(userData.getLatestUserSnapshot()).resolves.toBeNull();
      await expect(userData.getAttendanceFeed('user-1')).resolves.toBeNull();
      await expect(userData.getAttendanceDetail('user-1', 'event', 'event-1')).resolves.toBeNull();
      await expect(userData.purgeUserData()).resolves.toBeUndefined();
      await expect(totpSeeds.getSeed('user-1')).resolves.toBeNull();
      await expect(totpSeeds.getLatestValidSeed()).resolves.toBeNull();
      await expect(totpSeeds.replaceSeed(totpSeed('user-1'))).resolves.toBeUndefined();
      await expect(totpSeeds.clearExpiredSeeds()).resolves.toBeUndefined();
      await expect(totpSeeds.clearSeedsExcept('user-1')).resolves.toBeUndefined();
      await expect(totpSeeds.clearSeeds()).resolves.toBeUndefined();
    } finally {
      unavailableInjector.destroy();
    }
  });

  it('stores TOTP seeds, removes expired sessions, and keeps the latest valid seed', async () => {
    const service = injectService(TotpSeedCacheService);

    await service.replaceSeed(totpSeed('expired-user', { sessionExpiresAt: 999, updatedAt: 20 }));
    await service.replaceSeed(totpSeed('older-user', { sessionExpiresAt: 2_000, updatedAt: 10 }));
    await service.replaceSeed(totpSeed('latest-user', { sessionExpiresAt: 2_000, updatedAt: 30 }));

    await expect(service.getSeed('expired-user', 1_000)).resolves.toBeNull();
    await expect(database.totpSeeds.get('expired-user')).resolves.toBeUndefined();
    await expect(service.getSeed('older-user', 1_000)).resolves.toEqual(totpSeed('older-user', {
      sessionExpiresAt: 2_000,
      updatedAt: 10,
    }));
    await expect(service.getLatestValidSeed(1_000)).resolves.toEqual(totpSeed('latest-user', {
      sessionExpiresAt: 2_000,
      updatedAt: 30,
    }));

    await service.replaceSeed(totpSeed('default-updated-at', { sessionExpiresAt: 2_000, updatedAt: 0 }));
    await expect(database.totpSeeds.get('default-updated-at')).resolves.toEqual(
      expect.objectContaining({
        userId: 'default-updated-at',
        updatedAt: expect.any(Number),
      }),
    );

    await service.clearSeedsExcept('latest-user');
    await expect(database.totpSeeds.toArray()).resolves.toEqual([
      totpSeed('latest-user', { sessionExpiresAt: 2_000, updatedAt: 30 }),
    ]);

    await service.clearSeeds();
    await expect(database.totpSeeds.count()).resolves.toBe(0);
  });

  it('keeps the database unavailable on the server and memoizes it in the browser', () => {
    const serverInjector = createEnvironmentInjector([{ provide: PLATFORM_ID, useValue: 'server' }], rootEnvironmentInjector);
    const browserInjector = createEnvironmentInjector([{ provide: PLATFORM_ID, useValue: 'browser' }], rootEnvironmentInjector);

    try {
      const serverProvider = runInInjectionContext(serverInjector, () => new OfflinePublicDatabaseProvider());
      const browserProvider = runInInjectionContext(browserInjector, () => new OfflinePublicDatabaseProvider());

      expect(serverProvider.getDatabase()).toBeNull();
      expect(browserProvider.getDatabase()).toBe(browserProvider.getDatabase());
      browserProvider.getDatabase()?.close();
    } finally {
      serverInjector.destroy();
      browserInjector.destroy();
    }
  });

  function injectService<T>(service: new (...args: never[]) => T): T {
    return runInInjectionContext(injector, () => new service());
  }
});

function event(id: string, startDate: string): PublicEvent {
  return {
    id,
    name: `Evento ${id}`,
    startDate,
    endDate: addOneHour(startDate),
    emoji: '📌',
    type: 'OTHER',
  };
}

function queueItem(
  clientId: string,
  status: OfflineAttendanceQueueItem['status'],
  overrides: Partial<OfflineAttendanceQueueItem> = {},
): OfflineAttendanceQueueItem {
  return {
    clientId,
    queuedByUserId: 'user-1',
    eventId: 'event-1',
    eventName: 'Evento',
    createdByMethod: 'SCANNER',
    code: 'ABC123',
    location: {
      latitude: -22.12,
      longitude: -51.4,
      accuracyMeters: 10,
    },
    collectedAt: '2026-06-26T09:00:00.000Z',
    queuedAt: 100,
    updatedAt: 100,
    authorUserId: 'collector-1',
    authorName: 'Coletor',
    authorEmail: 'coletor@example.com',
    status,
    attempts: 0,
    ...overrides,
  };
}

function totpSeed(
  userId: string,
  overrides: Partial<OfflineTotpSeedRecord> = {},
): OfflineTotpSeedRecord {
  return {
    userId,
    primaryEmail: `${userId}@example.com`,
    seed: `seed-${userId}`,
    algorithm: 'SHA512',
    digits: 6,
    periodSeconds: 30,
    serverTime: '2026-06-26T09:00:00.000Z',
    sessionExpiresAt: 2_000,
    updatedAt: 10,
    ...overrides,
  };
}

function addOneHour(value: string): string {
  const date = new Date(value);
  date.setHours(date.getHours() + 1);

  return date.toISOString();
}
