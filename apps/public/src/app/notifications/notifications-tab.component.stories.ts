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
} from '@cacic-fct/shared-notifications-angular';
import { NotificationsTabComponent } from './notifications-tab.component';

faker.seed(20260616);

type MutableNotification = Notification & {
  isRead: boolean;
  isArchived: boolean;
};

type NotificationsTabStoryArgs = {
  permission: NotificationPermissionState;
  unreadCount: number;
  archivedCount: number;
  empty: boolean;
};

function notification(index: number, unreadCount: number): MutableNotification {
  return {
    id: `public-notification-${index + 1}`,
    transactionId: `public-transaction-${index + 1}`,
    subject: faker.helpers.arrayElement([
      'Inscrição confirmada',
      'Comprovante em análise',
      'Certificado disponível',
      'Presença registrada',
    ]),
    body: faker.lorem.sentence(),
    isRead: index >= unreadCount,
    isSeen: index >= unreadCount,
    isArchived: false,
    isSnoozed: false,
    createdAt: faker.date.recent({ days: 6 }).toISOString(),
    readAt: index >= unreadCount ? faker.date.recent({ days: 3 }).toISOString() : null,
    firstSeenAt: null,
    archivedAt: null,
    channelType: 'in_app',
    tags: ['storybook'],
    severity: index === 0 ? 'high' : 'medium',
    redirect: { url: '/profile/attendances', target: '_self' },
    workflow: {
      id: 'public-story-workflow',
      name: 'Atualizações do participante',
      identifier: 'public-story-workflow',
    },
    primaryAction: index % 2 === 0 ? { label: 'Ver detalhes', redirect: { url: '/profile/attendances' } } : undefined,
  } as unknown as MutableNotification;
}

class PublicNotificationsStoryService {
  private readonly configured = signal(true);
  private readonly notifications = signal<MutableNotification[]>([]);

  readonly loadingConfig = signal(false);
  readonly notificationPermission = signal<NotificationPermissionState>('default');
  readonly pushPermissionDismissed = signal(true);
  readonly unreadCount = signal(0);
  readonly lastError = signal<string | null>(null);
  readonly isConfigured = computed(() => this.configured());
  readonly client = computed(() => (this.configured() ? { storybook: true } : null));

  configure(args: NotificationsTabStoryArgs): void {
    faker.seed(20260616 + args.unreadCount + args.archivedCount);
    this.notificationPermission.set(args.permission);
    const active = args.empty ? [] : Array.from({ length: 5 }, (_, index) => notification(index, args.unreadCount));
    const archived = args.empty
      ? []
      : Array.from({ length: args.archivedCount }, (_, index) => {
          const item = notification(index + active.length, 0);
          item.isArchived = true;
          return item;
        });
    const items = [...active, ...archived];
    this.notifications.set(items);
    this.unreadCount.set(items.filter((item) => !item.isRead && !item.isArchived).length);
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

const notificationsService = new PublicNotificationsStoryService();

const meta: Meta<NotificationsTabStoryArgs> = {
  component: NotificationsTabComponent,
  title: 'Public/Tabs/Notifications/Notifications Tab',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [{ provide: NovuNotificationsService, useValue: notificationsService }],
    }),
  ],
  args: {
    permission: 'default',
    unreadCount: 2,
    archivedCount: 2,
    empty: false,
  },
  argTypes: {
    permission: { control: 'select', options: ['default', 'granted', 'denied', 'unsupported'] },
    unreadCount: { control: { type: 'range', min: 0, max: 5, step: 1 } },
    archivedCount: { control: { type: 'range', min: 0, max: 5, step: 1 } },
    empty: { control: 'boolean' },
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

type Story = StoryObj<NotificationsTabStoryArgs>;

async function exerciseStory(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await expect(await canvas.findByText('Notificações')).toBeVisible();
  await userEvent.click(await canvas.findByRole('tab', { name: /arquivadas/i }));
}

export const Playground: Story = {
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const Empty: Story = {
  args: {
    empty: true,
    unreadCount: 0,
    archivedCount: 0,
  },
};
