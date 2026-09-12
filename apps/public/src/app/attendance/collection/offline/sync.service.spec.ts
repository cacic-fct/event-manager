import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AttendanceOfflineQueueService, OralAttendanceOfflineService } from '@cacic-fct/public-indexed-db';
import { AuthService } from '@cacic-fct/shared-angular';
import { Subject, of } from 'rxjs';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AttendanceCollectionApiService } from '../attendance-collection-api.service';
import { AttendanceIncognitoWarningService } from '../incognito-warning/attendance-incognito-warning.service';
import { AttendanceScannerCacheService } from '../scanner/cache.service';
import { AttendanceOfflineSyncService } from './sync.service';

describe('AttendanceOfflineSyncService', () => {
  it('synchronizes persisted oral decisions even when the oral page is not active', async () => {
    const registerOralBatch = vi.fn(() => of([]));
    const markSynced = vi.fn().mockResolvedValue(undefined);
    const oralQueue = {
      listUploadable: vi.fn().mockResolvedValue([
        {
          clientId: 'oral-1',
          queuedByUserId: 'user-1',
          eventId: 'event-1',
          personId: 'person-1',
          status: 'PRESENT',
          collectedAt: '2026-07-29T12:00:00.000Z',
          location: { latitude: -22.12, longitude: -51.4, accuracyMeters: 12 },
        },
      ]),
      markSynced,
      recordFailure: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        AttendanceOfflineSyncService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AttendanceCollectionApiService, useValue: { registerOralBatch } },
        { provide: AuthService, useValue: { user: () => ({ sub: 'user-1' }) } },
        { provide: AttendanceOfflineQueueService, useValue: { listUploadable: vi.fn().mockResolvedValue([]) } },
        { provide: OralAttendanceOfflineService, useValue: oralQueue },
        { provide: NetworkStatusService, useValue: { isOnline: () => true } },
        { provide: AttendanceScannerCacheService, useValue: {} },
        { provide: AttendanceIncognitoWarningService, useValue: {} },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        {
          provide: MatSnackBar,
          useValue: {
            open: vi.fn(() => ({ onAction: () => ({ subscribe: vi.fn() }) })),
          },
        },
      ],
    });

    await TestBed.inject(AttendanceOfflineSyncService).syncPending();

    expect(registerOralBatch).toHaveBeenCalledWith([
      {
        clientId: 'oral-1',
        eventId: 'event-1',
        personId: 'person-1',
        status: 'PRESENT',
        collectedAt: '2026-07-29T12:00:00.000Z',
        collectedByUserId: 'user-1',
        location: { latitude: -22.12, longitude: -51.4, accuracyMeters: 12 },
        collectorCredential: undefined,
      },
    ]);
    expect(markSynced).toHaveBeenCalledWith(['oral-1']);
  });

  it('does not process a stale oral queue snapshot while another synchronization is running', async () => {
    const pendingResolvers: Array<(items: OralItem[]) => void> = [];
    const syncResult = new Subject<never[]>();
    const registerOralBatch = vi.fn(() => syncResult.asObservable());
    const item = oralItem();
    const oralQueue = {
      listUploadable: vi.fn(
        () =>
          new Promise<OralItem[]>((resolve) => {
            pendingResolvers.push(resolve);
          }),
      ),
      markSynced: vi.fn().mockResolvedValue(undefined),
      recordFailure: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        AttendanceOfflineSyncService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AttendanceCollectionApiService, useValue: { registerOralBatch } },
        { provide: AuthService, useValue: { user: () => ({ sub: 'user-1' }) } },
        { provide: AttendanceOfflineQueueService, useValue: { listUploadable: vi.fn().mockResolvedValue([]) } },
        { provide: OralAttendanceOfflineService, useValue: oralQueue },
        { provide: NetworkStatusService, useValue: { isOnline: () => true } },
        { provide: AttendanceScannerCacheService, useValue: {} },
        { provide: AttendanceIncognitoWarningService, useValue: {} },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    const service = TestBed.inject(AttendanceOfflineSyncService);

    const firstSync = service.syncPending();
    const secondSync = service.syncPending();
    pendingResolvers[0]([item]);
    await Promise.resolve();
    await Promise.resolve();
    expect(registerOralBatch).toHaveBeenCalledTimes(1);

    syncResult.next([]);
    syncResult.complete();
    await Promise.all([firstSync, secondSync]);
  });

  it('serializes attendance queue reads before the first await', async () => {
    let release!: (items: unknown[]) => void;
    const listUploadable = vi.fn(
      () =>
        new Promise<unknown[]>((resolve) => {
          release = resolve;
        }),
    );
    const queue = {
      listUploadable,
      markSyncing: vi.fn().mockResolvedValue(undefined),
      applyCommitResults: vi.fn().mockResolvedValue(undefined),
      recordSyncFailure: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        AttendanceOfflineSyncService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AttendanceCollectionApiService, useValue: { commitOfflineAttendances: vi.fn(() => of([])) } },
        { provide: AuthService, useValue: { user: () => ({ sub: 'user-1' }) } },
        { provide: AttendanceOfflineQueueService, useValue: queue },
        { provide: OralAttendanceOfflineService, useValue: { listUploadable: vi.fn().mockResolvedValue([]) } },
        { provide: NetworkStatusService, useValue: { isOnline: () => true } },
        { provide: AttendanceScannerCacheService, useValue: {} },
        { provide: AttendanceIncognitoWarningService, useValue: {} },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    const service = TestBed.inject(AttendanceOfflineSyncService);
    const first = service.syncPending();
    const second = service.syncPending();
    await Promise.resolve();
    expect(listUploadable).toHaveBeenCalledOnce();
    release([]);
    await Promise.all([first, second]);
  });

  it('uploads a proven attendance retained from another shared-device user', async () => {
    const retainedItem = {
      clientId: 'retained-1',
      queuedByUserId: 'collector-user',
      eventId: 'event-1',
      eventName: 'Evento',
      createdByMethod: 'SCANNER',
      code: 'user:person-1',
      location: { latitude: -22.12, longitude: -51.4, accuracyMeters: 12 },
      collectedAt: '2026-07-29T12:00:00.000Z',
      queuedAt: 1,
      updatedAt: 1,
      authorUserId: 'collector-user',
      authorName: 'Coletor',
      authorEmail: null,
      collectorCredential: 'signed-collector-proof',
      status: 'PENDING',
      attempts: 0,
      lastError: null,
    } as const;
    const queue = {
      listUploadable: vi.fn().mockResolvedValue([retainedItem]),
      markSyncing: vi.fn().mockResolvedValue(undefined),
      applyCommitResults: vi.fn().mockResolvedValue(undefined),
      recordSyncFailure: vi.fn().mockResolvedValue(undefined),
    };
    const commitOfflineAttendances = vi.fn(() =>
      of([{ clientId: 'retained-1', eventId: 'event-1', status: 'CREATED' as const }]),
    );

    TestBed.configureTestingModule({
      providers: [
        AttendanceOfflineSyncService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AttendanceCollectionApiService, useValue: { commitOfflineAttendances } },
        { provide: AuthService, useValue: { user: () => ({ sub: 'uploader-user' }) } },
        { provide: AttendanceOfflineQueueService, useValue: queue },
        { provide: OralAttendanceOfflineService, useValue: { listUploadable: vi.fn().mockResolvedValue([]) } },
        { provide: NetworkStatusService, useValue: { isOnline: () => true } },
        { provide: AttendanceScannerCacheService, useValue: {} },
        { provide: AttendanceIncognitoWarningService, useValue: {} },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });

    await TestBed.inject(AttendanceOfflineSyncService).syncPending();

    expect(queue.listUploadable).toHaveBeenCalledWith('uploader-user', 80, expect.any(Set));
    expect(queue.markSyncing).toHaveBeenCalledWith('collector-user', ['retained-1']);
    expect(queue.applyCommitResults).toHaveBeenCalledWith(
      'collector-user',
      [{ clientId: 'retained-1', eventId: 'event-1', status: 'CREATED' }],
      'uploader-user',
    );
    expect(commitOfflineAttendances).toHaveBeenCalledWith([
      expect.objectContaining({
        clientId: 'retained-1',
        authorUserId: 'collector-user',
        collectorCredential: 'signed-collector-proof',
      }),
    ]);
  });

  it.each(['success', 'failed', 'missing', 'offline', 'handoff'])('drains safely across pages: %s', async (mode) => {
    let activeUserId = 'user-1';
    let online = true;
    const failFirstPage = mode === 'failed' || mode === 'missing';
    const stopAfterPage = mode === 'offline' || mode === 'handoff';
    const pending = Array.from({ length: 181 }, (_, index) => ({
      clientId: `queued-${index}`,
      queuedByUserId: 'user-1',
      eventId: 'event-1',
      eventName: 'Evento',
      createdByMethod: 'SCANNER',
      code: `user:person-${index}`,
      collectedAt: new Date().toISOString(),
      authorUserId: 'user-1',
    }));
    const queue = {
      listUploadable: vi.fn(async (_userId: string, limit: number, excluded: ReadonlySet<string>) =>
        pending.filter((item) => !excluded.has(item.clientId)).slice(0, limit),
      ),
      markSyncing: vi.fn().mockResolvedValue(undefined),
      applyCommitResults: vi.fn(async (_owner: string, results: { clientId: string; status: string }[]) => {
        for (const result of results) {
          if (result.status === 'CREATED')
            pending.splice(
              pending.findIndex((item) => item.clientId === result.clientId),
              1,
            );
        }
      }),
      recordSyncFailure: vi.fn().mockResolvedValue(undefined),
    };
    const commitOfflineAttendances = vi.fn((items: { clientId: string }[]) => {
      if (mode === 'offline') online = false;
      if (mode === 'handoff') activeUserId = 'user-2';
      return of(
        items
          .filter((item) => mode !== 'missing' || Number(item.clientId.split('-')[1]) >= 80)
          .map((item) => ({
            clientId: item.clientId,
            eventId: 'event-1',
            status: mode === 'failed' && Number(item.clientId.split('-')[1]) < 80 ? 'FAILED' : 'CREATED',
          })),
      );
    });
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        AttendanceOfflineSyncService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AttendanceCollectionApiService, useValue: { commitOfflineAttendances } },
        { provide: AuthService, useValue: { user: () => ({ sub: activeUserId }) } },
        { provide: AttendanceOfflineQueueService, useValue: queue },
        { provide: OralAttendanceOfflineService, useValue: { listUploadable: vi.fn().mockResolvedValue([]) } },
        { provide: NetworkStatusService, useValue: { isOnline: () => online } },
        { provide: AttendanceScannerCacheService, useValue: {} },
        { provide: AttendanceIncognitoWarningService, useValue: {} },
        { provide: MatDialog, useValue: { open } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    const service = TestBed.inject(AttendanceOfflineSyncService);
    vi.spyOn(service as unknown as { waitBeforeRetry(): Promise<void> }, 'waitBeforeRetry').mockResolvedValue(
      undefined,
    );
    await service.syncPending();
    expect(commitOfflineAttendances.mock.calls.map(([items]) => items.length)).toEqual(
      stopAfterPage ? [80] : failFirstPage ? [80, 80, 80, 80, 21] : [80, 80, 21],
    );
    expect(pending).toHaveLength(stopAfterPage ? 101 : failFirstPage ? 80 : 0);
    expect(queue.listUploadable).toHaveBeenCalledTimes(stopAfterPage ? 1 : 4);
    expect(open).toHaveBeenCalledTimes(mode === 'handoff' ? 0 : 1);
  });

  it('hands synchronization off to the latest account after an older run finishes', () => {
    TestBed.configureTestingModule({
      providers: [
        AttendanceOfflineSyncService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AttendanceCollectionApiService, useValue: {} },
        { provide: AuthService, useValue: { user: () => ({ sub: 'user-b' }) } },
        { provide: AttendanceOfflineQueueService, useValue: {} },
        { provide: OralAttendanceOfflineService, useValue: {} },
        { provide: NetworkStatusService, useValue: { isOnline: () => true } },
        { provide: AttendanceScannerCacheService, useValue: {} },
        { provide: AttendanceIncognitoWarningService, useValue: {} },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
      ],
    });
    const service = TestBed.inject(AttendanceOfflineSyncService);
    const syncPending = vi.spyOn(service, 'syncPending').mockResolvedValue(undefined);
    const internals = service as unknown as {
      activeUserId: string | null;
      authGeneration: number;
      rerunForLatestUser: (userId: string, generation: number) => void;
    };
    internals.activeUserId = 'user-b';
    internals.authGeneration = 2;

    internals.rerunForLatestUser('user-a', 1);

    expect(syncPending).toHaveBeenCalledWith('user-b', 2);
  });
});

type OralItem = {
  clientId: string;
  queuedByUserId: string;
  eventId: string;
  personId: string;
  status: 'PRESENT';
  collectedAt: string;
  location: { latitude: number; longitude: number; accuracyMeters: number };
};

function oralItem(): OralItem {
  return {
    clientId: 'oral-1',
    queuedByUserId: 'user-1',
    eventId: 'event-1',
    personId: 'person-1',
    status: 'PRESENT',
    collectedAt: '2026-07-29T12:00:00.000Z',
    location: { latitude: -22.12, longitude: -51.4, accuracyMeters: 12 },
  };
}
