import { Injectable, inject } from '@angular/core';
import { OfflinePublicDatabaseProvider } from './offline-public-database-provider';
import { OfflineTotpSeedRecord } from './offline-public-data-schema';

@Injectable({ providedIn: 'root' })
export class TotpSeedCacheService {
  private readonly databaseProvider = inject(OfflinePublicDatabaseProvider);

  async replaceSeed(seed: OfflineTotpSeedRecord): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.totpSeeds.put({
      ...seed,
      updatedAt: seed.updatedAt || Date.now(),
    });
  }

  async getSeed(userId: string, now = Date.now()): Promise<OfflineTotpSeedRecord | null> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return null;
    }

    const seed = await database.totpSeeds.get(userId);
    if (!seed) {
      return null;
    }

    if (this.isExpired(seed, now)) {
      await database.totpSeeds.delete(userId);
      return null;
    }

    return seed;
  }

  async getLatestValidSeed(now = Date.now()): Promise<OfflineTotpSeedRecord | null> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return null;
    }

    await this.clearExpiredSeeds(now);
    return (await database.totpSeeds.orderBy('updatedAt').last()) ?? null;
  }

  async clearExpiredSeeds(now = Date.now()): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.totpSeeds.where('sessionExpiresAt').belowOrEqual(now).delete();
  }

  async clearSeeds(): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.totpSeeds.clear();
  }

  async clearSeedsExcept(userId: string): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.totpSeeds.where('userId').notEqual(userId).delete();
  }

  private isExpired(seed: OfflineTotpSeedRecord, now: number): boolean {
    return seed.sessionExpiresAt <= now;
  }
}
