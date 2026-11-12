import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { InjectionToken, Injector, PLATFORM_ID, Service, inject } from '@angular/core';
import { CacicAccountPrivacyService, readCacicTrackingCookies } from '@cacic-fct/account-manager-privacy';
import {
  UMAMI_BROWSER_DIMENSIONS,
  UMAMI_BROWSER_EVENT_PATH,
  type UmamiBrowserEvent,
  type UmamiBrowserEventArgs,
} from '@cacic-fct/shared-analytics';
import { AuthService } from '../auth/auth.service';

const BROWSER_DIMENSIONS: Readonly<Partial<Record<UmamiBrowserEvent, Record<string, readonly string[]>>>> =
  UMAMI_BROWSER_DIMENSIONS;

export type ProductAnalyticsConfig = {
  websiteId: string;
  sendUrl: URL;
  domains: readonly string[];
};

export const PRODUCT_ANALYTICS_CONFIG = new InjectionToken<ProductAnalyticsConfig>('Product analytics configuration');

@Service()
export class CacicProductAnalyticsService {
  private readonly window = isPlatformBrowser(inject(PLATFORM_ID)) ? inject(DOCUMENT).defaultView : null;
  private readonly injector = inject(Injector);
  private readonly config = inject(PRODUCT_ANALYTICS_CONFIG, { optional: true });
  private readonly accountPrivacy = inject(CacicAccountPrivacyService, { optional: true });

  record(...[name, details]: UmamiBrowserEventArgs): void {
    const { window, config } = this;
    if (!window || !config || (config.domains.length && !config.domains.includes(window.location.hostname))) {
      return;
    }

    try {
      if (!this.isAllowedByAccountManager()) {
        return;
      }

      const data = this.allowedDimensions(name, details);

      // Send before navigation without attaching the page URL, referral or account state.
      void window
        .fetch(config.sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          redirect: 'error',
          keepalive: true,
          signal: AbortSignal.timeout(3_000),
          body: JSON.stringify({
            type: 'event',
            payload: {
              website: config.websiteId,
              hostname: window.location.hostname,
              url: UMAMI_BROWSER_EVENT_PATH,
              name,
              ...(data && { data }),
            },
          }),
        })
        .catch(() => undefined);
    } catch {
      // Optional measurement must not interfere with application actions.
    }
  }

  private allowedDimensions(name: UmamiBrowserEvent, details: Record<string, string> | undefined) {
    const dimensions = BROWSER_DIMENSIONS[name];
    if (!details || !dimensions) {
      return undefined;
    }

    const entries = Object.entries(dimensions).flatMap(([key, values]) => {
      const value = details[key];
      return values.includes(value) ? [[key, value]] : [];
    });
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  private isAllowedByAccountManager(): boolean {
    // Read the active account at send time because this service is also used by AuthService.
    const userId = this.injector.get(AuthService, null)?.user()?.sub;
    const settings = this.accountPrivacy?.settings();
    const accountPreference = userId && settings?.userId === userId ? settings.settings.analytics_tracking : undefined;
    const { analyticsId, consent } = readCacicTrackingCookies();
    const cookiePreference = !userId || analyticsId === userId ? consent?.analyticsAllowed : undefined;
    if (accountPreference === false || cookiePreference === false) {
      return false;
    }
    return accountPreference === true || cookiePreference === true;
  }
}
