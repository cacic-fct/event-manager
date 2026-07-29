import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AttendanceOfflineQueueService,
  OralAttendanceOfflineService,
} from '@cacic-fct/offline-public-data-access';
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
      listPending: vi.fn().mockResolvedValue([
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
        { provide: AttendanceOfflineQueueService, useValue: { listPending: vi.fn().mockResolvedValue([]) } },
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
        eventId: 'event-1',
        personId: 'person-1',
        status: 'PRESENT',
        collectedAt: '2026-07-29T12:00:00.000Z',
        collectedByUserId: 'user-1',
        location: { latitude: -22.12, longitude: -51.4, accuracyMeters: 12 },
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
      listPending: vi.fn(
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
        { provide: AttendanceOfflineQueueService, useValue: { listPending: vi.fn().mockResolvedValue([]) } },
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
    pendingResolvers[1]([item]);
    await Promise.resolve();

    expect(registerOralBatch).toHaveBeenCalledTimes(1);

    syncResult.next([]);
    syncResult.complete();
    await Promise.all([firstSync, secondSync]);
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
