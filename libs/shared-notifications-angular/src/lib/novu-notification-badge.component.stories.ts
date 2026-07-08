import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
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
  title: 'Shared/Notifications/Novu Notification Badge',
  tags: ['autodocs'],
  args: {
    unreadCount: 3,
    overlap: true,
    icon: 'notifications',
  },
  argTypes: {
    unreadCount: { control: { type: 'number', min: 0, max: 99, step: 1 } },
    overlap: { control: 'boolean' },
    icon: { control: 'text' },
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
    await expect(canvas.getByRole('button', { name: /notificações não lidas/i })).toBeVisible();
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

