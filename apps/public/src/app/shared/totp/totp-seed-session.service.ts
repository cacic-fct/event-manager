import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Service, Injector, PLATFORM_ID, effect, inject } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { OfflineTotpSeedRecord, TotpSeedCacheService } from '@cacic-fct/public-indexed-db';
import { firstValueFrom } from 'rxjs';
import { NetworkStatusService } from '../network-status.service';
import { TotpApiService } from './totp-api.service';

@Service()
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
  private authGeneration = 0;
  private transition: Promise<void> = Promise.resolve();
  private removeBeforeLogoutCleanup: (() => void) | null = null;

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.removeBeforeLogoutCleanup = this.auth.registerBeforeLogoutCleanup(() => this.clearSeeds());
    this.destroyRef.onDestroy(() => this.removeBeforeLogoutCleanup?.());

    effect(
      () => {
        const userId = this.auth.user()?.sub ?? null;
        const isOnline = this.networkStatus.isOnline();
        const generation = ++this.authGeneration;
        this.transition = this.transition
          .then(async () => {
            if (this.authGeneration !== generation || this.auth.user()?.sub !== userId) {
              return;
            }
            await this.cleanupForCurrentAuthState(userId, isOnline);
            await this.prepareSeedForCurrentUser(userId, isOnline, generation);
          })
          .catch(() => {
            if (this.isCurrentGeneration(userId, generation)) {
              this.preparedUserId = null;
            }
          });
      },
      { injector: this.injector },
    );

    if (this.isBrowser) {
      const cleanupTimer = window.setInterval(() => {
        void this.cache.clearExpiredSeeds().catch(() => undefined);
      }, 30_000);
      this.destroyRef.onDestroy(() => window.clearInterval(cleanupTimer));
    }
  }

  async getWalletSeed(expectedUserId?: string, expectedGeneration?: number): Promise<OfflineTotpSeedRecord | null> {
    await this.cache.clearExpiredSeeds();

    const userId = expectedUserId ?? this.auth.user()?.sub ?? null;
    const generation = expectedGeneration ?? this.authGeneration;
    if (userId && !this.isCurrentGeneration(userId, generation)) {
      return null;
    }
    const cachedSeed = userId ? await this.cache.getSeed(userId) : null;

    if (userId && !this.isCurrentGeneration(userId, generation)) {
      return null;
    }

    if (!this.networkStatus.isOnline() || !userId) {
      return cachedSeed;
    }

    try {
      const seed = await firstValueFrom(this.api.getSeed());
      const record: OfflineTotpSeedRecord = {
        ...seed,
        updatedAt: Date.now(),
      };

      if (record.userId !== userId) {
        throw new Error('Received a TOTP seed for a different user.');
      }

      if (userId && !this.isCurrentGeneration(userId, generation)) {
        return null;
      }

      await this.cache.replaceSeed(record);
      if (userId && !this.isCurrentGeneration(userId, generation)) {
        await this.cache.clearSeed(record.userId);
        return null;
      }
      await this.cache.clearSeedsExcept(record.userId);
      return record;
    } catch (error) {
      if (cachedSeed && this.isCurrentGeneration(userId, generation)) {
        return cachedSeed;
      }

      if (userId && !this.isCurrentGeneration(userId, generation)) {
        return null;
      }

      throw error;
    }
  }

  async clearSeeds(): Promise<void> {
    this.authGeneration += 1;
    this.preparedUserId = null;
    await this.cache.clearSeeds();
  }

  private async cleanupForCurrentAuthState(userId: string | null, isOnline: boolean): Promise<void> {
    await this.cache.clearExpiredSeeds();

    if (!userId) {
      await this.cache.clearSeeds();
      this.preparedUserId = null;
      return;
    }

    if (!isOnline) {
      return;
    }

    await this.cache.clearSeedsExcept(userId);
  }

  private async prepareSeedForCurrentUser(userId: string | null, isOnline: boolean, generation: number): Promise<void> {
    if (!isOnline || !userId || this.preparedUserId === userId) {
      return;
    }

    try {
      const seed = await this.getWalletSeed(userId, generation);
      if (seed && this.isCurrentGeneration(userId, generation)) {
        this.preparedUserId = userId;
      }
    } catch {
      if (this.isCurrentGeneration(userId, generation)) {
        this.preparedUserId = null;
      }
    }
  }

  private isCurrentGeneration(userId: string | null, generation?: number): boolean {
    return this.auth.user()?.sub === userId && (generation === undefined || generation === this.authGeneration);
  }
}
