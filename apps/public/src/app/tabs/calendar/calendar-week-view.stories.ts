import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CalendarWeekView } from './calendar-week-view';
import {
  CalendarStoryEventControls,
  calendarStoryDateObject,
  calendarStoryWeekDays,
  calendarStoryEventControlArgTypes,
  calendarStoryEventDefaultControls,
  createCalendarStoryEvents,
  startOfCalendarStoryWeek,
} from './calendar-story-fixtures';

type CalendarWeekViewStoryArgs = CalendarStoryEventControls & {
  canGoPrevious: boolean;
  returnUrl: string;
};

const meta: Meta<CalendarWeekViewStoryArgs> = {
  component: CalendarWeekView,
  title: 'Public/Tabs/Calendar/Calendar Week View',
  tags: ['autodocs'],
  args: {
    ...calendarStoryEventDefaultControls,
    canGoPrevious: true,
    returnUrl: '/calendar',
  },
  argTypes: {
    ...calendarStoryEventControlArgTypes,
    canGoPrevious: { control: 'boolean' },
    returnUrl: { control: 'text' },
  },
  render: (args) => renderCalendarWeekView(args),
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
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

export const Online: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const PreviousWeekLocked: Story = {
  args: { canGoPrevious: false },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Semana anterior' })).toBeDisabled();
  },
};

export const OfflineFallback: Story = {
  render: (args) => renderCalendarWeekView(args, []),
  globals: { theme: 'light', network: 'offline' },
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
