import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { App } from './app';

const meta: Meta<App> = {
  component: App,
  title: 'Public/App',
  tags: ['autodocs'],
  argTypes: {
    cookieBannerEnabledOverride: { control: 'boolean', name: 'Banner de cookies habilitado' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<App>;

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

export const Playground: Story = {
  args: {
    cookieBannerEnabledOverride: true,
  },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
