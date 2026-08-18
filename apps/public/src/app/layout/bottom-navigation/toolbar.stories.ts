import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { BottomToolbarComponent } from './toolbar';

const meta: Meta<BottomToolbarComponent> = {
  component: BottomToolbarComponent,
  title: 'CACiC Eventos/Layout/Bottom Navigation/Toolbar',
  tags: ['autodocs'],
  argTypes: {
    items: { control: 'object', name: 'Itens de navegação' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<BottomToolbarComponent>;

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
    items: [
      { label: 'Calendário', shortLabel: 'Agenda', icon: 'calendar_month', route: '/calendar', hidden: false },
      { label: 'Eventos', shortLabel: 'Eventos', icon: 'event', route: '/major-event', hidden: false },
      {
        label: 'Notificações',
        shortLabel: 'Avisos',
        icon: 'notifications',
        route: '/notifications',
        badge: 'notifications',
        hidden: false,
      },
      { label: 'Menu', shortLabel: 'Menu', icon: 'menu', route: '/menu', hidden: false },
    ],
  },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const LongLabelsDarkReducedMotion: Story = {
  args: {
    items: [
      {
        label: 'Calendário acadêmico e atividades complementares',
        shortLabel: 'Calendário',
        icon: 'calendar_month',
        route: '/calendar',
        hidden: false,
      },
      { label: 'Grandes eventos', shortLabel: 'Eventos', icon: 'event', route: '/major-event', hidden: false },
      { label: 'Menu', shortLabel: 'Menu', icon: 'menu', route: '/menu', hidden: false },
    ],
  },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MenuOnlyMobile: Story = {
  args: {
    items: [{ label: 'Menu', shortLabel: 'Menu', icon: 'menu', route: '/menu', hidden: false }],
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
