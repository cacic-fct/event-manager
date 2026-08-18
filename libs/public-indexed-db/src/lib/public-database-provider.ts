import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { PublicDataDatabase } from './public-data-schema';

@Injectable({ providedIn: 'root' })
export class PublicDatabaseProvider {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private database: PublicDataDatabase | null = null;

  getDatabase(): PublicDataDatabase | null {
    if (!this.isBrowser) {
      return null;
    }

    this.database ??= new PublicDataDatabase();

    return this.database;
  }
}
