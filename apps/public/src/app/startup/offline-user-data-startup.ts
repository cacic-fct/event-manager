import { Injector, inject, runInInjectionContext } from '@angular/core';
import { OfflineUserDataService } from '../shared/offline-user-data.service';

export function startOfflineUserData(injector: Injector): void {
  runInInjectionContext(injector, () => inject(OfflineUserDataService).start());
}
