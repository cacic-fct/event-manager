import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CalendarListView } from './list-view';
import {
  CalendarStoryCollectionControls,
  calendarStoryCollectionControlArgTypes,
  calendarStoryCollectionDefaultControls,
  createCalendarStoryEvents,
} from '../story-fixtures';

type CalendarListViewStoryArgs = CalendarStoryCollectionControls & {
  canLoadOlder: boolean;
  isLoadingOlder: boolean;
  returnUrl: string;
};

const meta: Meta<CalendarListViewStoryArgs> = {
  component: CalendarListView,
  title: 'CACiC Eventos/Calendar/List View',
  tags: ['autodocs'],
  args: {
    ...calendarStoryCollectionDefaultControls,
    canLoadOlder: true,
    isLoadingOlder: false,
    returnUrl: '/calendar',
  },
  argTypes: {
    ...calendarStoryCollectionControlArgTypes,
    canLoadOlder: { control: 'boolean' },
    isLoadingOlder: { control: 'boolean' },
    returnUrl: { control: 'text' },
  },
  render: (args) => renderCalendarListView(args),
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

export const Playground: Story = {
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

export const DenseList: Story = {
  args: { eventCount: 30 },
  play: async ({ canvasElement }) => {
    const eventLinks = await within(canvasElement).findAllByRole('link');
    await expect(eventLinks).toHaveLength(30);
  },
};

export const Empty: Story = {
  args: { eventCount: 0, canLoadOlder: false },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum evento encontrado.')).toBeVisible();
  },
};

export const OfflineFallback: Story = {
  args: { canLoadOlder: false },
  render: (args) => renderCalendarListView(args, []),
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Nenhum evento encontrado.')).toBeVisible();
  },
};

function renderCalendarListView(args: CalendarListViewStoryArgs, events = createCalendarStoryEvents(args)) {
  return {
    props: {
      events,
      canLoadOlder: args.canLoadOlder,
      isLoadingOlder: args.isLoadingOlder,
      returnUrl: args.returnUrl,
    },
  };
}
