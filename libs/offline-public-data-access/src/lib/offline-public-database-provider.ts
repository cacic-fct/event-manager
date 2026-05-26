import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { OfflinePublicDataDatabase } from './offline-public-data-schema';

@Injectable({ providedIn: 'root' })
export class OfflinePublicDatabaseProvider {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private database: OfflinePublicDataDatabase | null = null;

  getDatabase(): OfflinePublicDataDatabase | null {
    if (!this.isBrowser) {
      return null;
    }

    this.database ??= new OfflinePublicDataDatabase();

    return this.database;
  }
}
