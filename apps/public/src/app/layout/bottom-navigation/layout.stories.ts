import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { ToolbarLayoutComponent } from './layout';

const meta: Meta<ToolbarLayoutComponent> = {
  component: ToolbarLayoutComponent,
  title: 'CACiC Eventos/Layout/Bottom Navigation/Layout',
  tags: ['autodocs'],
  argTypes: {
    calendarTabEnabledOverride: { control: 'boolean', name: 'Aba de calendário habilitada' },
    majorEventTabEnabledOverride: { control: 'boolean', name: 'Aba de eventos habilitada' },
    notificationsTabEnabledOverride: { control: 'boolean', name: 'Aba de notificações habilitada' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<ToolbarLayoutComponent>;

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
  args: {
    calendarTabEnabledOverride: true,
    majorEventTabEnabledOverride: true,
    notificationsTabEnabledOverride: true,
  },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const EssentialTabsDarkReducedMotion: Story = {
  args: {
    calendarTabEnabledOverride: true,
    majorEventTabEnabledOverride: false,
    notificationsTabEnabledOverride: false,
  },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MenuOnlyMobile: Story = {
  args: {
    calendarTabEnabledOverride: false,
    majorEventTabEnabledOverride: false,
    notificationsTabEnabledOverride: false,
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
