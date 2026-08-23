import { Service, inject } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { Subscription } from 'rxjs';
import { NetworkStatusService } from '../shared/network-status.service';

@Service()
export class AuthReconnectLoginService {
  private readonly auth = inject(AuthService);
  private readonly networkStatus = inject(NetworkStatusService);
  private reconnectSubscription: Subscription | null = null;

  start(): void {
    if (this.reconnectSubscription) {
      return;
    }

    let wasOffline = !this.networkStatus.isOnline();

    this.reconnectSubscription = this.networkStatus.watchStatusChanges().subscribe((status) => {
      const connectionRestored = wasOffline && status === 'online';
      wasOffline = status === 'offline';

      if (connectionRestored && !this.auth.isAuthenticated()) {
        this.auth.loginWithExistingSsoSession();
      }
    });
  }
}
