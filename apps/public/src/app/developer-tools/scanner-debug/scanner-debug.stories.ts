import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { ScannerFeedbackService } from '@cacic-fct/shared-angular';
import { ScannerDebug } from './scanner-debug';

const meta: Meta<ScannerDebug> = {
  component: ScannerDebug,
  title: 'CACiC Eventos/Developer Tools/Scanner Debug',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [ScannerFeedbackService],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<ScannerDebug>;

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

export const MobileScannerControls: Story = {
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
