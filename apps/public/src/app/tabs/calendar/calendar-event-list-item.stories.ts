import type { EventType, PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CalendarEventListItem } from './calendar-event-list-item';
import { CalendarStoryContext, createCalendarStoryEvent } from './calendar-story-fixtures';

faker.seed(20260616);

type CalendarEventListItemStoryArgs = {
  name: string;
  type: EventType;
  context: CalendarStoryContext;
  dayOffset: number;
  slotsAvailable: number;
  queueCount: number;
  returnUrl: string;
};

const meta: Meta<CalendarEventListItemStoryArgs> = {
  component: CalendarEventListItem,
  title: 'Public/Tabs/Calendar/Calendar Event List Item',
  tags: ['autodocs'],
  args: {
    name: 'Arquitetura Angular com Signals',
    type: 'MINICURSO',
    context: 'major-event',
    dayOffset: 0,
    slotsAvailable: 12,
    queueCount: 3,
    returnUrl: '/calendar',
  },
  argTypes: {
    name: { control: 'text' },
    type: { control: 'select', options: ['MINICURSO', 'PALESTRA', 'OTHER'] },
    context: { control: 'select', options: ['major-event', 'event-group', 'short-description'] },
    dayOffset: { control: { type: 'range', min: -30, max: 45, step: 1 } },
    slotsAvailable: { control: { type: 'range', min: 0, max: 80, step: 1 } },
    queueCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
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
  faker.seed(20260616 + args.slotsAvailable + args.queueCount);
  return createCalendarStoryEvent({
    name: args.name,
    type: args.type,
    context: args.context,
    dayOffset: args.dayOffset,
    slotsAvailable: args.slotsAvailable,
    queueCount: args.queueCount,
  });
}

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const eventLink = await canvas.findByRole('link', { name: /Abrir evento Arquitetura Angular com Signals/ });
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
