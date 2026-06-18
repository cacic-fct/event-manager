import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { faker } from '@faker-js/faker';
import { http, HttpResponse } from 'msw';
import type {
  ChannelPreference,
  ListNotificationsResponse,
  Notification,
  Preference,
  Subscriber,
} from '@novu/js';
import { NovuInboxComponent } from './novu-inbox.component';
import { NotificationPermissionState, NovuListNotificationsArgs, NovuNotificationsService } from './novu-notifications.service';

type StoryPermission = NotificationPermissionState;

type StoryArgs = {
  title: string;
  configured: boolean;
  permission: StoryPermission;
  pushPromptDismissed: boolean;
  notificationCount: number;
  unreadCount: number;
  archivedCount: number;
  hasMore: boolean;
  showImages: boolean;
  richBodies: boolean;
  empty: boolean;
};

type MutableNotification = Notification & {
  isRead: boolean;
  isArchived: boolean;
};

type MutablePreference = Preference & {
  channels: ChannelPreference;
};

const subscriber: Subscriber = {
  subscriberId: 'storybook-user',
  email: 'storybook@example.com',
  firstName: 'Storybook',
  lastName: 'User',
};

function result<T>(data: T): Promise<{ data: T; error: undefined }> {
  return Promise.resolve({ data, error: undefined });
}

function createNotification(index: number, options: Pick<StoryArgs, 'showImages' | 'richBodies' | 'unreadCount'>): MutableNotification {
  const isUnread = index < options.unreadCount;
  const id = `notification-${index + 1}`;
  const subject = faker.helpers.arrayElement([
    'Inscrição confirmada',
    'Pagamento recebido',
    'Inscrição em análise',
    'Atualização da inscrição',
    'Documento pendente',
  ]);
  const body = options.richBodies
    ? `<strong>${faker.company.name()}</strong> ${faker.lorem.sentence()} <em>${faker.lorem.words(3)}</em>.`
    : faker.lorem.sentence();
  const notification = {
    id,
    transactionId: `transaction-${id}`,
    subject,
    body,
    to: subscriber,
    isRead: !isUnread,
    isSeen: !isUnread,
    isArchived: false,
    isSnoozed: false,
    createdAt: faker.date.recent({ days: 8 }).toISOString(),
    readAt: isUnread ? null : faker.date.recent({ days: 4 }).toISOString(),
    firstSeenAt: isUnread ? null : faker.date.recent({ days: 4 }).toISOString(),
    archivedAt: null,
    avatar: options.showImages && index % 3 === 0 ? faker.image.avatar() : undefined,
    channelType: 'in_app',
    tags: ['major-event-subscription'],
    redirect: {
      url: `/profile/attendances/major-${index + 1}`,
      target: '_self',
    },
    primaryAction: index % 2 === 0 ? { label: 'Ver inscrição', redirect: { url: `/profile/attendances/major-${index + 1}` } } : undefined,
    secondaryAction: index % 4 === 0 ? { label: 'Ver evento' } : undefined,
    workflow: {
      id: 'major-event-subscription-status-changed',
      name: 'Estado da inscrição',
      identifier: 'major-event-subscription-status-changed',
    },
    severity: index % 5 === 0 ? 'high' : 'medium',
    read: async () => {
      notification.isRead = true;
      return result(notification);
    },
    unread: async () => {
      notification.isRead = false;
      return result(notification);
    },
    archive: async () => {
      notification.isArchived = true;
      return result(notification);
    },
    unarchive: async () => {
      notification.isArchived = false;
      return result(notification);
    },
    delete: async () => result(undefined),
    seen: async () => result(notification),
    snooze: async () => result(notification),
    unsnooze: async () => result(notification),
    completePrimary: async () => result(notification),
    completeSecondary: async () => result(notification),
    revertPrimary: async () => result(notification),
    revertSecondary: async () => result(notification),
    on: () => () => undefined,
    off: () => undefined,
  } as unknown as MutableNotification;

  return notification;
}

function createPreference(index: number): MutablePreference {
  const preference = {
    level: index === 0 ? 'global' : 'template',
    enabled: true,
    channels: {
      in_app: true,
      push: index !== 2,
      email: index === 1,
    },
    workflow:
      index === 0
        ? undefined
        : {
            id: `workflow-${index}`,
            name: faker.helpers.arrayElement(['Inscrições', 'Pagamentos', 'Certificados']),
            identifier: `workflow-${index}`,
          },
    update: async ({ channels }: { channels: ChannelPreference }) => {
      preference.channels = channels;
      return result(preference);
    },
  } as unknown as MutablePreference;

  return preference;
}

class MockNovuNotificationsService {
  private readonly configured = signal(true);
  private readonly notifications = signal<MutableNotification[]>([]);
  private readonly preferences = signal<MutablePreference[]>([0, 1, 2].map((index) => createPreference(index)));
  private readonly moreAvailable = signal(false);

  readonly loadingConfig = signal(false);
  readonly notificationPermission = signal<StoryPermission>('default');
  readonly pushPermissionDismissed = signal(false);
  readonly unreadCount = signal(0);
  readonly lastError = signal<string | null>(null);
  readonly isConfigured = computed(() => this.configured());
  readonly client = computed(() => (this.configured() ? { storybook: true } : null));

  configure(args: StoryArgs): void {
    faker.seed(20260518 + args.notificationCount + args.archivedCount + args.unreadCount);
    this.configured.set(args.configured);
    this.notificationPermission.set(args.permission);
    this.pushPermissionDismissed.set(args.pushPromptDismissed);
    this.moreAvailable.set(args.hasMore);

    const activeNotifications = args.empty
      ? []
      : Array.from({ length: args.notificationCount }, (_, index) => createNotification(index, args));
    const archivedNotifications = args.empty
      ? []
      : Array.from({ length: args.archivedCount }, (_, index) => {
          const notification = createNotification(index + args.notificationCount, { ...args, unreadCount: 0 });
          notification.isArchived = true;
          return notification;
        });
    const nextNotifications = [...activeNotifications, ...archivedNotifications];

    this.notifications.set(nextNotifications);
    this.unreadCount.set(nextNotifications.filter((notification) => !notification.isRead && !notification.isArchived).length);
    this.preferences.set([0, 1, 2].map((index) => createPreference(index)));
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

  async requestPushPermission(): Promise<StoryPermission> {
    this.notificationPermission.set('granted');
    return 'granted';
  }

  async listNotificationPage(args: NovuListNotificationsArgs = {}): Promise<ListNotificationsResponse> {
    const filtered = this.notifications().filter((notification) => {
      if (args.archived !== undefined && notification.isArchived !== args.archived) {
        return false;
      }
      if (args.read !== undefined && notification.isRead !== args.read) {
        return false;
      }
      return true;
    });

    return {
      notifications: filtered,
      hasMore: this.moreAvailable(),
      filter: {},
    };
  }

  async loadMoreNotifications(): Promise<{ notifications: Notification[]; hasMore: boolean }> {
    const notifications = Array.from({ length: 3 }, (_, index) =>
      createNotification(index + this.notifications().length, {
        showImages: true,
        richBodies: true,
        unreadCount: 0,
      } as StoryArgs),
    );
    this.notifications.update((current) => [...current, ...notifications]);
    this.moreAvailable.set(false);
    return { notifications, hasMore: false };
  }

  async listPreferences(): Promise<Preference[]> {
    return this.preferences();
  }

  async updatePreferenceChannels(preference: MutablePreference, channels: ChannelPreference): Promise<void> {
    preference.channels = channels;
  }

  async markAsRead(notification: MutableNotification): Promise<void> {
    notification.isRead = true;
    this.refreshUnreadCount();
  }

  async markAsUnread(notification: MutableNotification): Promise<void> {
    notification.isRead = false;
    this.refreshUnreadCount();
  }

  async markAllAsRead(): Promise<void> {
    this.notifications.update((notifications) =>
      notifications.map((notification) => {
        notification.isRead = true;
        return notification;
      }),
    );
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
    this.notifications.update((notifications) =>
      notifications.map((notification) => {
        if (notification.isRead) {
          notification.isArchived = true;
        }
        return notification;
      }),
    );
  }

  async delete(notification: MutableNotification): Promise<void> {
    this.notifications.update((notifications) => notifications.filter((item) => item.id !== notification.id));
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
    this.unreadCount.set(this.notifications().filter((notification) => !notification.isRead && !notification.isArchived).length);
  }
}

@Component({
  selector: 'lib-storybook-novu-inbox-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NovuInboxComponent],
  providers: [MockNovuNotificationsService, { provide: NovuNotificationsService, useExisting: MockNovuNotificationsService }],
  template: `<lib-novu-inbox [title]="title()" />`,
})
class NovuInboxStoryHostComponent {
  private readonly notifications = inject(MockNovuNotificationsService);

  readonly title = input('Notificações');
  readonly configured = input(true);
  readonly permission = input<StoryPermission>('default');
  readonly pushPromptDismissed = input(false);
  readonly notificationCount = input(8);
  readonly unreadCount = input(3);
  readonly archivedCount = input(2);
  readonly hasMore = input(false);
  readonly showImages = input(true);
  readonly richBodies = input(true);
  readonly empty = input(false);

  constructor() {
    effect(() => {
      this.notifications.configure({
        title: this.title(),
        configured: this.configured(),
        permission: this.permission(),
        pushPromptDismissed: this.pushPromptDismissed(),
        notificationCount: this.notificationCount(),
        unreadCount: this.unreadCount(),
        archivedCount: this.archivedCount(),
        hasMore: this.hasMore(),
        showImages: this.showImages(),
        richBodies: this.richBodies(),
        empty: this.empty(),
      });
    });
  }
}

const meta: Meta<NovuInboxStoryHostComponent> = {
  component: NovuInboxStoryHostComponent,
  title: 'Shared/Notifications/Novu Inbox',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        http.all('https://notifications.cacic.dev.br/api/*', () => HttpResponse.json({ storybook: true })),
        http.all('https://notifications.cacic.dev.br/*', () => HttpResponse.json({ storybook: true })),
      ],
    },
  },
  argTypes: {
    title: { control: 'text' },
    configured: { control: 'boolean' },
    permission: { control: 'select', options: ['default', 'granted', 'denied', 'unsupported'] },
    pushPromptDismissed: { control: 'boolean' },
    notificationCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    unreadCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    archivedCount: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    hasMore: { control: 'boolean' },
    showImages: { control: 'boolean' },
    richBodies: { control: 'boolean' },
    empty: { control: 'boolean' },
  },
};

export default meta;

type Story = StoryObj<NovuInboxStoryHostComponent>;

const defaultArgs: StoryArgs = {
  title: 'Notificações',
  configured: true,
  permission: 'default',
  pushPromptDismissed: false,
  notificationCount: 8,
  unreadCount: 3,
  archivedCount: 2,
  hasMore: true,
  showImages: true,
  richBodies: true,
  empty: false,
};

async function exerciseStory(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await expect(await canvas.findByText('Notificações')).toBeVisible();
  const tabs = await canvas.findAllByRole('tab');
  await expect(tabs[0]).toBeVisible();
  await userEvent.click(tabs[1]);
  await expect(await canvas.findByText('Arquivadas')).toBeVisible();
}

export const Default: Story = {
  args: defaultArgs,
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const PermissionDenied: Story = {
  args: {
    ...defaultArgs,
    permission: 'denied',
    pushPromptDismissed: true,
  },
};

export const Empty: Story = {
  args: {
    ...defaultArgs,
    empty: true,
    hasMore: false,
  },
};
