import type { Meta, StoryObj } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { expect, userEvent, within } from 'storybook/test';
import { NgswState } from './ngsw-state';

const meta: Meta<NgswState> = {
  component: NgswState,
  title: 'Public/Settings/Service Worker/State',
  tags: ['autodocs'],
  decorators: [withScenarioControls()],
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        component: 'Service worker diagnostics shown under enabled, disabled, and offline globals.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<NgswState>;

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
