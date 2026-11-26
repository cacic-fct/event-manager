import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Service, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import type {
  ChannelPreference,
  ChannelEndpointResponse,
  ListNotificationsResponse,
  Notification as NovuNotification,
  Novu,
  NovuOptions,
  Preference,
  TopicSubscription,
} from '@novu/js';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import type { AuthenticatedUser } from '@cacic-fct/shared-angular/auth/types';
import type { NovuSubscriberSession } from '@cacic-fct/shared-data-types';
import { firstValueFrom, retry, throwError, timer } from 'rxjs';
import { isRequiredNotificationPreference } from './notification-preferences';

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

const PUSH_PERMISSION_DISMISSED_KEY = 'cacic-eventos:novu-push-permission-dismissed';
const ACTIVE_SUBSCRIBER_CACHE = 'cacic-eventos:notification-session';
const ACTIVE_SUBSCRIBER_REQUEST = '/__cacic_notification_active_subscriber__';
const NOVU_SESSION_RETRY_ATTEMPTS = 2;
const NOVU_SESSION_RETRY_DELAY_MS = 2_000;

export type NovuListNotificationsArgs = {
  tags?: string[];
  read?: boolean;
  archived?: boolean;
  snoozed?: boolean;
  seen?: boolean;
  data?: Record<string, unknown>;
  limit?: number;
  after?: string;
  offset?: number;
  useCache?: boolean;
  createdGte?: number;
  createdLte?: number;
};

type NovuFilterCountResponse = {
  count: number;
};

@Service()
export class NovuNotificationsService {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly session = signal<NovuSubscriberSession | null>(null);
  private readonly readyRequests = signal(0);
  private readonly novuClient = signal<Novu | null>(null);
  private realtimeCleanup: (() => void) | null = null;
  private activeSubscriberId: string | null = null;
  private activeUserKey: string | null = null;
  private sessionRequest: Promise<NovuSubscriberSession | null> | null = null;
  private sessionRequestUserKey: string | null = null;
  private connectionRequest: Promise<void> | null = null;
  private connectionUserKey: string | null = null;
  private pushOperation: Promise<void> = Promise.resolve();
  private subscriberPersistence: Promise<void> = Promise.resolve();

  readonly loadingConfig = signal(false);
  readonly unreadCount = signal(0);
  readonly notificationPermission = signal<NotificationPermissionState>(this.readNotificationPermission());
  readonly pushPermissionDismissed = signal(this.readPushPermissionDismissed());
  readonly lastError = signal<string | null>(null);

  readonly isConfigured = computed(() => Boolean(this.session()?.applicationIdentifier));
  readonly client = computed(() => this.novuClient());

  constructor() {
    effect(() => {
      const readyRequests = this.readyRequests();
      const user = this.auth.user();
      const nextUserKey = user ? this.resolveLocalUserKey(user) : null;

      if (this.activeUserKey === nextUserKey && this.novuClient()) {
        return;
      }

      if ((!user && this.auth.initialized()) || (this.activeSubscriberId && this.activeUserKey !== nextUserKey)) {
        void this.unregisterWebPushEndpoint();
        void this.persistActiveSubscriberId(null).catch(() => undefined);
      }
      this.disconnectRealtime();
      this.novuClient.set(null);
      this.session.set(null);
      this.unreadCount.set(0);

      if (!readyRequests || !isPlatformBrowser(this.platformId) || !user || !nextUserKey) {
        this.activeUserKey = nextUserKey;
        return;
      }

      void this.connectClientOnce(user, nextUserKey);
    });

    this.destroyRef.onDestroy(() => this.disconnectRealtime());
  }

  ensureReady(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.session.set(null);
      this.novuClient.set(null);
      return;
    }

    this.readyRequests.update((value) => value + 1);
  }

  async listNotifications(args: NovuListNotificationsArgs = {}): Promise<NovuNotification[]> {
    return (await this.listNotificationPage(args)).notifications;
  }

  async listNotificationPage(args: NovuListNotificationsArgs = {}): Promise<ListNotificationsResponse> {
    const client = this.requireClient();
    const { data, error } = await client.notifications.list({ limit: 20, ...args });
    if (error) {
      throw error;
    }

    return data ?? { notifications: [], hasMore: false, filter: {} };
  }

  async loadMoreNotifications(
    after: string,
    args: NovuListNotificationsArgs = {},
  ): Promise<{
    notifications: NovuNotification[];
    hasMore: boolean;
  }> {
    const client = this.requireClient();
    const { data, error } = await client.notifications.list({ limit: 20, ...args, after });
    if (error) {
      throw error;
    }

    return {
      notifications: data?.notifications ?? [],
      hasMore: data?.hasMore ?? false,
    };
  }

  async refreshUnreadCount(): Promise<void> {
    const client = this.client();
    if (!client) {
      this.unreadCount.set(0);
      return;
    }

    const { data, error } = await client.notifications.count({ read: false, archived: false });
    if (error) {
      this.lastError.set('Não foi possível atualizar o contador de notificações.');
      return;
    }

    this.unreadCount.set(this.isFilterCountResponse(data) ? data.count : 0);
  }

  async hasUnreadNotifications(): Promise<boolean> {
    const user = this.auth.user();
    if (!user || !isPlatformBrowser(this.platformId)) {
      return false;
    }

    this.ensureReady();
    await this.connectClientOnce(user, this.resolveLocalUserKey(user));
    return this.unreadCount() > 0;
  }

  async markAsRead(notification: NovuNotification): Promise<void> {
    await this.runNotificationMutation(() => notification.read());
  }

  async markAsUnread(notification: NovuNotification): Promise<void> {
    await this.runNotificationMutation(() => notification.unread());
  }

  async markAllAsRead(): Promise<void> {
    const { error } = await this.requireClient().notifications.readAll();
    if (error) {
      throw error;
    }
    await this.refreshUnreadCount();
  }

  async archive(notification: NovuNotification): Promise<void> {
    await this.runNotificationMutation(() => notification.archive());
  }

  async unarchive(notification: NovuNotification): Promise<void> {
    await this.runNotificationMutation(() => notification.unarchive());
  }

  async archiveAllRead(): Promise<void> {
    const { error } = await this.requireClient().notifications.archiveAllRead();
    if (error) {
      throw error;
    }
    await this.refreshUnreadCount();
  }

  async delete(notification: NovuNotification): Promise<void> {
    const { error } = await notification.delete();
    if (error) {
      throw error;
    }
    await this.refreshUnreadCount();
  }

  async snooze(notification: NovuNotification, snoozeUntil: Date): Promise<void> {
    await this.runNotificationMutation(() => notification.snooze(snoozeUntil.toISOString()));
  }

  async unsnooze(notification: NovuNotification): Promise<void> {
    await this.runNotificationMutation(() => notification.unsnooze());
  }

  async completePrimary(notification: NovuNotification): Promise<void> {
    await this.runNotificationMutation(() => notification.completePrimary());
  }

  async completeSecondary(notification: NovuNotification): Promise<void> {
    await this.runNotificationMutation(() => notification.completeSecondary());
  }

  async listPreferences(): Promise<Preference[]> {
    const { data, error } = await this.requireClient().preferences.list();
    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async updatePreferenceChannels(preference: Preference, channels: ChannelPreference): Promise<void> {
    if (isRequiredNotificationPreference(preference)) {
      throw new Error('Required notification preferences cannot be changed.');
    }
    const { error } = await preference.update({ channels });
    if (error) {
      throw error;
    }
  }

  async listSubscriptions(topicKey: string): Promise<TopicSubscription[]> {
    const { data, error } = await this.requireClient().subscriptions.list({ topicKey });
    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async listChannelEndpoints(): Promise<ChannelEndpointResponse[]> {
    const { data, error } = await this.requireClient().channelEndpoints.list();
    if (error) {
      throw error;
    }

    return data ?? [];
  }

  shouldOfferPushPermission(): boolean {
    return (
      isPlatformBrowser(this.platformId) &&
      Boolean(this.session()?.vapidPublicKey) &&
      this.notificationPermission() === 'default' &&
      !this.pushPermissionDismissed()
    );
  }

  async requestPushPermission(): Promise<NotificationPermissionState> {
    if (!isPlatformBrowser(this.platformId) || !('Notification' in window)) {
      this.notificationPermission.set('unsupported');
      return 'unsupported';
    }

    const permission = await window.Notification.requestPermission();
    const state = this.normalizePermission(permission);
    this.notificationPermission.set(state);

    if (state !== 'granted') {
      this.setPushPermissionDismissed();
      return state;
    }

    await this.registerWebPushEndpoint();
    return state;
  }

  setPushPermissionDismissed(): void {
    this.pushPermissionDismissed.set(true);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(PUSH_PERMISSION_DISMISSED_KEY, 'true');
    }
  }

  resetPushPermissionDismissed(): void {
    this.pushPermissionDismissed.set(false);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(PUSH_PERMISSION_DISMISSED_KEY);
    }
  }

  private requireClient(): Novu {
    const client = this.client();
    if (!client) {
      throw new Error('Novu client is not ready.');
    }
    return client;
  }

  private async connectClient(user: AuthenticatedUser, userKey: string): Promise<void> {
    const session = await this.fetchSubscriberSession(userKey);
    if (!session) {
      return;
    }

    const { Novu } = await import('@novu/js');
    const client = new Novu({
      applicationIdentifier: session.applicationIdentifier,
      subscriberId: session.subscriberId,
      subscriberHash: session.subscriberHash,
      useCache: true,
      ...(session.apiUrl ? { apiUrl: session.apiUrl } : {}),
      ...(session.socketUrl ? { socketUrl: session.socketUrl } : {}),
      ...(session.socketPath ? { socketOptions: { path: session.socketPath } } : {}),
    } satisfies NovuOptions);

    if (this.auth.user() !== user) {
      return;
    }

    this.session.set(session);
    this.novuClient.set(client);
    this.activeSubscriberId = session.subscriberId;
    this.activeUserKey = userKey;
    let pushIdentityPersisted = false;
    try {
      await this.persistActiveSubscriberId(session.subscriberId);
      pushIdentityPersisted = true;
    } catch {
      if (this.session() === session) {
        this.activeSubscriberId = null;
        this.lastError.set('Não foi possível ativar as notificações push neste navegador.');
      }
    }
    if (this.session() !== session) return;
    await this.refreshUnreadCount();
    if (this.session() === session && pushIdentityPersisted && this.notificationPermission() === 'granted') {
      void this.registerWebPushEndpoint();
    }

    if (this.session() !== session) return;

    this.realtimeCleanup = client.on('notifications.unread_count_changed', ({ result }) => {
      this.unreadCount.set(result.total);
    });
  }

  private async connectClientOnce(user: AuthenticatedUser, userKey: string): Promise<void> {
    if (this.connectionRequest && this.connectionUserKey === userKey) {
      return this.connectionRequest;
    }

    this.connectionUserKey = userKey;
    this.connectionRequest = this.connectClient(user, userKey)
      .catch(() => {
        if (this.auth.user() === user) this.lastError.set('Não foi possível conectar as notificações.');
      })
      .finally(() => {
        if (this.connectionUserKey === userKey) {
          this.connectionRequest = null;
          this.connectionUserKey = null;
        }
      });

    return this.connectionRequest;
  }

  private async registerWebPushEndpoint(): Promise<void> {
    const session = this.session();
    if (
      !session?.pushIntegrationIdentifier ||
      !session.vapidPublicKey ||
      this.activeSubscriberId !== session.subscriberId ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return;
    }

    const { vapidPublicKey } = session;
    this.pushOperation = this.pushOperation
      .then(async () => {
        if (this.session() !== session) return;
        // Reuse the public Workbox worker, including when the admin app is open.
        // Do not wait indefinitely for a worker that has never been installed.
        const registration = await navigator.serviceWorker.getRegistration('/app/');
        if (!registration?.active) return;
        const applicationServerKey = this.urlBase64ToUint8Array(vapidPublicKey);
        let subscription = await registration.pushManager.getSubscription();
        if (subscription && !this.usesVapidKey(subscription, applicationServerKey)) {
          await subscription.unsubscribe();
          subscription = null;
        }
        subscription ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        if (this.session() !== session) {
          await subscription.unsubscribe();
          return;
        }
        const { endpoint, keys } = subscription.toJSON();
        await firstValueFrom(
          this.http.post<void>('/api/notifications/push-subscription', {
            subscriberId: session.subscriberId,
            endpoint,
            p256dh: keys?.['p256dh'],
            auth: keys?.['auth'],
          }),
        );
        if (this.session() !== session) await subscription.unsubscribe();
      })
      .catch(() => {
        this.lastError.set('Não foi possível registrar este navegador para notificações push.');
      });
    return this.pushOperation;
  }

  private async unregisterWebPushEndpoint(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    this.pushOperation = this.pushOperation
      .then(async () => {
        if (!('serviceWorker' in navigator)) return;
        const registration = await navigator.serviceWorker.getRegistration('/app/');
        const subscription = await registration?.pushManager.getSubscription();
        await subscription?.unsubscribe();
      })
      .catch(() => {
        this.lastError.set('Não foi possível remover este navegador das notificações push.');
      });
    return this.pushOperation;
  }

  private persistActiveSubscriberId(subscriberId: string | null): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !('caches' in window)) {
      return Promise.resolve();
    }
    this.activeSubscriberId = subscriberId;
    this.subscriberPersistence = this.subscriberPersistence
      .catch(() => undefined)
      .then(async () => {
        const cache = await caches.open(ACTIVE_SUBSCRIBER_CACHE);
        if (subscriberId) {
          const previous = await cache.match(ACTIVE_SUBSCRIBER_REQUEST);
          const previousSubscriberId = await previous
            ?.json()
            .then((entry) => entry?.subscriberId)
            .catch(() => null);
          if (previousSubscriberId && previousSubscriberId !== subscriberId) {
            await this.unregisterWebPushEndpoint();
          }
          await cache.put(ACTIVE_SUBSCRIBER_REQUEST, new Response(JSON.stringify({ subscriberId })));
        } else {
          await cache.delete(ACTIVE_SUBSCRIBER_REQUEST);
        }
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration('/app/');
          for (const notification of (await registration?.getNotifications()) ?? []) {
            if (notification.data?.cacicPush && notification.data.subscriberId !== subscriberId) notification.close();
          }
        }
      });
    return this.subscriberPersistence;
  }

  private usesVapidKey(subscription: PushSubscription, expected: ArrayBuffer): boolean {
    const key = subscription.options.applicationServerKey;
    if (!key || key.byteLength !== expected.byteLength) return false;
    const expectedBytes = new Uint8Array(expected);
    return new Uint8Array(key).every((byte, index) => byte === expectedBytes[index]);
  }

  private urlBase64ToUint8Array(value: string): ArrayBuffer {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(new ArrayBuffer(raw.length));
    for (let index = 0; index < raw.length; index += 1) {
      output[index] = raw.charCodeAt(index);
    }
    return output.buffer;
  }

  private async fetchSubscriberSession(userKey: string): Promise<NovuSubscriberSession | null> {
    if (this.sessionRequest && this.sessionRequestUserKey === userKey) {
      return this.sessionRequest;
    }

    this.loadingConfig.set(true);
    this.lastError.set(null);
    this.sessionRequestUserKey = userKey;
    this.sessionRequest = firstValueFrom(
      this.http.get<NovuSubscriberSession>('/api/notifications/novu-session').pipe(
        retry({
          count: NOVU_SESSION_RETRY_ATTEMPTS,
          delay: (error: unknown, retryCount) =>
            this.isTransientSessionFetchError(error)
              ? timer(NOVU_SESSION_RETRY_DELAY_MS * retryCount)
              : throwError(() => error),
        }),
      ),
    ).catch(() => {
      this.lastError.set('Não foi possível iniciar as notificações com segurança.');
      return null;
    });

    try {
      return await this.sessionRequest;
    } finally {
      if (this.sessionRequestUserKey === userKey) {
        this.sessionRequest = null;
        this.sessionRequestUserKey = null;
      }
      this.loadingConfig.set(false);
    }
  }

  private isTransientSessionFetchError(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return true;
    }

    return error.status === 0 || error.status >= 500;
  }

  private async runNotificationMutation(mutation: () => ReturnType<NovuNotification['read']>): Promise<void> {
    const { error } = await mutation();
    if (error) {
      throw error;
    }
    await this.refreshUnreadCount();
  }

  private resolveLocalUserKey(user: AuthenticatedUser): string {
    const userKey = user.sub ?? user.email ?? user.preferredUsername;
    if (!userKey) {
      throw new Error('Authenticated user does not have a stable subscriber identifier.');
    }

    return userKey;
  }

  private isFilterCountResponse(data: unknown): data is NovuFilterCountResponse {
    return Boolean(data && typeof data === 'object' && 'count' in data && typeof data.count === 'number');
  }

  private disconnectRealtime(): void {
    this.realtimeCleanup?.();
    this.realtimeCleanup = null;
  }

  private readNotificationPermission(): NotificationPermissionState {
    if (!isPlatformBrowser(this.platformId) || !('Notification' in globalThis)) {
      return 'unsupported';
    }

    return this.normalizePermission(window.Notification.permission);
  }

  private normalizePermission(permission: NotificationPermission): NotificationPermissionState {
    if (permission === 'granted' || permission === 'denied') {
      return permission;
    }

    return 'default';
  }

  private readPushPermissionDismissed(): boolean {
    return isPlatformBrowser(this.platformId) && localStorage.getItem(PUSH_PERMISSION_DISMISSED_KEY) === 'true';
  }
}
