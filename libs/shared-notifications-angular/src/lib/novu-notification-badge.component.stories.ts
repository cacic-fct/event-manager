import { Component, computed, effect, inject, input, signal } from '@angular/core';
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
  title: 'Shared/Notifications/Unread Badge',
  tags: ['autodocs'],
  args: {
    unreadCount: 3,
    overlap: true,
    icon: 'notifications',
  },
  argTypes: {
    unreadCount: {
      control: { type: 'number', min: 0, max: 99, step: 1 },
      description: 'Number of notifications that are still unread.',
    },
    overlap: { control: 'boolean', description: 'Overlap the badge with the projected content.' },
    icon: { control: 'text', description: 'Material icon used by the host button.' },
  },
  parameters: {
    layout: 'centered',
    a11y: { test: 'error' },
    docs: {
      description: {
        component:
          'A local notification service mock supplies the unread count. Use the controls to review empty and high-count badge states.',
      },
    },
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
