import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { ToolbarLayoutComponent } from './layout';

const meta: Meta<ToolbarLayoutComponent> = {
  component: ToolbarLayoutComponent,
  title: 'Public/Layout/Navigation/Bottom Navigation',
  tags: ['autodocs'],
  argTypes: {
    calendarTabEnabledOverride: { control: 'boolean', name: 'Calendar Tab Enabled' },
    majorEventTabEnabledOverride: { control: 'boolean', name: 'Major Events Tab Enabled' },
    notificationsTabEnabledOverride: { control: 'boolean', name: 'Notifications Tab Enabled' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<ToolbarLayoutComponent>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find(
    (button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true',
  );
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const Playground: Story = {
  args: {
    calendarTabEnabledOverride: true,
    majorEventTabEnabledOverride: true,
    notificationsTabEnabledOverride: true,
  },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const EssentialTabs: Story = {
  args: {
    calendarTabEnabledOverride: true,
    majorEventTabEnabledOverride: false,
    notificationsTabEnabledOverride: false,
  },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MenuOnly: Story = {
  args: {
    calendarTabEnabledOverride: false,
    majorEventTabEnabledOverride: false,
    notificationsTabEnabledOverride: false,
  },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
