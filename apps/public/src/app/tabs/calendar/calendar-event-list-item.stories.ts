import type { EventType, PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { createPublicEvent, createPublicEventGroup, createPublicMajorEvent } from '../../testing/public-entity-fixtures';
import { CalendarEventListItem } from './calendar-event-list-item';

faker.seed(20260616);

type CalendarEventListItemStoryArgs = {
  name: string;
  type: EventType;
  context: 'major-event' | 'event-group' | 'short-description';
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
    slotsAvailable: 12,
    queueCount: 3,
    returnUrl: '/calendar',
  },
  argTypes: {
    name: { control: 'text' },
    type: { control: 'select', options: ['MINICURSO', 'PALESTRA', 'OTHER'] },
    context: { control: 'select', options: ['major-event', 'event-group', 'short-description'] },
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

const demoMajorEvent = createPublicMajorEvent({ id: 'major-story', emoji: '💻' });
const demoEventGroup = createPublicEventGroup({ id: 'group-story', emoji: '✨' });
const demoEvent: PublicEvent = createPublicEvent({
  id: 'event-story',
  emoji: '🧠',
  majorEvent: demoMajorEvent,
  eventGroup: demoEventGroup,
  startDate: '2026-05-21T17:00:00.000Z',
  endDate: '2026-05-21T19:00:00.000Z',
  onlineAttendanceStartDate: '2026-05-21T17:00:00.000Z',
  onlineAttendanceEndDate: '2026-05-21T19:00:00.000Z',
});

function createDemoEvent(args: CalendarEventListItemStoryArgs): PublicEvent {
  faker.seed(20260616 + args.slotsAvailable + args.queueCount);
  return {
    ...demoEvent,
    name: args.name,
    type: args.type,
    shortDescription:
      args.context === 'short-description' ? faker.helpers.arrayElement(['Signals na prática', 'Sessão aberta']) : null,
    majorEvent: args.context === 'major-event' ? demoMajorEvent : null,
    eventGroup: args.context === 'event-group' ? demoEventGroup : null,
    slotsAvailable: args.slotsAvailable,
    queueCount: args.queueCount,
  };
}

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

export const Online: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {
    context: 'short-description',
    slotsAvailable: 0,
    queueCount: 8,
  },
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
