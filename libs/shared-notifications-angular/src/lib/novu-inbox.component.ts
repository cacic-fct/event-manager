import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
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

type InboxTab = 'inbox' | 'archived' | 'preferences';

@Component({
  selector: 'lib-novu-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  protected readonly tabs: InboxTab[] = ['inbox', 'archived', 'preferences'];
  protected readonly selectedTab = signal<InboxTab>('inbox');
  protected readonly notificationList = signal<Notification[]>([]);
  protected readonly preferences = signal<Preference[]>([]);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedIndex = computed(() => this.tabs.indexOf(this.selectedTab()));
  protected readonly showPushBanner = computed(() => this.notifications.shouldOfferPushPermission());
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
      if (!client || accessVersion === 0 || accessVersion === this.processedAccessVersion || this.markingAccessAsRead) {
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
    this.selectedTab.set(this.tabs[index] ?? 'inbox');
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      if (this.selectedTab() === 'preferences') {
        this.preferences.set(await this.notifications.listPreferences());
        return;
      }

      const { notifications, hasMore } = await this.fetchCurrentTab();
      this.notificationList.set(notifications);
      this.hasMore.set(hasMore);
    } catch {
      this.error.set('Não foi possível carregar as notificações.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    const lastNotification = this.notificationList().at(-1);
    if (!lastNotification) {
      return;
    }

    try {
      const result = await this.notifications.loadMoreNotifications(
        lastNotification.createdAt,
        this.filterForCurrentTab(),
      );
      this.notificationList.update((notifications) => [...notifications, ...result.notifications]);
      this.hasMore.set(result.hasMore);
    } catch {
      this.error.set('Não foi possível carregar mais notificações.');
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
    await this.notifications.updatePreferenceChannels(preference, {
      ...preference.channels,
      [channel]: enabled,
    });
    await this.reload();
  }

  protected async markAsRead(notification: Notification): Promise<void> {
    await this.notifications.markAsRead(notification);
    await this.reload();
  }

  protected async markAsUnread(notification: Notification): Promise<void> {
    await this.notifications.markAsUnread(notification);
    await this.reload();
  }

  protected async archive(notification: Notification): Promise<void> {
    await this.notifications.archive(notification);
    await this.reload();
  }

  protected async unarchive(notification: Notification): Promise<void> {
    await this.notifications.unarchive(notification);
    await this.reload();
  }

  protected async archiveAllRead(): Promise<void> {
    await this.notifications.archiveAllRead();
    await this.reload();
  }

  protected async delete(notification: Notification): Promise<void> {
    await this.notifications.delete(notification);
    await this.reload();
  }

  protected async runPrimaryAction(notification: Notification): Promise<void> {
    await this.notifications.completePrimary(notification);
    this.openRedirect(notification, notification.primaryAction?.redirect?.url);
    await this.reload();
  }

  protected async runSecondaryAction(notification: Notification): Promise<void> {
    await this.notifications.completeSecondary(notification);
    this.openRedirect(notification, notification.secondaryAction?.redirect?.url);
    await this.reload();
  }

  protected openRedirect(notification: Notification, fallbackUrl = notification.redirect?.url): void {
    if (!fallbackUrl) {
      return;
    }

    if (fallbackUrl.startsWith('/')) {
      void this.router.navigateByUrl(fallbackUrl);
      return;
    }

    window.open(fallbackUrl, notification.redirect?.target ?? '_self');
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
    const activeSegments = this.router.parseUrl(this.router.url).root.children['primary']?.segments.map((segment) => segment.path) ?? [];

    return ownSegments.every((segment, index) => activeSegments[index] === segment);
  }
}
