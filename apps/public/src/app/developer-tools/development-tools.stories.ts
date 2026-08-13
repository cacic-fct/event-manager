import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { DevelopmentTools } from './development-tools';

const meta: Meta<DevelopmentTools> = {
  component: DevelopmentTools,
  title: 'CACiC Eventos/Developer Tools/Hub',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<DevelopmentTools>;

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

export const MobileNavigation: Story = {
  ...Playground,
  parameters: {
    ...Playground.parameters,
    viewport: { defaultViewport: 'mobile' },
  },
};

export const OfflineDarkReducedMotion: Story = {
  ...Playground,
  globals: { ...Playground.globals, theme: 'dark', network: 'offline', motion: 'reduced' },
};
