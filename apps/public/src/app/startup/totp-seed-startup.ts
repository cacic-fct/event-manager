import { Injector, inject, runInInjectionContext } from '@angular/core';
import { TotpSeedSessionService } from '../shared/totp/totp-seed-session.service';

export function startTotpSeedSession(injector: Injector): void {
  runInInjectionContext(injector, () => inject(TotpSeedSessionService).start());
}
