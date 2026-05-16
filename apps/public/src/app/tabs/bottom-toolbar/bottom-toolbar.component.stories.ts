import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { BottomToolbarComponent } from './bottom-toolbar.component';

const meta: Meta<BottomToolbarComponent> = {
  component: BottomToolbarComponent,
  title: 'Public/Tabs/Bottom Toolbar/Bottom Toolbar',
  tags: ['autodocs'],
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

export const DesktopLight: Story = {
  args: { items: [
    { label: 'Calendário', shortLabel: 'Calendário', icon: 'calendar_month', route: '/calendar' },
    { label: 'Eventos', shortLabel: 'Eventos', icon: 'event', route: '/major-event' },
    { label: 'Menu', shortLabel: 'Menu', icon: 'menu', route: '/menu' },
  ] },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MobileLight: Story = {
  args: { items: [
    { label: 'Calendário', shortLabel: 'Agenda', icon: 'calendar_month', route: '/calendar' },
    { label: 'Eventos', shortLabel: 'Eventos', icon: 'event', route: '/major-event' },
    { label: 'Menu', shortLabel: 'Menu', icon: 'menu', route: '/menu' },
  ] },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DesktopDark: Story = {
  args: { items: [
    { label: 'Calendário offline', shortLabel: 'Agenda', icon: 'cloud_off', route: '/calendar' },
    { label: 'Carteira', shortLabel: 'Carteira', icon: 'badge', route: '/wallet' },
    { label: 'Menu', shortLabel: 'Menu', icon: 'menu', route: '/menu' },
  ] },
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MobileDark: Story = {
  args: { items: [
    { label: 'Calendário', shortLabel: 'Agenda', icon: 'calendar_month', route: '/calendar' },
    { label: 'Eventos', shortLabel: 'Eventos', icon: 'event', route: '/major-event' },
    { label: 'Menu', shortLabel: 'Menu', icon: 'menu', route: '/menu' },
  ] },
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
