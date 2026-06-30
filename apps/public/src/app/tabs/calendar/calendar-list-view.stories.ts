import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CalendarListView } from './calendar-list-view';
import {
  CalendarStoryEventControls,
  calendarStoryEventControlArgTypes,
  calendarStoryEventDefaultControls,
  createCalendarStoryEvents,
} from './calendar-story-fixtures';

type CalendarListViewStoryArgs = CalendarStoryEventControls & {
  canLoadOlder: boolean;
  isLoadingOlder: boolean;
  returnUrl: string;
};

const meta: Meta<CalendarListViewStoryArgs> = {
  component: CalendarListView,
  title: 'Public/Tabs/Calendar/Calendar List View',
  tags: ['autodocs'],
  args: {
    ...calendarStoryEventDefaultControls,
    canLoadOlder: true,
    isLoadingOlder: false,
    returnUrl: '/calendar',
  },
  argTypes: {
    ...calendarStoryEventControlArgTypes,
    canLoadOlder: { control: 'boolean' },
    isLoadingOlder: { control: 'boolean' },
    returnUrl: { control: 'text' },
  },
  render: (args) => ({
    props: {
      events: createCalendarStoryEvents(args),
      canLoadOlder: args.canLoadOlder,
      isLoadingOlder: args.isLoadingOlder,
      returnUrl: args.returnUrl,
    },
  }),
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarListViewStoryArgs>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const loadOlderButton = await canvas.findByRole('button', { name: 'Mostrar eventos mais antigos' });
  await userEvent.hover(loadOlderButton);
  await expect(loadOlderButton).toBeVisible();
  const eventLinks = await canvas.findAllByRole('link');
  const firstEventLink = eventLinks[0];
  if (!firstEventLink) {
    throw new Error('Expected at least one calendar event link.');
  }
  await expect(firstEventLink).toBeVisible();
  await expect(await canvas.findByText('Acessibilidade em produtos digitais')).toBeVisible();
};

export const Online: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const LoadingOlder: Story = {
  args: { isLoadingOlder: true },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Carregando...' })).toBeDisabled();
  },
};

export const OfflineFallback: Story = {
  args: { canLoadOlder: false },
  render: (args) => ({
    props: {
      events: [],
      canLoadOlder: args.canLoadOlder,
      isLoadingOlder: args.isLoadingOlder,
      returnUrl: args.returnUrl,
    },
  }),
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Nenhum evento encontrado.')).toBeVisible();
  },
};
