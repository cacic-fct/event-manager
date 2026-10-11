import { signal } from '@angular/core';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { expect, userEvent, within } from 'storybook/test';
import type { Notification } from '@novu/js';
import { NovuNotificationsService } from '@cacic-fct/shared-notifications-angular/service';
import { NotificationsPageComponent } from './notifications-page.component';

type StoryArgs = { count: number; configured: boolean; failActions: boolean };
let activeArgs: StoryArgs = { count: 3, configured: true, failActions: false };
type InboxFixture = Pick<Notification, 'id' | 'subject' | 'body' | 'createdAt' | 'isRead' | 'isArchived'>;
const items = signal<InboxFixture[]>([]);
const configured = signal(true);
const change = async (id: string | null, patch: Partial<InboxFixture>) => {
  if (activeArgs.failActions) throw new Error('Falha simulada');
  items.update((values) => values.map((item) => !id || item.id === id ? { ...item, ...patch } : item));
};
const meta: Meta<StoryArgs> = {
  component: NotificationsPageComponent,
  title: 'Admin/Notifications/Inbox',
  tags: ['autodocs'],
  args: activeArgs,
  argTypes: { count: { control: { type: 'range', min: 0, max: 20 } }, configured: { control: 'boolean' }, failActions: { control: 'boolean' } },
  decorators: [withScenarioControls<StoryArgs>(), applicationConfig({ providers: [{ provide: NovuNotificationsService, useValue: {
    client: signal({}), isConfigured: configured, loadingConfig: signal(false), notificationPermission: signal('granted'),
    ensureReady: () => undefined, shouldOfferPushPermission: () => false,
    listNotificationPage: async (filter: { read?: boolean; archived?: boolean }) => ({ notifications: items().filter((item) =>
      (filter.read === undefined || item.isRead === filter.read) && (filter.archived === undefined || item.isArchived === filter.archived)), hasMore: false }),
    listPreferences: async () => [],
    markAllAsRead: () => change(null, { isRead: true }),
    markAsRead: (item: InboxFixture) => change(item.id, { isRead: true }),
    markAsUnread: (item: InboxFixture) => change(item.id, { isRead: false }),
    archive: (item: InboxFixture) => change(item.id, { isArchived: true }),
    unarchive: (item: InboxFixture) => change(item.id, { isArchived: false }),
    archiveAllRead: async () => items.update((values) => values.map((item) => item.isRead ? { ...item, isArchived: true } : item)),
    delete: async (item: InboxFixture) => items.update((values) => values.filter((value) => value.id !== item.id)),
  } }] })],
  render: (args) => {
    activeArgs = args;
    configured.set(args.configured);
    items.set(Array.from({ length: args.count }, (_, index) => ({
      id: `notification-${index}`, subject: index === 0 ? 'Inscrições aguardando conferência' : 'Atualização de atividade',
      body: 'Consulte os registros do evento e acompanhe as pendências da equipe.',
      createdAt: new Date(Date.now() - index * 3_600_000).toISOString(), isRead: index > 0, isArchived: false,
    })));
    return { props: {} };
  },
  parameters: {
    docs: {
      description: {
        component: 'Admin notification inbox with controls for notification count, provider availability, and action failures.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};
export default meta;
type Story = StoryObj<StoryArgs>;
export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Não lidas' }));
    await expect(await canvas.findByText('Inscrições aguardando conferência')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Mais ações' }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('menuitem', { name: /Marcar todas como lidas/ }));
    await expect(await canvas.findByText('Nenhuma notificação')).toBeVisible();
  },
};
export const Empty: Story = { args: { count: 0 } };
export const Unavailable: Story = { args: { configured: false } };
export const ActionError: Story = { args: { failActions: true } };
