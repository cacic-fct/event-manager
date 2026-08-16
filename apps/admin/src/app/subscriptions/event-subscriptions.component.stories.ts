import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { EventSubscriptionsComponent } from './event-subscriptions.component';

const meta: Meta<EventSubscriptionsComponent> = {
  component: EventSubscriptionsComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Subscriptions/Workspace Event Subscriptions Subtab',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<EventSubscriptionsComponent>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByLabelText('Partida de torneio esportivo')).toBeVisible();
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
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DarkReducedMotion: Story = {
  ...Playground,
  globals: { ...Playground.globals, theme: 'dark', motion: 'reduced' },
};

export const CompactSubscriptionWorkbench: Story = {
  ...Playground,
  name: 'Bancada compacta de inscrições',
  parameters: { viewport: { defaultViewport: 'tablet' } },
};
