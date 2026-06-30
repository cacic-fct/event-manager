import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CalendarWeekView } from './calendar-week-view';
import {
  calendarStoryDateObject,
  calendarStoryWeekDays,
  createCalendarStoryEvents,
  startOfCalendarStoryWeek,
} from './calendar-story-fixtures';

const meta: Meta<CalendarWeekView> = {
  component: CalendarWeekView,
  title: 'Public/Tabs/Calendar/Calendar Week View',
  tags: ['autodocs'],
  argTypes: {
    weekDays: { control: false },
    selectedDate: { control: false },
    events: { control: false },
    canGoPrevious: { control: 'boolean' },
    returnUrl: { control: 'text' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarWeekView>;

const selectedDate = calendarStoryDateObject(0);
const weekDays = calendarStoryWeekDays(startOfCalendarStoryWeek(selectedDate));

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole('button', { name: 'Semana anterior' })).toBeVisible();
  await userEvent.click(await canvas.findByRole('button', { name: 'Próxima semana' }));
  await expect(await canvas.findByText('Arquitetura Angular com Signals')).toBeVisible();
};

export const Online: Story = {
  args: { weekDays, selectedDate, events: createCalendarStoryEvents(), canGoPrevious: true, returnUrl: '/calendar' },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const PreviousWeekLocked: Story = {
  args: { weekDays, selectedDate, events: createCalendarStoryEvents(), canGoPrevious: false, returnUrl: '/calendar' },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Semana anterior' })).toBeDisabled();
  },
};

export const OfflineFallback: Story = {
  args: { weekDays, selectedDate, events: [], canGoPrevious: true, returnUrl: '/calendar' },
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Nenhum evento nesta data.')).toBeVisible();
  },
};
