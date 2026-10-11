import { Injector, inject, runInInjectionContext } from '@angular/core';
import { AuthReconnectLoginService } from '../auth/auth-reconnect-login.service';
import { NetworkStatusSnackbarService } from '../shared/network-status-snackbar.service';

export function startNetworkStatusServices(injector: Injector): void {
  runInInjectionContext(injector, () => {
    inject(NetworkStatusSnackbarService).start();
    inject(AuthReconnectLoginService).start();
  });
}
