import { TestBed } from '@angular/core/testing';
import { OfflinePublicDataAccessService } from '@cacic-fct/offline-public-data-access';
import { NovuNotificationsService } from '@cacic-fct/shared-notifications-angular';
import { AuthService } from '@cacic-fct/shared-angular';
import { NEVER, of } from 'rxjs';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { NetworkStatusService } from '../shared/network-status.service';
import { DefaultRedirectApiService } from './default-redirect-api.service';
import { DefaultRedirectService } from './default-redirect.service';

describe('DefaultRedirectService', () => {
  let api: { getCurrentUserDefaultRedirect: ReturnType<typeof vi.fn> };
  let notifications: {
    hasUnreadNotifications: ReturnType<typeof vi.fn>;
    unreadCount: ReturnType<typeof vi.fn>;
  };
  let network: { isOnline: ReturnType<typeof vi.fn> };
  let auth: { isAuthenticated: ReturnType<typeof vi.fn> };
  let offlineData: {
    getCalendarEvents: ReturnType<typeof vi.fn>;
    getLatestUserSnapshot: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = { getCurrentUserDefaultRedirect: vi.fn(() => of('CALENDAR')) };
    notifications = {
      hasUnreadNotifications: vi.fn(() => Promise.resolve(false)),
      unreadCount: vi.fn(() => 0),
    };
    network = { isOnline: vi.fn(() => true) };
    auth = { isAuthenticated: vi.fn(() => true) };
    offlineData = {
      getCalendarEvents: vi.fn(() => Promise.resolve([])),
      getLatestUserSnapshot: vi.fn(() => Promise.resolve(null)),
    };

    TestBed.configureTestingModule({
      providers: [
        DefaultRedirectService,
        { provide: AuthService, useValue: auth },
        { provide: DefaultRedirectApiService, useValue: api },
        { provide: NovuNotificationsService, useValue: notifications },
        { provide: NetworkStatusService, useValue: network },
        { provide: OfflinePublicDataAccessService, useValue: offlineData },
        {
          provide: PublicFeatureFlagService,
          useValue: { stringValue: vi.fn(() => '/feature-default') },
        },
      ],
    });
  });

  it('keeps the in-person attendance wallet route above unread notifications', async () => {
    api.getCurrentUserDefaultRedirect.mockReturnValue(of('WALLET'));
    notifications.hasUnreadNotifications.mockResolvedValue(true);

    await expect(TestBed.inject(DefaultRedirectService).resolve()).resolves.toBe('/profile/wallet');
  });

  it('prioritizes unread notifications above the backend major-event route', async () => {
    api.getCurrentUserDefaultRedirect.mockReturnValue(of('MAJOR_EVENT'));
    notifications.hasUnreadNotifications.mockResolvedValue(true);

    await expect(TestBed.inject(DefaultRedirectService).resolve()).resolves.toBe('/notifications');
  });

  it('uses cached events while offline without making an API or notification request', async () => {
    network.isOnline.mockReturnValue(false);
    offlineData.getCalendarEvents.mockResolvedValue([{ endDate: new Date(Date.now() + 60_000).toISOString() }]);

    await expect(TestBed.inject(DefaultRedirectService).resolve()).resolves.toBe('/calendar');
    expect(api.getCurrentUserDefaultRedirect).not.toHaveBeenCalled();
    expect(notifications.hasUnreadNotifications).not.toHaveBeenCalled();
  });

  it('uses menu offline when the cached calendar has no current or future events', async () => {
    network.isOnline.mockReturnValue(false);
    offlineData.getCalendarEvents.mockResolvedValue([{ endDate: new Date(Date.now() - 60_000).toISOString() }]);

    await expect(TestBed.inject(DefaultRedirectService).resolve()).resolves.toBe('/menu');
  });

  it('uses an already-cached unread notification count while offline', async () => {
    network.isOnline.mockReturnValue(false);
    notifications.unreadCount.mockReturnValue(1);

    await expect(TestBed.inject(DefaultRedirectService).resolve()).resolves.toBe('/notifications');
    expect(offlineData.getCalendarEvents).not.toHaveBeenCalled();
  });

  it('redirects a previously logged-in offline user from home using cached calendar data', async () => {
    network.isOnline.mockReturnValue(false);
    auth.isAuthenticated.mockReturnValue(false);
    offlineData.getLatestUserSnapshot.mockResolvedValue({ userId: 'offline-user' });
    offlineData.getCalendarEvents.mockResolvedValue([{ endDate: new Date(Date.now() + 60_000).toISOString() }]);
    const router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) } as unknown as import('@angular/router').Router;

    await TestBed.inject(DefaultRedirectService).navigateOfflineReturningUser(router);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/calendar');
    expect(api.getCurrentUserDefaultRedirect).not.toHaveBeenCalled();
  });

  it('keeps an offline user without a saved login on home', async () => {
    network.isOnline.mockReturnValue(false);
    auth.isAuthenticated.mockReturnValue(false);
    const router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) } as unknown as import('@angular/router').Router;

    await TestBed.inject(DefaultRedirectService).navigateOfflineReturningUser(router);

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('falls back to the feature-flagged route when the online decision times out', async () => {
    vi.useFakeTimers();
    try {
      api.getCurrentUserDefaultRedirect.mockReturnValue(NEVER);

      const result = TestBed.inject(DefaultRedirectService).resolve();
      await vi.advanceTimersByTimeAsync(400);

      await expect(result).resolves.toBe('/feature-default');
    } finally {
      vi.useRealTimers();
    }
  });
});
