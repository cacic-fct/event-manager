import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
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

@Injectable({ providedIn: 'root' })
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

      if (this.activeSubscriberId && this.activeUserKey !== nextUserKey) {
        void this.unregisterWebPushEndpoint();
        void this.persistActiveSubscriberId(null);
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
    await this.persistActiveSubscriberId(session.subscriberId);
    await this.refreshUnreadCount();
    if (this.notificationPermission() === 'granted') {
      await this.registerWebPushEndpoint();
    }

    this.realtimeCleanup = client.on('notifications.unread_count_changed', ({ result }) => {
      this.unreadCount.set(result.total);
    });
  }

  private async connectClientOnce(user: AuthenticatedUser, userKey: string): Promise<void> {
    if (this.connectionRequest && this.connectionUserKey === userKey) {
      return this.connectionRequest;
    }

    this.connectionUserKey = userKey;
    this.connectionRequest = this.connectClient(user, userKey).finally(() => {
      if (this.connectionUserKey === userKey) {
        this.connectionRequest = null;
        this.connectionUserKey = null;
      }
    });

    return this.connectionRequest;
  }

  private async registerWebPushEndpoint(): Promise<void> {
    const session = this.session();
    const client = this.client();
    if (
      !session?.pushIntegrationIdentifier ||
      !session.vapidPublicKey ||
      !client ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(session.vapidPublicKey),
      }));

    const key = subscription.getKey('p256dh');
    const auth = subscription.getKey('auth');
    if (!key || !auth) {
      return;
    }

    const endpointHash = btoa(subscription.endpoint).replace(/=+$/, '');
    const { error } = await client.channelEndpoints.create({
      identifier: `web-push:${endpointHash}`,
      integrationIdentifier: session.pushIntegrationIdentifier,
      subscriberId: session.subscriberId,
      type: 'push',
      endpoint: {
        endpoint: subscription.endpoint,
        p256dh: this.arrayBufferToBase64Url(key),
        auth: this.arrayBufferToBase64Url(auth),
      },
    });

    if (error) {
      this.lastError.set('Não foi possível registrar este navegador para notificações push.');
    }
  }

  private async unregisterWebPushEndpoint(): Promise<void> {
    const client = this.client();
    if (!client || !isPlatformBrowser(this.platformId) || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        return;
      }

      const endpointHash = btoa(subscription.endpoint).replace(/=+$/, '');
      const { error } = await client.channelEndpoints.delete({
        identifier: `web-push:${endpointHash}`,
      });

      if (error) {
        this.lastError.set('Não foi possível remover este navegador das notificações push.');
      }
    } catch {
      this.lastError.set('Não foi possível remover este navegador das notificações push.');
    }
  }

  private async persistActiveSubscriberId(subscriberId: string | null): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !('caches' in window)) {
      return;
    }

    const cache = await caches.open(ACTIVE_SUBSCRIBER_CACHE);
    if (!subscriberId) {
      await cache.delete(ACTIVE_SUBSCRIBER_REQUEST);
      this.activeSubscriberId = null;
      return;
    }

    await cache.put(ACTIVE_SUBSCRIBER_REQUEST, new Response(JSON.stringify({ subscriberId })));
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

  private arrayBufferToBase64Url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const binary = [...bytes].map((byte) => String.fromCharCode(byte)).join('');
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
