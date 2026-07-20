import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { OfflinePublicDataAccessService } from '@cacic-fct/offline-public-data-access';
import { NovuNotificationsService } from '@cacic-fct/shared-notifications-angular';
import type { DefaultRedirectRoute } from '@cacic-fct/event-manager-public-contracts';
import { firstValueFrom } from 'rxjs';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { NetworkStatusService } from '../shared/network-status.service';
import { DEFAULT_REDIRECT_TIMEOUT_MS, DefaultRedirectApiService } from './default-redirect-api.service';

const APP_ROUTE_BY_REDIRECT: Record<DefaultRedirectRoute, string> = {
  MENU: '/menu',
  CALENDAR: '/calendar',
  MAJOR_EVENT: '/major-event',
  WALLET: '/profile/wallet',
};

@Injectable({ providedIn: 'root' })
export class DefaultRedirectService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(DefaultRedirectApiService);
  private readonly featureFlags = inject(PublicFeatureFlagService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly notifications = inject(NovuNotificationsService);
  private readonly offlineData = inject(OfflinePublicDataAccessService);

  async resolve(): Promise<string> {
    const fallback = this.featureFlagFallback();
    if (!this.auth.isAuthenticated()) {
      return fallback;
    }

    if (!this.networkStatus.isOnline()) {
      return this.resolveOffline(fallback);
    }

    try {
      const [redirect, hasUnreadNotifications] = await this.withTimeout(
        Promise.all([
          firstValueFrom(this.api.getCurrentUserDefaultRedirect()),
          this.notifications.hasUnreadNotifications(),
        ]),
      );

      if (redirect === 'WALLET') {
        return APP_ROUTE_BY_REDIRECT.WALLET;
      }

      return hasUnreadNotifications ? '/notifications' : APP_ROUTE_BY_REDIRECT[redirect];
    } catch {
      return fallback;
    }
  }

  async navigateToDefault(router: Router, route?: string): Promise<void> {
    await router.navigateByUrl(route ?? (await this.resolve()));
  }

  private async resolveOffline(fallback: string): Promise<string> {
    if (this.notifications.unreadCount() > 0) {
      return '/notifications';
    }

    try {
      const now = new Date();
      const cachedEvents = await this.offlineData.getCalendarEvents(new Date(0).toISOString());
      return cachedEvents.some((event) => new Date(event.endDate) >= now) ? '/calendar' : '/menu';
    } catch {
      return fallback;
    }
  }

  private featureFlagFallback(): string {
    return this.featureFlags.stringValue('defaultLoginRedirectPath') ?? '/calendar';
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Default redirect timed out.')), DEFAULT_REDIRECT_TIMEOUT_MS);
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
