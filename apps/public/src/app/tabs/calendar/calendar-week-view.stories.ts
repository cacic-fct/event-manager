import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { createPublicEvent, createPublicEventGroup, createPublicMajorEvent } from '../../testing/public-entity-fixtures';
import { CalendarWeekView } from './calendar-week-view';

const meta: Meta<CalendarWeekView> = {
  component: CalendarWeekView,
  title: 'Public/Tabs/Calendar/Calendar Week View',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarWeekView>;

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

const demoEvents: PublicEvent[] = [
  demoEvent,
  {
    ...demoEvent,
    id: 'event-story-2',
    name: 'Acessibilidade em produtos digitais',
    emoji: '♿',
    type: 'PALESTRA' as const,
    startDate: '2026-05-22T13:00:00.000Z',
    endDate: '2026-05-22T14:00:00.000Z',
    slotsAvailable: 0,
  },
  {
    ...demoEvent,
    id: 'event-story-3',
    name: 'Observabilidade para APIs GraphQL',
    emoji: '📡',
    type: 'OTHER' as const,
    startDate: '2026-06-02T18:00:00.000Z',
    endDate: '2026-06-02T20:00:00.000Z',
    eventGroup: null,
    eventGroupId: null,
  },
];

const selectedDate = new Date('2026-05-21T12:00:00.000Z');
const weekDays = Array.from({ length: 7 }, (_, index) => ({
  label: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][index],
  date: new Date(Date.UTC(2026, 4, 17 + index, 12)),
}));

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
  args: { weekDays, selectedDate, events: demoEvents, canGoPrevious: true, returnUrl: '/calendar' },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: { weekDays, selectedDate, events: [], canGoPrevious: true, returnUrl: '/calendar' },
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
