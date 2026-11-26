import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import type { AuthenticatedUser } from '@cacic-fct/shared-angular/auth/types';
import type { NovuSubscriberSession } from '@cacic-fct/shared-data-types';
import { NovuNotificationsService } from '@cacic-fct/shared-notifications-angular/service';

const sdk = vi.hoisted(() => ({
  on: vi.fn(() => vi.fn()),
  count: vi.fn(async () => ({ data: { count: 3 } })),
}));
vi.mock('@novu/js', () => ({
  Novu: class {
    on = sdk.on;
    notifications = { count: sdk.count };
  },
}));

type ConnectionMethods = {
  connectClientOnce(user: AuthenticatedUser, userKey: string): Promise<void>;
  fetchSubscriberSession(userKey: string): Promise<NovuSubscriberSession | null>;
  registerWebPushEndpoint(): Promise<void>;
};

describe('Novu connection when browser identity storage fails', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each(['open', 'match', 'put'])(
    'keeps inbox realtime available after cache.%s fails and disables push',
    async (failure) => {
      const user = { sub: 'synthetic-user' } as unknown as AuthenticatedUser;
      const currentUser = signal<AuthenticatedUser | null>(user);
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          { provide: AuthService, useValue: { user: currentUser, initialized: signal(true) } },
        ],
      });
      vi.stubGlobal('localStorage', { getItem: vi.fn(() => null) });
      const service = TestBed.inject(NovuNotificationsService);
      TestBed.tick();
      const methods = service as unknown as ConnectionMethods;
      vi.spyOn(methods, 'fetchSubscriberSession').mockResolvedValue({
        applicationIdentifier: 'synthetic-app',
        subscriberId: 'synthetic-user',
        subscriberHash: 'hash',
        vapidPublicKey: 'synthetic-key',
        pushIntegrationIdentifier: 'push',
      });
      const cache = { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) };
      const open = vi.fn(async () => cache);
      if (failure === 'open') open.mockRejectedValue(new Error('storage unavailable'));
      if (failure === 'match') cache.match.mockRejectedValue(new Error('storage unavailable'));
      if (failure === 'put') cache.put.mockRejectedValue(new Error('quota exceeded'));
      vi.stubGlobal('caches', { open });
      service.notificationPermission.set('granted');
      const register = vi.spyOn(methods, 'registerWebPushEndpoint').mockResolvedValue();

      await expect(methods.connectClientOnce(user, 'synthetic-user')).resolves.toBeUndefined();
      expect(service.unreadCount()).toBe(3);
      expect(sdk.on).toHaveBeenCalledWith('notifications.unread_count_changed', expect.any(Function));
      expect(register).not.toHaveBeenCalled();
      expect(service.lastError()).toContain('push');
    },
  );
});
