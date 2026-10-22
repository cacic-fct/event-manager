import { Injector, inject, runInInjectionContext } from '@angular/core';
import { ServiceWorkerService } from '@cacic-fct/shared-angular/service-worker';

export function startServiceWorker(injector: Injector): void {
  runInInjectionContext(injector, () => inject(ServiceWorkerService).start('APP_VERSION_PLACEHOLDER'));
}
