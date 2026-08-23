import { Service, effect, inject } from '@angular/core';
import { AuthService, AuthenticatedUser } from '@cacic-fct/shared-angular';
import { PublicDataAccessService, OfflineUserSnapshot } from '@cacic-fct/public-indexed-db';
import { NetworkStatusService } from './network-status.service';

@Service()
export class OfflineUserDataService {
  private readonly auth = inject(AuthService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineData = inject(PublicDataAccessService);
  private transition: Promise<void> = Promise.resolve();
  private observedUserId: string | null | undefined;
  private cleanupBlocked = false;

  start(): void {
    effect(() => {
      const isOnline = this.networkStatus.isOnline();
      const user = this.auth.user();
      const userId = user?.sub ?? null;
      const previousUserId = this.observedUserId;
      this.observedUserId = userId;
      const requiresPurge = userId === null || (previousUserId != null && previousUserId !== userId);
      if (!isOnline && !requiresPurge) {
        return;
      }
      this.transition = this.transition
        .then(async () => {
          if (this.cleanupBlocked || requiresPurge) {
            await this.purgeWithRetry();
          }
          const currentUser = this.auth.user();
          if (!userId || currentUser?.sub !== userId) {
            return;
          }
          await this.offlineData.replaceUserSnapshot(this.toSnapshot(currentUser));
          this.cleanupBlocked = false;
        })
        .catch((error: unknown) => {
          this.cleanupBlocked = true;
          console.error('Não foi possível atualizar os dados off-line da conta.', error);
        });
    });
  }

  async getOfflineSnapshot(): Promise<OfflineUserSnapshot | null> {
    if (this.networkStatus.isOnline()) {
      return null;
    }

    if (this.cleanupBlocked) {
      return null;
    }

    const userId = this.auth.user()?.sub;
    return userId ? this.offlineData.getLatestUserSnapshot(userId) : null;
  }

  private async purgeWithRetry(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.offlineData.purgeUserData();
        this.cleanupBlocked = false;
        return;
      } catch (error: unknown) {
        lastError = error;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Falha ao limpar dados off-line da conta.');
  }

  private toSnapshot(user: AuthenticatedUser): OfflineUserSnapshot {
    return {
      userId: user.sub ?? '',
      name: this.stringClaim(user, 'name') ?? user.preferredUsername ?? null,
      picture: this.stringClaim(user, 'picture'),
      unespRole: this.roleClaim(user),
      identityDocument: this.stringClaim(user, 'identity_document'),
      enrollmentNumber: this.enrollmentNumberClaim(user),
      updatedAt: Date.now(),
    };
  }

  private stringClaim(user: AuthenticatedUser, claim: string): string | null {
    const value = user.claims?.[claim];

    return typeof value === 'string' && value.trim() ? value : null;
  }

  private roleClaim(user: AuthenticatedUser): string | string[] | null {
    const value = user.claims?.['unesp_role'];

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value) && value.every((role): role is string => typeof role === 'string')) {
      return value;
    }

    return null;
  }

  private enrollmentNumberClaim(user: AuthenticatedUser): string | number | null {
    const value = user.claims?.enrollment_number;

    return typeof value === 'string' || typeof value === 'number' ? value : null;
  }
}
