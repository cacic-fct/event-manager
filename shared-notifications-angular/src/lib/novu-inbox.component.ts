import { DatePipe } from '@angular/common';
import { SecurityContext } from '@angular/core';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import type { Notification, Preference } from '@novu/js';
import { firstValueFrom } from 'rxjs';
import { NovuListNotificationsArgs, NovuNotificationsService } from './novu-notifications.service';
import { NovuPushPermissionDialogComponent } from './novu-push-permission-dialog.component';

type InboxTab = 'inbox' | 'unread' | 'archived' | 'snoozed' | 'preferences';

@Component({
  selector: 'lib-novu-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatBadgeModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  template: `
    <mat-toolbar>
      <span>{{ title() }}</span>
      <span class="toolbar-spacer"></span>

      @if (notifications.unreadCount() > 0) {
        <button mat-button type="button" (click)="markAllAsRead()">
          <mat-icon>done_all</mat-icon>
          Marcar lidas
        </button>
      }

      <button matIconButton type="button" [matMenuTriggerFor]="bulkMenu" aria-label="Mais ações">
        <mat-icon>more_vert</mat-icon>
      </button>
    </mat-toolbar>
    <section class="novu-inbox">
      @if (notifications.loadingConfig() || loading()) {
        <div class="loading-state">
          <mat-spinner diameter="36"></mat-spinner>
        </div>
      } @else if (!notifications.isConfigured()) {
        <mat-card appearance="outlined">
          <mat-card-content>
            <p>As notificações não foram configuradas para este ambiente.</p>
          </mat-card-content>
        </mat-card>
      } @else {
        @if (showPushBanner()) {
          <mat-card appearance="outlined" class="permission-card">
            <mat-card-content>
              <mat-icon>notifications_active</mat-icon>
              <span>Enviaremos apenas notificações importantes, como informações sobre o estado da sua inscrição.</span>
            </mat-card-content>
            <mat-card-actions align="end">
              <button mat-button type="button" (click)="dismissPushPermission()">Agora não</button>
              <button mat-flat-button type="button" (click)="requestPushPermission()">Permitir</button>
            </mat-card-actions>
          </mat-card>
        } @else if (notifications.notificationPermission() === 'denied') {
          <mat-card appearance="outlined" class="permission-card">
            <mat-card-content>
              <mat-icon>notifications_off</mat-icon>
              <span>As notificações do navegador estão bloqueadas.</span>
            </mat-card-content>
            <mat-card-actions align="end">
              <button mat-button type="button" (click)="requestPushPermission()">Gerenciar permissão</button>
            </mat-card-actions>
          </mat-card>
        }

        <mat-tab-group [selectedIndex]="selectedIndex()" (selectedIndexChange)="selectIndex($event)">
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>inbox</mat-icon>
              Todas
            </ng-template>
          </mat-tab>
          <mat-tab>
            <ng-template mat-tab-label>
              <span [matBadge]="notifications.unreadCount()" [matBadgeHidden]="notifications.unreadCount() === 0">
                <mat-icon>mark_email_unread</mat-icon>
              </span>
              Não lidas
            </ng-template>
          </mat-tab>
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>archive</mat-icon>
              Arquivadas
            </ng-template>
          </mat-tab>
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>schedule</mat-icon>
              Adiadas
            </ng-template>
          </mat-tab>
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>tune</mat-icon>
              Configurações
            </ng-template>
          </mat-tab>
        </mat-tab-group>

        @if (error()) {
          <p class="error-state">{{ error() }}</p>
        }

        @if (selectedTab() === 'preferences') {
          <mat-list>
            @for (preference of preferences(); track preference.workflow?.id ?? preference.level) {
              <mat-list-item>
                <mat-icon matListItemIcon>rule</mat-icon>
                <span matListItemTitle>{{ preference.workflow?.name ?? 'Preferências globais' }}</span>
                <span matListItemLine>{{ channelsLabel(preference) }}</span>
                <div matListItemMeta class="preference-actions">
                  <mat-slide-toggle
                    [checked]="preference.channels.in_app !== false"
                    (change)="updatePreferenceChannel(preference, 'in_app', $event.checked)">
                    In-app
                  </mat-slide-toggle>
                  <mat-slide-toggle
                    [checked]="preference.channels.push !== false"
                    (change)="updatePreferenceChannel(preference, 'push', $event.checked)">
                    Push
                  </mat-slide-toggle>
                </div>
              </mat-list-item>
            } @empty {
              <mat-list-item>
                <mat-icon matListItemIcon>tune</mat-icon>
                <span matListItemTitle>Nenhuma preferência disponível</span>
              </mat-list-item>
            }
          </mat-list>
        } @else {
          <mat-list>
            @for (notification of notificationList(); track notification.id) {
              <mat-list-item [class.unread]="!notification.isRead">
                @if (notification.avatar) {
                  <img matListItemAvatar [src]="notification.avatar" alt="" />
                } @else {
                  <mat-icon matListItemIcon>{{ notificationIcon(notification) }}</mat-icon>
                }

                <span matListItemTitle>{{ notification.subject || notification.workflow?.name || 'Notificação' }}</span>
                <span matListItemLine [innerHTML]="notificationBody(notification)"></span>
                <span matListItemLine>{{ notification.createdAt | date: 'dd/MM/yyyy HH:mm' }}</span>

                <div matListItemMeta class="notification-actions">
                  @if (notification.primaryAction) {
                    <button mat-button type="button" (click)="runPrimaryAction(notification)">
                      {{ notification.primaryAction.label }}
                    </button>
                  } @else if (notification.redirect?.url) {
                    <button mat-button type="button" (click)="openRedirect(notification)">Abrir</button>
                  }

                  <button matIconButton type="button" [matMenuTriggerFor]="notificationMenu" aria-label="Ações">
                    <mat-icon>more_vert</mat-icon>
                  </button>
                </div>

                <mat-menu #notificationMenu="matMenu">
                  @if (notification.isRead) {
                    <button mat-menu-item type="button" (click)="markAsUnread(notification)">
                      <mat-icon>mark_email_unread</mat-icon>
                      <span>Marcar como não lida</span>
                    </button>
                  } @else {
                    <button mat-menu-item type="button" (click)="markAsRead(notification)">
                      <mat-icon>drafts</mat-icon>
                      <span>Marcar como lida</span>
                    </button>
                  }

                  @if (notification.isArchived) {
                    <button mat-menu-item type="button" (click)="unarchive(notification)">
                      <mat-icon>unarchive</mat-icon>
                      <span>Desarquivar</span>
                    </button>
                  } @else {
                    <button mat-menu-item type="button" (click)="archive(notification)">
                      <mat-icon>archive</mat-icon>
                      <span>Arquivar</span>
                    </button>
                  }

                  @if (notification.isSnoozed) {
                    <button mat-menu-item type="button" (click)="unsnooze(notification)">
                      <mat-icon>notifications_active</mat-icon>
                      <span>Remover adiamento</span>
                    </button>
                  } @else {
                    <button mat-menu-item type="button" (click)="snooze(notification)">
                      <mat-icon>schedule</mat-icon>
                      <span>Adiar por 1 hora</span>
                    </button>
                  }

                  @if (notification.secondaryAction) {
                    <button mat-menu-item type="button" (click)="runSecondaryAction(notification)">
                      <mat-icon>task_alt</mat-icon>
                      <span>{{ notification.secondaryAction.label }}</span>
                    </button>
                  }

                  <button mat-menu-item type="button" (click)="delete(notification)">
                    <mat-icon>delete</mat-icon>
                    <span>Excluir</span>
                  </button>
                </mat-menu>
              </mat-list-item>
              <mat-divider></mat-divider>
            } @empty {
              <mat-list-item>
                <mat-icon matListItemIcon>notifications_none</mat-icon>
                <span matListItemTitle>Nenhuma notificação</span>
              </mat-list-item>
            }
          </mat-list>

          @if (hasMore()) {
            <div class="load-more">
              <button mat-button type="button" (click)="loadMore()">Carregar mais</button>
            </div>
          }
        }
      }

      <mat-menu #bulkMenu="matMenu">
        <button mat-menu-item type="button" (click)="archiveAllRead()">
          <mat-icon>inventory_2</mat-icon>
          <span>Arquivar lidas</span>
        </button>
        <button mat-menu-item type="button" (click)="reload()">
          <mat-icon>refresh</mat-icon>
          <span>Atualizar</span>
        </button>
      </mat-menu>
    </section>
  `,
  styles: `
    .novu-inbox {
      display: grid;
      gap: 16px;
      padding: 16px;
    }

    .toolbar-spacer {
      flex: 1;
    }
    .inbox-header,
    .header-actions,
    .notification-actions,
    .preference-actions,
    .load-more,
    .permission-card mat-card-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .inbox-header {
      justify-content: space-between;
    }

    .inbox-header h2,
    .inbox-header p {
      margin: 0;
    }

    .loading-state,
    .load-more {
      justify-content: center;
      padding: 24px;
    }

    .unread {
      background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
    }

    .error-state {
      color: var(--mat-sys-error);
    }
  `,
})
export class NovuInboxComponent {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly notifications = inject(NovuNotificationsService);

  readonly title = input('Notificações');

  protected readonly tabs: InboxTab[] = ['inbox', 'unread', 'archived', 'snoozed', 'preferences'];
  protected readonly selectedTab = signal<InboxTab>('inbox');
  protected readonly notificationList = signal<Notification[]>([]);
  protected readonly preferences = signal<Preference[]>([]);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedIndex = computed(() => this.tabs.indexOf(this.selectedTab()));
  protected readonly showPushBanner = computed(() => this.notifications.shouldOfferPushPermission());

  constructor() {
    this.notifications.ensureReady();

    effect(() => {
      if (!this.notifications.client()) {
        return;
      }

      void this.reload();
    });
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

  protected async markAllAsRead(): Promise<void> {
    await this.notifications.markAllAsRead();
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

  protected async snooze(notification: Notification): Promise<void> {
    await this.notifications.snooze(notification, new Date(Date.now() + 60 * 60 * 1000));
    await this.reload();
  }

  protected async unsnooze(notification: Notification): Promise<void> {
    await this.notifications.unsnooze(notification);
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
      case 'unread':
        return { read: false, archived: false };
      case 'archived':
        return { archived: true };
      case 'snoozed':
        return { snoozed: true, archived: false };
      default:
        return { archived: false };
    }
  }
}
