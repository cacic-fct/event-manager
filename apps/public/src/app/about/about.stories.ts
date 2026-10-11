import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { About } from './about';

const meta: Meta<About> = {
  component: About,
  title: 'Public/Support/About/Overview',
  tags: ['autodocs'],
  parameters: {
    controls: { disable: true },
    docs: { description: { component: 'Static about page with service status and project information.' } },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<About>;

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
  args: {},
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineInstalled: Story = {
  args: {},
  globals: { network: 'offline', serviceWorker: 'enabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoServiceWorker: Story = {
  args: {},
  globals: { network: 'online', serviceWorker: 'disabled' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
