import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { http, HttpResponse } from 'msw';
import type { ChannelPreference, ListNotificationsResponse, Notification, Preference, Subscriber } from '@novu/js';
import { NovuInboxComponent } from './novu-inbox.component';
import {
  NotificationPermissionState,
  NovuListNotificationsArgs,
  NovuNotificationsService,
} from './novu-notifications.service';

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

function createNotification(
  index: number,
  options: Pick<StoryArgs, 'showImages' | 'richBodies' | 'unreadCount'>,
): MutableNotification {
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
    primaryAction:
      index % 2 === 0
        ? { label: 'Ver inscrição', redirect: { url: `/profile/attendances/major-${index + 1}` } }
        : undefined,
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

const preferenceWorkflows = [
  { identifier: 'prize-draw-undone', name: 'Sorteio desfeito' },
  { identifier: 'audience-invitation', name: 'Convite para atividade' },
  { identifier: 'certificate-available', name: 'Certificado disponível' },
  { identifier: 'offline-attendance-review-queued', name: 'Revisão de presença off-line' },
  { identifier: 'event-form-available', name: 'Formulário disponível' },
  { identifier: 'ticket-transfer', name: 'Transferência de bilhete' },
  { identifier: 'online-attendance-available', name: 'Presença on-line disponível' },
  { identifier: 'major-event-subscription-status-changed', name: 'Inscrição em grande evento' },
  { identifier: 'event-subscriber-information', name: 'Informações do evento' },
  { identifier: 'prize-draw-winner', name: 'Resultado de sorteio' },
];

function createPreference(index: number): MutablePreference {
  const workflow = preferenceWorkflows[index - 1];
  const preference = {
    level: workflow ? 'template' : 'global',
    enabled: true,
    channels: { in_app: true, push: index !== 5 },
    workflow: workflow ? { ...workflow, id: workflow.identifier, critical: false } : undefined,
    update: async ({ channels }: { channels: ChannelPreference }) => {
      preference.channels = channels;
      return result(preference);
    },
  } as unknown as MutablePreference;

  return preference;
}

function createPreferences(): MutablePreference[] {
  return Array.from({ length: preferenceWorkflows.length + 1 }, (_, index) => createPreference(index));
}

class MockNovuNotificationsService {
  private readonly configured = signal(true);
  private readonly notifications = signal<MutableNotification[]>([]);
  private readonly preferences = signal<MutablePreference[]>(createPreferences());
  private readonly moreAvailable = signal(false);
  private readonly scenarioVersion = signal(0);

  readonly loadingConfig = signal(false);
  readonly notificationPermission = signal<StoryPermission>('default');
  readonly pushPermissionDismissed = signal(false);
  readonly unreadCount = signal(0);
  readonly lastError = signal<string | null>(null);
  readonly isConfigured = computed(() => this.configured());
  readonly client = computed(() =>
    this.configured() ? { storybook: true, scenarioVersion: this.scenarioVersion() } : null,
  );

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
    this.unreadCount.set(
      nextNotifications.filter((notification) => !notification.isRead && !notification.isArchived).length,
    );
    this.preferences.set(createPreferences());
    this.scenarioVersion.update((version) => version + 1);
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
    this.unreadCount.set(
      this.notifications().filter((notification) => !notification.isRead && !notification.isArchived).length,
    );
  }
}

@Component({
  selector: 'lib-storybook-novu-inbox-host',
  imports: [NovuInboxComponent],
  providers: [
    MockNovuNotificationsService,
    { provide: NovuNotificationsService, useExisting: MockNovuNotificationsService },
  ],
  template: `<lib-novu-inbox [title]="title()" [markReadOnOpen]="!adminMode()" [showUnreadFilter]="adminMode()" />`,
})
class NovuInboxStoryHostComponent {
  private readonly notifications = inject(MockNovuNotificationsService);

  readonly title = input('Notificações');
  readonly adminMode = input(false);
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
  title: 'Shared/Notifications/Inbox',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              pathFromRoot: [{ url: [{ path: 'storybook-notifications' }] }],
            },
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A local Novu service mock supplies notifications and preference mutations. Changing a control reloads the inbox data; no live notification account is used.',
      },
    },
    msw: {
      handlers: {
        rest: [
          http.all('https://notifications.cacic.com.br/api/*', () => HttpResponse.json({ storybook: true })),
          http.all('https://notifications.cacic.com.br/*', () => HttpResponse.json({ storybook: true })),
        ],
      },
    },
  },
  argTypes: {
    adminMode: { control: 'boolean', description: 'Show the unread filter used by the administrative view.' },
    title: { control: 'text', description: 'Title shown in the notification inbox toolbar.' },
    configured: { control: 'boolean', description: 'Simulate whether the Novu client is available.' },
    permission: {
      control: {
        type: 'select',
        labels: {
          default: 'Default',
          granted: 'Granted',
          denied: 'Denied',
          unsupported: 'Unsupported',
        },
      },
      options: ['default', 'granted', 'denied', 'unsupported'],
      description: 'Simulated browser push permission state.',
    },
    pushPromptDismissed: { control: 'boolean', description: 'Hide the push permission prompt.' },
    notificationCount: {
      control: { type: 'range', min: 0, max: 20, step: 1 },
      description: 'Number of active notifications to generate.',
    },
    unreadCount: {
      control: { type: 'range', min: 0, max: 20, step: 1 },
      description: 'Number of active notifications that start unread.',
    },
    archivedCount: {
      control: { type: 'range', min: 0, max: 10, step: 1 },
      description: 'Number of archived notifications to generate.',
    },
    hasMore: { control: 'boolean', description: 'Show a next page with additional notifications.' },
    showImages: { control: 'boolean', description: 'Include generated avatar images.' },
    richBodies: { control: 'boolean', description: 'Include formatted HTML in notification bodies.' },
    empty: { control: 'boolean', description: 'Return an empty notification and archive list.' },
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
  await expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
}

export const Playground: Story = {
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

export const DenseInbox: Story = {
  args: {
    ...defaultArgs,
    permission: 'granted',
    pushPromptDismissed: true,
    notificationCount: 20,
    unreadCount: 12,
    archivedCount: 8,
    hasMore: true,
  },
};

export const AdminUnreadReview: Story = {
  args: { ...defaultArgs, adminMode: true, pushPromptDismissed: true, permission: 'granted', showImages: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Não lidas' }));
    await expect(canvas.getByRole('tab', { name: 'Não lidas' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Mais ações' }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('menuitem', { name: /Marcar todas como lidas/ }));
    await expect(await canvas.findByText('Nenhuma notificação')).toBeVisible();
  },
};

export const Preferences: Story = {
  args: { ...defaultArgs, permission: 'granted', pushPromptDismissed: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Configurações' }));
    await expect(canvas.queryByRole('region', { name: 'Notificações obrigatórias' })).toBeNull();
    await expect(canvas.queryByText('Convites para eventos')).toBeNull();
    await expect(canvas.queryByText('Revisão de presenças offline')).toBeNull();
    const certificate = await canvas.findByRole('switch', { name: 'Certificados: no navegador' });
    await expect(certificate).toBeChecked();
    await userEvent.click(certificate);
    await expect(certificate).not.toBeChecked();
    await expect(certificate).toBeEnabled();
    const globalPush = canvas.getByRole('switch', { name: 'Avisos opcionais: no navegador' });
    await userEvent.click(globalPush);
    await expect(globalPush).not.toBeChecked();
    await expect(certificate).toBeDisabled();
    await userEvent.click(globalPush);
    await expect(certificate).toBeEnabled();
    await expect(certificate).not.toBeChecked();
  },
};
