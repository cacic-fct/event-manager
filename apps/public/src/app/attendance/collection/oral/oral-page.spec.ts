import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AttendanceOfflineQueueService,
  OralAttendanceOfflineService,
} from '@cacic-fct/offline-public-data-access';
import { AuthService } from '@cacic-fct/shared-angular';
import { of, throwError } from 'rxjs';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AttendanceCollectionAccessService } from '../access.service';
import { AttendanceCollectionApiService } from '../attendance-collection-api.service';
import { AttendanceOfflineSyncService } from '../offline/sync.service';
import { OralAttendancePage } from './oral-page';

describe('OralAttendancePage', () => {
  it.each([null, false])(
    'returns to attendance collection when the cached event is missing or disabled',
    async (shouldAllowOralAttendance) => {
      const navigate = vi.fn().mockResolvedValue(true);
      const getCollectionEvent = vi.fn().mockResolvedValue(
        shouldAllowOralAttendance === null
          ? null
          : {
              eventId: 'event-1',
              event: { id: 'event-1', name: 'Evento', shouldAllowOralAttendance },
            },
      );
      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: { get: () => 'event-1' } } },
          },
          { provide: Router, useValue: { navigate } },
          { provide: AuthService, useValue: { user: () => ({ sub: 'collector-1' }) } },
          {
            provide: AttendanceOfflineQueueService,
            useValue: { getCollectionEvent, enqueue: vi.fn() },
          },
          {
            provide: OralAttendanceOfflineService,
            useValue: {
              watchPending: () => of([]),
              getRoster: vi.fn().mockResolvedValue([]),
              listAll: vi.fn().mockResolvedValue([]),
            },
          },
          {
            provide: AttendanceCollectionApiService,
            useValue: { listCollectionEvents: () => throwError(() => new Error('offline')) },
          },
          { provide: AttendanceCollectionAccessService, useValue: {} },
          { provide: AttendanceOfflineSyncService, useValue: { syncPending: vi.fn() } },
          { provide: NetworkStatusService, useValue: { isOnline: () => false } },
          { provide: MatSnackBar, useValue: { open: vi.fn() } },
        ],
      });
      const page = TestBed.runInInjectionContext(() => new OralAttendancePage());

      page.ngOnInit();
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/attendance/collect']));
    },
  );
});
