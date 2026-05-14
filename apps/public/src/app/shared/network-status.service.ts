import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

export type NetworkConnectionStatus = 'online' | 'offline';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly connectionStatus = signal<NetworkConnectionStatus>(this.readConnectionStatus());

  readonly status = this.connectionStatus.asReadonly();
  readonly isOnline = computed(() => this.status() === 'online');

  watchStatusChanges(): Observable<NetworkConnectionStatus> {
    return new Observable((subscriber) => {
      if (!this.isBrowser) {
        subscriber.complete();
        return undefined;
      }

      const emitStatus = (): void => {
        const status = this.readConnectionStatus();
        this.connectionStatus.set(status);
        subscriber.next(status);
      };

      window.addEventListener('online', emitStatus);
      window.addEventListener('offline', emitStatus);

      return () => {
        window.removeEventListener('online', emitStatus);
        window.removeEventListener('offline', emitStatus);
      };
    });
  }

  start(): void {
    if (!this.isBrowser) {
      return;
    }

    this.connectionStatus.set(this.readConnectionStatus());
  }

  private readConnectionStatus(): NetworkConnectionStatus {
    if (!this.isBrowser) {
      return 'online';
    }

    return navigator.onLine ? 'online' : 'offline';
  }
}
