import { computed, signal } from '@angular/core';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { ListNotificationsResponse, Notification, Preference } from '@novu/js';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  NotificationPermissionState,
  NovuListNotificationsArgs,
  NovuNotificationsService,
} from '@cacic-fct/shared-notifications-angular/service';
import { NotificationsPageComponent } from './notifications-page.component';

faker.seed(20260616);

type MutableNotification = Notification & {
  isRead: boolean;
  isArchived: boolean;
};

type WorkspaceNotificationsStoryArgs = {
  permission: NotificationPermissionState;
  notificationCount: number;
  unreadCount: number;
  loadState: 'ready' | 'loading' | 'error';
  archivedEvery: number;
  actionEvery: number;
  longContent: boolean;
};

function notification(index: number, args: WorkspaceNotificationsStoryArgs): MutableNotification {
  return {
    id: `workspace-notification-${index + 1}`,
    transactionId: `workspace-transaction-${index + 1}`,
    subject: `${faker.helpers.arrayElement([
      'Comprovante aguardando validação',
      'Certificados reemitidos',
      'Pessoa duplicada detectada',
      'Inscrições importadas',
    ])}${args.longContent ? ` · ${faker.company.catchPhrase()}` : ''}`,
    body: args.longContent ? faker.lorem.paragraphs(2) : faker.lorem.sentence(),
    isRead: index >= args.unreadCount,
    isSeen: index >= args.unreadCount,
    isArchived: args.archivedEvery > 0 && (index + 1) % Math.round(args.archivedEvery) === 0,
    isSnoozed: false,
    createdAt: faker.date.recent({ days: 4 }).toISOString(),
    readAt: index >= args.unreadCount ? faker.date.recent({ days: 2 }).toISOString() : null,
    firstSeenAt: null,
    archivedAt: null,
    channelType: 'in_app',
    tags: ['workspace'],
    severity: index === 0 ? 'high' : 'medium',
    redirect: { url: '/admin/subscriptions', target: '_self' },
    workflow: {
      id: 'workspace-story-workflow',
      name: 'Operações do workspace',
      identifier: 'workspace-story-workflow',
    },
    primaryAction:
      args.actionEvery > 0 && (index + 1) % Math.round(args.actionEvery) === 0
        ? { label: 'Abrir item', redirect: { url: '/admin/subscriptions' } }
        : undefined,
  } as unknown as MutableNotification;
}

class WorkspaceNotificationsStoryService {
  private readonly notifications = signal<MutableNotification[]>([]);
  private loadState: WorkspaceNotificationsStoryArgs['loadState'] = 'ready';

  readonly loadingConfig = signal(false);
  readonly notificationPermission = signal<NotificationPermissionState>('default');
  readonly pushPermissionDismissed = signal(true);
  readonly unreadCount = signal(0);
  readonly lastError = signal<string | null>(null);
  readonly isConfigured = computed(() => true);
  readonly client = computed(() => ({ storybook: true }));

  configure(args: WorkspaceNotificationsStoryArgs): void {
    faker.seed(20260620 + args.notificationCount + args.unreadCount);
    this.loadState = args.loadState;
    this.loadingConfig.set(args.loadState === 'loading');
    this.lastError.set(args.loadState === 'error' ? 'Não foi possível carregar as notificações.' : null);
    this.notificationPermission.set(args.permission);
    const items = Array.from({ length: Math.max(0, Math.min(50, args.notificationCount)) }, (_, index) =>
      notification(index, args),
    );
    this.notifications.set(items);
    this.unreadCount.set(items.filter((item) => !item.isRead).length);
  }

  ensureReady(): void {
    return undefined;
  }

  shouldOfferPushPermission(): boolean {
    return this.notificationPermission() === 'default' && !this.pushPermissionDismissed();
  }

  setPushPermissionDismissed(): void {
    this.pushPermissionDismissed.set(true);
  }

  async requestPushPermission(): Promise<NotificationPermissionState> {
    this.notificationPermission.set('granted');
    return 'granted';
  }

  async listNotificationPage(args: NovuListNotificationsArgs = {}): Promise<ListNotificationsResponse> {
    if (this.loadState === 'loading') return new Promise(() => undefined);
    if (this.loadState === 'error') throw new Error('Não foi possível carregar as notificações.');
    return {
      notifications: this.notifications().filter((item) => item.isArchived === Boolean(args.archived)),
      hasMore: false,
      filter: {},
    };
  }

  async loadMoreNotifications(): Promise<{ notifications: Notification[]; hasMore: boolean }> {
    return { notifications: [], hasMore: false };
  }

  async listPreferences(): Promise<Preference[]> {
    return [];
  }

  async updatePreferenceChannels(): Promise<void> {
    return undefined;
  }

  async markAsRead(notification: MutableNotification): Promise<void> {
    notification.isRead = true;
    this.refreshUnreadCount();
  }

  async markAsUnread(notification: MutableNotification): Promise<void> {
    notification.isRead = false;
    this.refreshUnreadCount();
  }

  async archive(notification: MutableNotification): Promise<void> {
    notification.isArchived = true;
    this.refreshUnreadCount();
  }

  async unarchive(notification: MutableNotification): Promise<void> {
    notification.isArchived = false;
    this.refreshUnreadCount();
  }

  async archiveAllRead(): Promise<void> {
    this.notifications.update((items) =>
      items.map((item) => {
        if (item.isRead) {
          item.isArchived = true;
        }
        return item;
      }),
    );
  }

  async delete(notification: MutableNotification): Promise<void> {
    this.notifications.update((items) => items.filter((item) => item.id !== notification.id));
    this.refreshUnreadCount();
  }

  async completePrimary(notification: MutableNotification): Promise<void> {
    notification.isRead = true;
    this.refreshUnreadCount();
  }

  async completeSecondary(notification: MutableNotification): Promise<void> {
    notification.isRead = true;
    this.refreshUnreadCount();
  }

  private refreshUnreadCount(): void {
    this.unreadCount.set(this.notifications().filter((item) => !item.isRead && !item.isArchived).length);
  }
}

const notificationsService = new WorkspaceNotificationsStoryService();

const meta: Meta<WorkspaceNotificationsStoryArgs> = {
  component: NotificationsPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Notifications/Workspace Notifications Tab',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [{ provide: NovuNotificationsService, useValue: notificationsService }],
    }),
  ],
  args: {
    permission: 'default',
    notificationCount: 6,
    unreadCount: 3,
    loadState: 'ready',
    archivedEvery: 0,
    actionEvery: 2,
    longContent: false,
  },
  argTypes: {
    permission: { control: 'select', options: ['default', 'granted', 'denied', 'unsupported'] },
    notificationCount: { control: { type: 'range', min: 0, max: 50, step: 1 } },
    unreadCount: { control: { type: 'range', min: 0, max: 50, step: 1 } },
    loadState: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    archivedEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    actionEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    longContent: { control: 'boolean' },
  },
  render: (args) => {
    notificationsService.configure(args);
    return { props: args };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<WorkspaceNotificationsStoryArgs>;

async function exerciseStory(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole('tab', { name: /todas/i })).toBeVisible();
  await userEvent.click(await canvas.findByRole('tab', { name: /configurações/i }));
}

export const Playground: Story = {
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const Empty: Story = {
  args: {
    notificationCount: 0,
    unreadCount: 0,
  },
};

export const DarkReducedMotion: Story = {
  ...Empty,
  globals: { theme: 'dark', motion: 'reduced' },
};

export const DenseInbox: Story = {
  args: { notificationCount: 50, unreadCount: 32, archivedEvery: 5, actionEvery: 3 },
};

export const AllRead: Story = {
  args: { notificationCount: 20, unreadCount: 0 },
};

export const AllUnread: Story = {
  args: { notificationCount: 20, unreadCount: 20 },
};

export const Loading: Story = {
  args: { loadState: 'loading' },
};

export const LoadError: Story = {
  args: { loadState: 'error' },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const LongContentMobile: Story = {
  args: { notificationCount: 18, unreadCount: 10, longContent: true, actionEvery: 2 },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
