import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AGPL } from './agpl';

const meta: Meta<AGPL> = {
  component: AGPL,
  title: 'Public/Support/Legal/AGPL',
  tags: ['autodocs'],
  parameters: {
    controls: { disable: true },
    docs: { description: { component: 'Static AGPL license text for reading and reference.' } },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<AGPL>;

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
