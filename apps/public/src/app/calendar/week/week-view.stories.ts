import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CalendarWeekView } from './week-view';
import {
  CalendarStoryCollectionControls,
  calendarStoryDateObject,
  calendarStoryWeekDays,
  calendarStoryCollectionControlArgTypes,
  calendarStoryCollectionDefaultControls,
  createCalendarStoryEvents,
  startOfCalendarStoryWeek,
} from '../story-fixtures';

type CalendarWeekViewStoryArgs = CalendarStoryCollectionControls & {
  canGoPrevious: boolean;
  returnUrl: string;
};

const meta: Meta<CalendarWeekViewStoryArgs> = {
  component: CalendarWeekView,
  title: 'Public/Discovery/Calendar/Week',
  tags: ['autodocs'],
  args: {
    ...calendarStoryCollectionDefaultControls,
    canGoPrevious: true,
    returnUrl: '/calendar',
  },
  argTypes: {
    ...calendarStoryCollectionControlArgTypes,
    canGoPrevious: { control: 'boolean' },
    returnUrl: { control: 'text' },
  },
  render: (args) => renderCalendarWeekView(args),
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<CalendarWeekViewStoryArgs>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole('button', { name: 'Semana anterior' })).toBeVisible();
  await userEvent.click(await canvas.findByRole('button', { name: 'Próxima semana' }));
  await expect(await canvas.findByText('Arquitetura Angular com Signals')).toBeVisible();
};

export const Playground: Story = {
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const PreviousWeekLocked: Story = {
  args: { canGoPrevious: false },
  globals: { network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Semana anterior' })).toBeDisabled();
  },
};

export const DenseWeek: Story = {
  args: { eventCount: 30, dayOffset: 0 },
  render: (args) => renderDenseCalendarWeekView(args),
  play: async ({ canvasElement }) => {
    const eventLinks = await within(canvasElement).findAllByRole('link');
    await expect(eventLinks.length).toBeGreaterThan(10);
  },
};

export const EmptyWeek: Story = {
  args: { eventCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum evento nesta data.')).toBeVisible();
  },
};

export const OfflineFallback: Story = {
  render: (args) => renderCalendarWeekView(args, []),
  globals: { network: 'offline' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Nenhum evento nesta data.')).toBeVisible();
  },
};

function renderCalendarWeekView(args: CalendarWeekViewStoryArgs, events = createCalendarStoryEvents(args)) {
  const selectedDate = calendarStoryDateObject(args.dayOffset);
  const weekDays = calendarStoryWeekDays(startOfCalendarStoryWeek(selectedDate));

  return {
    props: {
      weekDays,
      selectedDate,
      events,
      canGoPrevious: args.canGoPrevious,
      returnUrl: args.returnUrl,
    },
  };
}

function renderDenseCalendarWeekView(args: CalendarWeekViewStoryArgs) {
  const selectedDate = calendarStoryDateObject(args.dayOffset);
  const events = createCalendarStoryEvents(args).map((event, index) => {
    const startDate = new Date(selectedDate);
    startDate.setHours(8 + (index % 10), index % 2 === 0 ? 0 : 30, 0, 0);

    return {
      ...event,
      startDate: startDate.toISOString(),
      endDate: new Date(startDate.getTime() + 60 * 60_000).toISOString(),
    };
  });

  return renderCalendarWeekView(args, events);
}
