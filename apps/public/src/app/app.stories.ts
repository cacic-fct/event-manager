import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { App } from './app';

const meta: Meta<App> = {
  component: App,
  title: 'Public/Layout/App Shell',
  tags: ['autodocs'],
  argTypes: {
    cookieBannerEnabledOverride: { control: 'boolean', name: 'Cookie Banner Enabled' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<App>;

const exerciseStory = async (canvasElement: HTMLElement, cookieBannerEnabled: boolean) => {
  const canvas = within(canvasElement);
  if (cookieBannerEnabled) {
    const acceptButton = await canvas.findByRole('button', { name: /aceitar cookies/i });
    await waitFor(() => expect(acceptButton).toBeVisible());
  }
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
    cookieBannerEnabledOverride: true,
  },
  play: async ({ args, canvasElement }) => exerciseStory(canvasElement, args.cookieBannerEnabledOverride === true),
};

export const CookieBannerDisabled: Story = {
  args: {
    cookieBannerEnabledOverride: false,
  },
  play: async ({ args, canvasElement }) => exerciseStory(canvasElement, args.cookieBannerEnabledOverride === true),
};
