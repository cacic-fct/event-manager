import { Injectable, effect, inject } from '@angular/core';
import { AuthService, AuthenticatedUser } from '@cacic-fct/shared-angular';
import { OfflinePublicDataAccessService, OfflineUserSnapshot } from '@cacic-fct/offline-public-data-access';
import { NetworkStatusService } from './network-status.service';

@Injectable({ providedIn: 'root' })
export class OfflineUserDataService {
  private readonly auth = inject(AuthService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineData = inject(OfflinePublicDataAccessService);

  start(): void {
    effect(() => {
      const isOnline = this.networkStatus.isOnline();
      const user = this.auth.user();

      if (!isOnline) {
        return;
      }

      if (!user?.sub) {
        void this.offlineData.purgeUserData();
        return;
      }

      void this.offlineData.replaceUserSnapshot(this.toSnapshot(user));
    });
  }

  async getOfflineSnapshot(): Promise<OfflineUserSnapshot | null> {
    if (this.networkStatus.isOnline()) {
      return null;
    }

    return this.offlineData.getLatestUserSnapshot();
  }

  private toSnapshot(user: AuthenticatedUser): OfflineUserSnapshot {
    return {
      userId: user.sub ?? '',
      name: this.stringClaim(user, 'name') ?? user.preferredUsername ?? null,
      picture: this.stringClaim(user, 'picture'),
      unespRole: this.roleClaim(user),
      identityDocument: this.stringClaim(user, 'identity_document'),
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
}
