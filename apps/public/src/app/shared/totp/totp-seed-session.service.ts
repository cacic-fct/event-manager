import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, Injector, PLATFORM_ID, effect, inject } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { OfflineTotpSeedRecord, TotpSeedCacheService } from '@cacic-fct/offline-public-data-access';
import { firstValueFrom } from 'rxjs';
import { NetworkStatusService } from '../network-status.service';
import { TotpApiService } from './totp-api.service';

@Injectable({ providedIn: 'root' })
export class TotpSeedSessionService {
  private readonly auth = inject(AuthService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly api = inject(TotpApiService);
  private readonly cache = inject(TotpSeedCacheService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private started = false;
  private preparedUserId: string | null = null;

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    effect(
      () => {
        const userId = this.auth.user()?.sub ?? null;
        const isOnline = this.networkStatus.isOnline();
        void this.cleanupForCurrentAuthState(userId, isOnline);
        void this.prepareSeedForCurrentUser(userId, isOnline);
      },
      { injector: this.injector },
    );

    if (this.isBrowser) {
      const cleanupTimer = window.setInterval(() => {
        void this.cache.clearExpiredSeeds();
      }, 30_000);
      this.destroyRef.onDestroy(() => window.clearInterval(cleanupTimer));
    }
  }

  async getWalletSeed(): Promise<OfflineTotpSeedRecord | null> {
    await this.cache.clearExpiredSeeds();

    const userId = this.auth.user()?.sub ?? null;
    const cachedSeed = userId ? await this.cache.getSeed(userId) : await this.cache.getLatestValidSeed();

    if (!this.networkStatus.isOnline() || !userId) {
      return cachedSeed;
    }

    try {
      const seed = await firstValueFrom(this.api.getSeed());
      const record: OfflineTotpSeedRecord = {
        ...seed,
        updatedAt: Date.now(),
      };

      await this.cache.replaceSeed(record);
      await this.cache.clearSeedsExcept(record.userId);
      return record;
    } catch (error) {
      if (cachedSeed) {
        return cachedSeed;
      }

      throw error;
    }
  }

  async clearSeeds(): Promise<void> {
    await this.cache.clearSeeds();
  }

  private async cleanupForCurrentAuthState(userId: string | null, isOnline: boolean): Promise<void> {
    await this.cache.clearExpiredSeeds();

    if (!isOnline) {
      return;
    }

    if (!userId) {
      await this.cache.clearSeeds();
      this.preparedUserId = null;
      return;
    }

    await this.cache.clearSeedsExcept(userId);
  }

  private async prepareSeedForCurrentUser(userId: string | null, isOnline: boolean): Promise<void> {
    if (!isOnline || !userId || this.preparedUserId === userId) {
      return;
    }

    this.preparedUserId = userId;

    try {
      await this.getWalletSeed();
    } catch {
      this.preparedUserId = null;
    }
  }
}
