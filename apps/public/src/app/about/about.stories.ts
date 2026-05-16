import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { About } from './about';

const meta: Meta<About> = {
  component: About,
  title: 'Public/About/About',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<About>;

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
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light', network: 'online', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineInstalled: Story = {
  args: {},
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light', network: 'offline', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoServiceWorker: Story = {
  args: {},
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light', network: 'online', serviceWorker: 'disabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DarkInstalled: Story = {
  args: {},
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'dark', network: 'online', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
