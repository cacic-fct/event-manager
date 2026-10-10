import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import type { Notification, Preference } from '@novu/js';
import { filter, firstValueFrom } from 'rxjs';
import { NovuListNotificationsArgs, NovuNotificationsService } from './novu-notifications.service';
import { NovuPushPermissionDialogComponent } from './novu-push-permission-dialog.component';

type InboxTab = 'inbox' | 'unread' | 'archived' | 'preferences';
type NotificationRedirectResult = 'opened' | 'failed' | 'invalid' | 'none';

@Component({
  selector: 'lib-novu-inbox',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatToolbarModule,
  ],
  templateUrl: './novu-inbox.component.html',
  styleUrl: './novu-inbox.component.css',
})
export class NovuInboxComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly notifications = inject(NovuNotificationsService);

  readonly title = input('Notificações');

  readonly markReadOnOpen = input(true);
  readonly showUnreadFilter = input(false);
  protected readonly tabs = computed<InboxTab[]>(() => this.showUnreadFilter()
    ? ['inbox', 'unread', 'archived', 'preferences']
    : ['inbox', 'archived', 'preferences']);
  protected readonly saving = signal(false);
  private loadVersion = 0;
  protected readonly selectedTab = signal<InboxTab>('inbox');
  protected readonly notificationList = signal<Notification[]>([]);
  protected readonly preferences = signal<Preference[]>([]);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedIndex = computed(() => this.tabs().indexOf(this.selectedTab()));
  protected readonly showPushBanner = computed(() => this.notifications.shouldOfferPushPermission());
  protected readonly actionPending = signal(false);
  protected readonly busy = computed(() => this.saving() || this.actionPending());
  private readonly accessVersion = signal(0);
  private processedAccessVersion = 0;
  private markingAccessAsRead = false;

  constructor() {
    this.notifications.ensureReady();

    effect(() => {
      if (!this.notifications.client()) {
        return;
      }

      void this.reload();
    });

    effect(() => {
      const client = this.notifications.client();
      const accessVersion = this.accessVersion();
      if (!this.markReadOnOpen() || !client || accessVersion === 0 || accessVersion === this.processedAccessVersion || this.markingAccessAsRead) {
        return;
      }

      void this.markNotificationsReadForAccess(accessVersion);
    });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.recordUserAccess());

    this.recordUserAccess();
  }

  protected selectIndex(index: number): void {
    this.selectedTab.set(this.tabs()[index] ?? 'inbox');
    void this.reload();
  }

  protected async reload(): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    this.error.set(null);

    try {
      if (this.selectedTab() === 'preferences') {
        const preferences = await this.notifications.listPreferences();
        if (version === this.loadVersion) this.preferences.set(preferences);
        return;
      }

      const { notifications, hasMore } = await this.fetchCurrentTab();
      if (version !== this.loadVersion) return;
      this.notificationList.set(notifications);
      this.hasMore.set(hasMore);
    } catch {
      if (version === this.loadVersion) this.error.set('Não foi possível carregar as notificações.');
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    if (this.loading()) return;
    const version = this.loadVersion;
    const lastNotification = this.notificationList().at(-1);
    if (!lastNotification) {
      return;
    }

    this.loading.set(true);
    try {
      const result = await this.notifications.loadMoreNotifications(
        lastNotification.createdAt,
        this.filterForCurrentTab(),
      );
      if (version !== this.loadVersion) return;
      this.notificationList.update((notifications) => [...notifications, ...result.notifications]);
      this.hasMore.set(result.hasMore);
    } catch {
      if (version === this.loadVersion) this.error.set('Não foi possível carregar mais notificações.');
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }

  protected async requestPushPermission(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog.open(NovuPushPermissionDialogComponent, { width: '420px' }).afterClosed(),
    );
    if (!confirmed) {
      this.notifications.setPushPermissionDismissed();
      return;
    }

    await this.notifications.requestPushPermission();
  }

  protected dismissPushPermission(): void {
    this.notifications.setPushPermissionDismissed();
  }

  protected notificationBody(notification: Notification): SafeHtml {
    return this.sanitizer.sanitize(SecurityContext.HTML, notification.body || '') ?? '';
  }

  protected notificationIcon(notification: Notification): string {
    if (notification.severity === 'high') {
      return 'priority_high';
    }
    if (notification.isArchived) {
      return 'archive';
    }
    return notification.isRead ? 'notifications' : 'notifications_unread';
  }

  protected channelsLabel(preference: Preference): string {
    const channels = Object.entries(preference.channels)
      .filter(([, enabled]) => enabled)
      .map(([channel]) => channel.replace('_', ' '));

    return channels.length > 0 ? channels.join(', ') : 'Nenhum canal ativo';
  }

  protected async updatePreferenceChannel(
    preference: Preference,
    channel: 'in_app' | 'push',
    enabled: boolean,
  ): Promise<void> {
    await this.performMutation(() => this.notifications.updatePreferenceChannels(preference, {
      ...preference.channels,
      [channel]: enabled,
    }));
  }

  protected async markAsRead(notification: Notification): Promise<void> {
    await this.performMutation(() => this.notifications.markAsRead(notification));
  }

  protected async markAsUnread(notification: Notification): Promise<void> {
    await this.performMutation(() => this.notifications.markAsUnread(notification));
  }

  protected async archive(notification: Notification): Promise<void> {
    await this.performMutation(() => this.notifications.archive(notification));
  }

  protected async unarchive(notification: Notification): Promise<void> {
    await this.performMutation(() => this.notifications.unarchive(notification));
  }

  protected async archiveAllRead(): Promise<void> {
    await this.performMutation(() => this.notifications.archiveAllRead());
  }

  protected async delete(notification: Notification): Promise<void> {
    await this.performMutation(() => this.notifications.delete(notification));
  }

  protected async markAllAsRead(): Promise<void> {
    await this.performMutation(() => this.notifications.markAllAsRead());
  }

  private async performMutation(
    action: () => Promise<unknown>,
    failureMessage = 'Não foi possível concluir a ação. Tente novamente.',
  ): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await action();
      await this.reload();
    } catch {
      this.error.set(failureMessage);
    } finally {
      this.saving.set(false);
    }
  }

  protected async runPrimaryAction(notification: Notification): Promise<void> {
    if (this.busy()) {
      return;
    }

    this.actionPending.set(true);
    try {
      const redirectResult = await this.openRedirect(
        notification,
        notification.primaryAction?.redirect?.url,
        notification.primaryAction?.redirect?.target,
      );
      if (redirectResult !== 'opened' && redirectResult !== 'none') {
        return;
      }
      await this.performMutation(
        () => this.notifications.completePrimary(notification),
        'A notificação foi aberta, mas não foi possível registrar a ação.',
      );
    } finally {
      this.actionPending.set(false);
    }
  }

  protected async runSecondaryAction(notification: Notification): Promise<void> {
    if (this.busy()) {
      return;
    }

    this.actionPending.set(true);
    try {
      const redirectResult = await this.openRedirect(
        notification,
        notification.secondaryAction?.redirect?.url,
        notification.secondaryAction?.redirect?.target,
      );
      if (redirectResult !== 'opened' && redirectResult !== 'none') {
        return;
      }
      await this.performMutation(
        () => this.notifications.completeSecondary(notification),
        'A notificação foi aberta, mas não foi possível registrar a ação.',
      );
    } finally {
      this.actionPending.set(false);
    }
  }

  protected activateNotification(event: Event, notification: Notification): void {
    if (this.busy()) {
      return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, select, textarea, [role="button"]')) {
      return;
    }

    this.openRedirect(notification);
  }

  protected notificationRedirect(notification: Notification): string | undefined {
    return (
      notification.primaryAction?.redirect?.url ??
      notification.redirect?.url ??
      notification.secondaryAction?.redirect?.url
    );
  }

  protected openRedirect(
    notification: Notification,
    fallbackUrl = this.notificationRedirect(notification),
    fallbackTarget = notification.redirect?.target,
  ): Promise<NotificationRedirectResult> {
    if (!fallbackUrl) {
      return Promise.resolve('none');
    }

    if (fallbackUrl.startsWith('/') && !fallbackUrl.startsWith('//')) {
      try {
        const navigation = this.router.navigateByUrl(fallbackUrl);
        return navigation.then(
          (succeeded) => {
            if (!succeeded) {
              this.error.set('O link desta notificação não pôde ser aberto.');
              return 'failed';
            }
            return 'opened';
          },
          () => {
            this.error.set('O link desta notificação não pôde ser aberto.');
            return 'failed';
          },
        );
      } catch {
        this.error.set('O link desta notificação não pôde ser aberto.');
        return Promise.resolve('failed');
      }
    }

    try {
      const url = new URL(fallbackUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        // noopener deliberately returns null even when a new tab opens successfully.
        window.open(url.toString(), fallbackTarget ?? '_self', 'noopener,noreferrer');
        return Promise.resolve('opened');
      }
      this.error.set('O link desta notificação é inválido.');
      return Promise.resolve('invalid');
    } catch {
      this.error.set('O link desta notificação é inválido.');
      return Promise.resolve('invalid');
    }
  }

  private async fetchCurrentTab(): Promise<{ notifications: Notification[]; hasMore: boolean }> {
    const result = await this.notifications.listNotificationPage(this.filterForCurrentTab());
    return {
      notifications: result.notifications,
      hasMore: result.hasMore,
    };
  }

  private filterForCurrentTab(): NovuListNotificationsArgs {
    switch (this.selectedTab()) {
      case 'unread':
        return { archived: false, read: false };
      case 'archived':
        return { archived: true };
      default:
        return { archived: false };
    }
  }

  private recordUserAccess(): void {
    if (!this.isOwnRouteActive()) {
      return;
    }

    this.accessVersion.update((version) => version + 1);
  }

  private async markNotificationsReadForAccess(accessVersion: number): Promise<void> {
    this.markingAccessAsRead = true;

    try {
      await this.notifications.markAllAsRead();
      this.processedAccessVersion = accessVersion;
      if (this.selectedTab() !== 'preferences') {
        await this.reload();
      }
    } catch {
      this.error.set('Não foi possível marcar as notificações como lidas.');
    } finally {
      this.markingAccessAsRead = false;
    }
  }

  private isOwnRouteActive(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    const ownSegments = this.route.snapshot.pathFromRoot.flatMap((route) => route.url.map((segment) => segment.path));
    const activeSegments =
      this.router.parseUrl(this.router.url).root.children['primary']?.segments.map((segment) => segment.path) ?? [];

    return ownSegments.every((segment, index) => activeSegments[index] === segment);
  }
}
