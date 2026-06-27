import 'fake-indexeddb/auto';
import '@angular/compiler';
import { PLATFORM_ID, createEnvironmentInjector, runInInjectionContext, type EnvironmentInjector } from '@angular/core';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import Dexie from 'dexie';
import { AttendanceOfflineQueueService } from './attendance-offline-queue.service';
import type { OfflineAttendanceQueueItem } from './offline-public-data-schema';
import { OfflinePublicDataDatabase } from './offline-public-data-schema';
import { OfflinePublicDatabaseProvider } from './offline-public-database-provider';
import { CalendarOfflineDataService } from './calendar-offline-data.service';
import { CalendarPreferencesStorageService } from './calendar-preferences-storage.service';
import { OfflinePublicDataAccessService } from './public-offline-database';
import { UserOfflineDataService } from './user-offline-data.service';

describe('offline public data access integration', () => {
  let database: OfflinePublicDataDatabase;
  let injector: EnvironmentInjector;

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
      OfflinePublicDataAccessService,
    ]);
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

    await service.setDefaultItemView('week');

    await expect(service.getDefaultItemView()).resolves.toBe('week');
    await expect(database.calendarPreferences.get('calendar')).resolves.toEqual(
      expect.objectContaining({
        key: 'calendar',
        defaultItemView: 'week',
        updatedAt: expect.any(Number),
      }),
    );
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

  it('stores user snapshots, attendance feeds, and attendance details through the facade', async () => {
    const service = injectService(OfflinePublicDataAccessService);
    const feed = {
      majorEventItems: [],
      eventItems: [],
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

  it('keeps the database unavailable on the server and memoizes it in the browser', () => {
    const serverInjector = createEnvironmentInjector([{ provide: PLATFORM_ID, useValue: 'server' }]);
    const browserInjector = createEnvironmentInjector([{ provide: PLATFORM_ID, useValue: 'browser' }]);

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

function addOneHour(value: string): string {
  const date = new Date(value);
  date.setHours(date.getHours() + 1);

  return date.toISOString();
}
