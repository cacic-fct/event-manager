import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { NovuNotificationBadgeComponent } from './novu-notification-badge.component';
import { NovuNotificationsService } from './novu-notifications.service';

type NovuNotificationBadgeStoryArgs = {
  unreadCount: number;
  overlap: boolean;
  icon: string;
};

class MockNovuBadgeNotificationsService {
  readonly unreadCount = signal(0);

  ensureReady(): void {
    return undefined;
  }
}

@Component({
  selector: 'lib-storybook-novu-notification-badge-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, NovuNotificationBadgeComponent],
  providers: [
    MockNovuBadgeNotificationsService,
    { provide: NovuNotificationsService, useExisting: MockNovuBadgeNotificationsService },
  ],
  template: `
    <lib-novu-notification-badge [overlap]="overlap()">
      <button mat-icon-button type="button" [attr.aria-label]="buttonLabel()">
        <mat-icon>{{ icon() }}</mat-icon>
      </button>
    </lib-novu-notification-badge>
  `,
})
class NovuNotificationBadgeStoryHostComponent {
  private readonly notifications = inject(MockNovuBadgeNotificationsService);

  readonly unreadCount = input(3);
  readonly overlap = input(true);
  readonly icon = input('notifications');
  readonly buttonLabel = computed(() => `${this.unreadCount()} notificações não lidas`);

  constructor() {
    effect(() => this.notifications.unreadCount.set(this.unreadCount()));
  }
}

const meta: Meta<NovuNotificationBadgeStoryArgs> = {
  component: NovuNotificationBadgeStoryHostComponent,
  title: 'CACiC Eventos/Shared/Notifications/Unread badge',
  tags: ['autodocs'],
  args: {
    unreadCount: 3,
    overlap: true,
    icon: 'notifications',
  },
  argTypes: {
    unreadCount: {
      control: { type: 'number', min: 0, max: 99, step: 1 },
      description: 'Quantidade de notificações ainda não lidas.',
    },
    overlap: { control: 'boolean', description: 'Sobrepõe o selo ao conteúdo projetado.' },
    icon: { control: 'text', description: 'Ícone Material usado pelo botão hospedeiro.' },
  },
  parameters: {
    layout: 'centered',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<NovuNotificationBadgeStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notificationsButton = canvas.getByRole('button', { name: /notificações não lidas/i });
    await expect(notificationsButton).toBeVisible();
    await userEvent.click(notificationsButton);
    await expect(notificationsButton).toHaveFocus();
  },
};

export const Empty: Story = {
  args: {
    unreadCount: 0,
  },
};

export const HighCount: Story = {
  args: {
    unreadCount: 42,
    overlap: false,
  },
};

export const DarkReducedMotion: Story = {
  args: {
    unreadCount: 7,
    overlap: true,
    icon: 'notifications_active',
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
