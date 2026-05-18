import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import type {
  ChannelPreference,
  ChannelEndpointResponse,
  ListNotificationsResponse,
  Notification as NovuNotification,
  Novu,
  NovuOptions,
  Preference,
  Subscriber,
  TopicSubscription,
} from '@novu/js';
import { AuthenticatedUser, AuthService } from '@cacic-fct/shared-angular';
import { novuClientEnvironment } from '@cacic-fct/shared-environment';

export type NovuPublicConfig = {
  applicationIdentifier: string | null;
  pushIntegrationIdentifier?: string | null;
  vapidPublicKey?: string | null;
};

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

const PUSH_PERMISSION_DISMISSED_KEY = 'cacic-eventos:novu-push-permission-dismissed';
const ACTIVE_SUBSCRIBER_CACHE = 'cacic-eventos:notification-session';
const ACTIVE_SUBSCRIBER_REQUEST = '/__cacic_notification_active_subscriber__';

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
  private readonly platformId = inject(PLATFORM_ID);

  private readonly config = signal<NovuPublicConfig | null>(novuClientEnvironment);
  private readonly novuClient = signal<Novu | null>(null);
  private realtimeCleanup: (() => void) | null = null;
  private activeSubscriberId: string | null = null;

  readonly loadingConfig = signal(false);
  readonly unreadCount = signal(0);
  readonly notificationPermission = signal<NotificationPermissionState>(this.readNotificationPermission());
  readonly pushPermissionDismissed = signal(this.readPushPermissionDismissed());
  readonly lastError = signal<string | null>(null);

  readonly isConfigured = computed(() => Boolean(this.config()?.applicationIdentifier));
  readonly client = computed(() => this.novuClient());

  constructor() {
    effect(() => {
      const user = this.auth.user();
      const applicationIdentifier = this.config()?.applicationIdentifier;

      const nextSubscriberId = user ? this.resolveSubscriberId(user) : null;
      if (this.activeSubscriberId && this.activeSubscriberId !== nextSubscriberId) {
        void this.unregisterWebPushEndpoint();
        void this.persistActiveSubscriberId(null);
      }
      this.disconnectRealtime();

      if (!isPlatformBrowser(this.platformId) || !user || !applicationIdentifier) {
        this.novuClient.set(null);
        this.unreadCount.set(0);
        return;
      }

      void this.connectClient(user, applicationIdentifier);
    });

    this.destroyRef.onDestroy(() => this.disconnectRealtime());
  }

  ensureReady(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.config.set({ applicationIdentifier: null });
      return;
    }

    this.config.set(novuClientEnvironment);
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

  private async connectClient(user: AuthenticatedUser, applicationIdentifier: string): Promise<void> {
    const subscriber = this.buildSubscriber(user);
    const { Novu } = await import('@novu/js');
    const client = new Novu({
      applicationIdentifier,
      subscriber,
      useCache: true,
      apiUrl: 'https://notifications.cacic.dev.br/api',
      socketUrl: 'https://notifications.cacic.dev.br',
      socketOptions: {
        path: '/ws',
      },
    } satisfies NovuOptions);

    if (this.auth.user() !== user || this.config()?.applicationIdentifier !== applicationIdentifier) {
      return;
    }

    this.novuClient.set(client);
    this.activeSubscriberId = subscriber.subscriberId;
    await this.persistActiveSubscriberId(subscriber.subscriberId);
    await this.refreshUnreadCount();
    if (this.notificationPermission() === 'granted') {
      await this.registerWebPushEndpoint();
    }

    this.realtimeCleanup = client.on('notifications.unread_count_changed', ({ result }) => {
      this.unreadCount.set(result.total);
    });
  }

  private async registerWebPushEndpoint(): Promise<void> {
    const config = this.config();
    const user = this.auth.user();
    const client = this.client();
    if (
      !config?.pushIntegrationIdentifier ||
      !config.vapidPublicKey ||
      !user ||
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
        applicationServerKey: this.urlBase64ToUint8Array(config.vapidPublicKey),
      }));

    const key = subscription.getKey('p256dh');
    const auth = subscription.getKey('auth');
    if (!key || !auth) {
      return;
    }

    const subscriber = this.buildSubscriber(user);
    const endpointHash = btoa(subscription.endpoint).replace(/=+$/, '');
    const { error } = await client.channelEndpoints.create({
      identifier: `web-push:${endpointHash}`,
      integrationIdentifier: config.pushIntegrationIdentifier,
      subscriberId: subscriber.subscriberId,
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

  private async runNotificationMutation(mutation: () => ReturnType<NovuNotification['read']>): Promise<void> {
    const { error } = await mutation();
    if (error) {
      throw error;
    }
    await this.refreshUnreadCount();
  }

  private buildSubscriber(user: AuthenticatedUser): Subscriber {
    const subscriberId = this.resolveSubscriberId(user);

    return {
      subscriberId,
      email: user.email,
      firstName: typeof user.claims?.given_name === 'string' ? user.claims.given_name : undefined,
      lastName: typeof user.claims?.family_name === 'string' ? user.claims.family_name : undefined,
      avatar: typeof user.claims?.picture === 'string' ? user.claims.picture : undefined,
      data: {
        personName: user.claims?.name,
        preferredUsername: user.preferredUsername,
      },
    };
  }

  private resolveSubscriberId(user: AuthenticatedUser): string {
    const subscriberId = user.sub ?? user.email ?? user.preferredUsername;
    if (!subscriberId) {
      throw new Error('Authenticated user does not have a stable subscriber identifier.');
    }

    return subscriberId;
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
