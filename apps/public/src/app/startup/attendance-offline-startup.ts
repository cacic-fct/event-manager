import { Injector, inject, runInInjectionContext } from '@angular/core';
import { AttendanceOfflineSyncService } from '../attendance/collection/offline/sync.service';

export function startAttendanceOfflineSync(injector: Injector): void {
  runInInjectionContext(injector, () => inject(AttendanceOfflineSyncService).start());
}
