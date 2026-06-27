import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { NgswState } from './ngsw-state';

const meta: Meta<NgswState> = {
  component: NgswState,
  title: 'Public/Preferences/Service Worker/Ngsw State/Ngsw State',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<NgswState>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const ServiceWorkerReady: Story = {
  args: {},
  globals: { theme: 'light', network: 'online', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineInstalled: Story = {
  args: {},
  globals: { theme: 'light', network: 'offline', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoServiceWorker: Story = {
  args: {},
  globals: { theme: 'light', network: 'online', serviceWorker: 'disabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
