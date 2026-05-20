import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthOnlineStatusService {
  private readonly platformId = inject(PLATFORM_ID);

  isOnline(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return true;
    }

    return navigator.onLine;
  }
}
