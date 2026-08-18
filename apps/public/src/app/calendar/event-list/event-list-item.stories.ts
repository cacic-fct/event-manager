import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CalendarEventListItem } from './event-list-item';
import {
  CalendarStoryEventControls,
  calendarStoryEventControlArgTypes,
  calendarStoryEventDefaultControls,
  createCalendarStoryEventFromControls,
  createPublicStorySportsMatchEvent,
} from '../story-fixtures';

type CalendarEventListItemStoryArgs = CalendarStoryEventControls & {
  isSubscribed: boolean;
  returnUrl: string;
};

const meta: Meta<CalendarEventListItemStoryArgs> = {
  component: CalendarEventListItem,
  title: 'CACiC Eventos/Calendar/Event List Item',
  tags: ['autodocs'],
  args: {
    ...calendarStoryEventDefaultControls,
    isSubscribed: true,
    returnUrl: '/calendar',
  },
  argTypes: {
    ...calendarStoryEventControlArgTypes,
    isSubscribed: { control: 'boolean' },
    returnUrl: { control: 'text' },
  },
  render: (args) => ({
    props: {
      event: createDemoEvent(args),
      isSubscribed: args.isSubscribed,
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
  await expect(canvas.getByText('Inscrito')).toBeVisible();
};

export const Playground: Story = {
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
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const SportsMatch: Story = {
  args: {
    isSubscribed: false,
  },
  render: (args) => ({
    props: {
      event: createPublicStorySportsMatchEvent(),
      isSubscribed: args.isSubscribed,
      returnUrl: args.returnUrl,
    },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const eventLink = await canvas.findByRole('link', {
      name: /Atlética FCT × Ciência da Computação/i,
    });

    await expect(eventLink).toHaveAttribute('href', '/sports/match/sports-match-story');
    await expect(canvas.getByText('Futsal aberto · Semifinal')).toBeVisible();
  },
};

export const NotSubscribed: Story = {
  args: { isSubscribed: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Inscrito')).not.toBeInTheDocument();
  },
};

export const SoldOutWithQueue: Story = {
  args: { slotsAvailable: 0, queueCount: 48, isSubscribed: false },
};

export const ShortDescriptionOnly: Story = {
  args: { context: 'short-description', isSubscribed: false },
};

export const EventGroupContext: Story = {
  args: { context: 'event-group', eventGroupName: 'Trilha de desenvolvimento web e acessibilidade' },
};

export const MajorEventContext: Story = {
  args: { context: 'major-event', majorEventName: 'Congresso interdisciplinar universitário de tecnologia' },
};

export const LongContentMobile: Story = {
  args: {
    name: 'Atividade interdisciplinar de tecnologia, acessibilidade, ciência aberta e transformação social',
    locationDescription: 'Auditório principal do centro de eventos, bloco acadêmico e cultural',
    context: 'short-description',
    shortDescription: 'Uma descrição longa para validar a hierarquia da linha do calendário em telas estreitas.',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
