import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { Injector, PLATFORM_ID } from '@angular/core';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { CacicProductAnalyticsService, PRODUCT_ANALYTICS_CONFIG } from './product-analytics.service';

const { readTrackingCookies } = vi.hoisted(() => ({ readTrackingCookies: vi.fn() }));

vi.mock('@cacic-fct/account-manager-privacy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cacic-fct/account-manager-privacy')>()),
  readCacicTrackingCookies: readTrackingCookies,
}));

function createAnalytics(options: { hostname?: string; platform?: string; userId?: string } = {}) {
  const fetch = vi.fn().mockResolvedValue(undefined);
  const settings = vi.fn().mockReturnValue(null);
  readTrackingCookies.mockReturnValue({ consent: null });
  const injector = Injector.create({
    providers: [
      CacicProductAnalyticsService,
      { provide: PLATFORM_ID, useValue: options.platform ?? 'browser' },
      {
        provide: DOCUMENT,
        useValue: {
          defaultView: {
            fetch,
            location: new URL(`https://${options.hostname ?? 'eventos.example.test'}/event/123?token=sensitive`),
          },
        },
      },
      { provide: CacicAccountPrivacyService, useValue: { settings } },
      { provide: AuthService, useValue: { user: () => (options.userId ? { sub: options.userId } : null) } },
      {
        provide: PRODUCT_ANALYTICS_CONFIG,
        useValue: {
          websiteId: 'eventos-public',
          sendUrl: new URL('https://umami.example.test/api/send'),
          domains: ['eventos.example.test'],
        },
      },
    ],
  });

  return { analytics: injector.get(CacicProductAnalyticsService), fetch, settings };
}

describe('optional product analytics', () => {
  it('uses the Account Manager directive and stops sending after withdrawal', () => {
    const { analytics, fetch } = createAnalytics();
    analytics.record('login_button_attempt');
    expect(fetch).not.toHaveBeenCalled();

    readTrackingCookies.mockReturnValue({ consent: { analyticsAllowed: true } });
    analytics.record('login_button_attempt');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      new URL('https://umami.example.test/api/send'),
      expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true }),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      type: 'event',
      payload: {
        website: 'eventos-public',
        hostname: 'eventos.example.test',
        url: '/metrics/product',
        name: 'login_button_attempt',
      },
    });

    readTrackingCookies.mockReturnValue({ consent: { analyticsAllowed: false } });
    analytics.record('ticket_checkout_started');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honors the account preference, configured domains and SSR', () => {
    const account = createAnalytics({ userId: 'active-user' });
    readTrackingCookies.mockReturnValue({ analyticsId: 'active-user', consent: { analyticsAllowed: true } });
    account.settings.mockReturnValue({ userId: 'active-user', settings: { analytics_tracking: false } });
    account.analytics.record('event_detail_viewed');
    expect(account.fetch).not.toHaveBeenCalled();

    const preview = createAnalytics({ hostname: 'preview.example.test', userId: 'active-user' });
    preview.settings.mockReturnValue({ userId: 'active-user', settings: { analytics_tracking: true } });
    preview.analytics.record('event_detail_viewed');
    expect(preview.fetch).not.toHaveBeenCalled();

    const server = createAnalytics({ platform: 'server', userId: 'active-user' });
    server.settings.mockReturnValue({ userId: 'active-user', settings: { analytics_tracking: true } });
    server.analytics.record('event_detail_viewed');
    expect(server.fetch).not.toHaveBeenCalled();
  });

  it('sends allowlisted property values and strips unknown keys and values', () => {
    const { analytics, fetch, settings } = createAnalytics({ userId: 'active-user' });
    settings.mockReturnValue({ userId: 'active-user', settings: { analytics_tracking: true } });
    const details = { result: 'matches', source: 'network', query: 'private search' } as const;

    analytics.record('calendar_search_completed', details);
    Reflect.apply(analytics.record, analytics, ['calendar_search_completed', { ...details, source: 'private-value' }]);

    expect(JSON.parse(fetch.mock.calls[0][1].body).payload.data).toEqual({ result: 'matches', source: 'network' });
    expect(JSON.parse(fetch.mock.calls[1][1].body).payload.data).toEqual({ result: 'matches' });
  });

  it('ignores a previous account’s settings and cookie', () => {
    const { analytics, fetch, settings } = createAnalytics({ userId: 'active-user' });
    settings.mockReturnValue({ userId: 'previous-user', settings: { analytics_tracking: true } });
    readTrackingCookies.mockReturnValue({ analyticsId: 'previous-user', consent: { analyticsAllowed: true } });

    analytics.record('event_detail_viewed');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('allows application actions to continue if delivery fails', () => {
    const { analytics, fetch, settings } = createAnalytics({ userId: 'active-user' });
    settings.mockReturnValue({ userId: 'active-user', settings: { analytics_tracking: true } });
    fetch.mockRejectedValueOnce(new Error('blocked'));

    expect(() => analytics.record('login_button_attempt')).not.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
