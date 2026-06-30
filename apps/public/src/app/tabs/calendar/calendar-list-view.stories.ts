import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CalendarListView } from './calendar-list-view';
import { createCalendarStoryEvents } from './calendar-story-fixtures';

const meta: Meta<CalendarListView> = {
  component: CalendarListView,
  title: 'Public/Tabs/Calendar/Calendar List View',
  tags: ['autodocs'],
  argTypes: {
    events: { control: false },
    canLoadOlder: { control: 'boolean' },
    isLoadingOlder: { control: 'boolean' },
    returnUrl: { control: 'text' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarListView>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const loadOlderButton = await canvas.findByRole('button', { name: /Mostrar eventos mais antigos|Carregando/ });
  await userEvent.hover(loadOlderButton);
  await expect(loadOlderButton).toBeVisible();
  await expect(await canvas.findByRole('link', { name: /Abrir evento Arquitetura Angular com Signals/ })).toBeVisible();
  await expect(await canvas.findByText('Acessibilidade em produtos digitais')).toBeVisible();
};

export const Online: Story = {
  args: { events: createCalendarStoryEvents(), canLoadOlder: true, isLoadingOlder: false, returnUrl: '/calendar' },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const LoadingOlder: Story = {
  args: { events: createCalendarStoryEvents(), canLoadOlder: true, isLoadingOlder: true, returnUrl: '/calendar' },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: /Carregando/ })).toBeDisabled();
  },
};

export const OfflineFallback: Story = {
  args: { events: [], canLoadOlder: false, isLoadingOlder: false, returnUrl: '/calendar' },
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Nenhum evento encontrado.')).toBeVisible();
  },
};
