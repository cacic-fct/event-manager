import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CalendarEventListItem } from './calendar-event-list-item';
import {
  CalendarStoryEventControls,
  calendarStoryEventControlArgTypes,
  calendarStoryEventDefaultControls,
  createCalendarStoryEventFromControls,
} from './calendar-story-fixtures';

type CalendarEventListItemStoryArgs = CalendarStoryEventControls & {
  returnUrl: string;
};

const meta: Meta<CalendarEventListItemStoryArgs> = {
  component: CalendarEventListItem,
  title: 'Public/Tabs/Calendar/Calendar Event List Item',
  tags: ['autodocs'],
  args: {
    ...calendarStoryEventDefaultControls,
    returnUrl: '/calendar',
  },
  argTypes: {
    ...calendarStoryEventControlArgTypes,
    returnUrl: { control: 'text' },
  },
  render: (args) => ({
    props: {
      event: createDemoEvent(args),
      returnUrl: args.returnUrl,
    },
  }),
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarEventListItemStoryArgs>;

function createDemoEvent(args: CalendarEventListItemStoryArgs): PublicEvent {
  return createCalendarStoryEventFromControls(args);
}

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const eventLink = await canvas.findByRole('link');
  await userEvent.hover(eventLink);
  await expect(eventLink).toBeVisible();
};

export const Online: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {
    context: 'short-description',
    dayOffset: 1,
    slotsAvailable: 0,
    queueCount: 8,
  },
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
