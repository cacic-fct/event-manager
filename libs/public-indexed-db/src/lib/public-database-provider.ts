import { isPlatformBrowser } from '@angular/common';
import { Service, PLATFORM_ID, inject } from '@angular/core';
import { PublicDataDatabase } from './public-data-schema';

@Service()
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
