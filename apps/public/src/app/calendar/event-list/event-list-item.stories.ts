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
import { createPublicStoryEventGroup } from '../../testing/public-event-story-fixtures';

type CalendarEventListItemStoryArgs = CalendarStoryEventControls & {
  isSubscribed: boolean;
  returnUrl: string;
};

const meta: Meta<CalendarEventListItemStoryArgs> = {
  component: CalendarEventListItem,
  title: 'Public/Discovery/Events/List Item',
  tags: ['autodocs', 'ticketing'],
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
    a11y: { test: 'error' },
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
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {
    context: 'short-description',
    dayOffset: 1,
    slotsAvailable: 0,
    queueCount: 8,
  },
  globals: { network: 'offline' },
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

    const eventUrl = new URL(eventLink.getAttribute('href') ?? '', window.location.href);
    await expect(eventUrl.pathname).toBe('/sports/match/sports-match-story');
    await expect(eventUrl.searchParams.get('returnUrl')).toBe('/calendar');
    await expect(canvas.getByText('Futsal aberto. Semifinal')).toBeVisible();
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

export const MultipleParentContext: Story = {
  args: { context: 'major-event', majorEventName: 'Congresso de tecnologia' },
  render: (args) => {
    const base = createDemoEvent(args);
    const eventGroup = createPublicStoryEventGroup({ name: 'Trilha de acessibilidade' });
    return {
      props: {
        event: {
          ...base,
          eventGroup,
          eventGroupId: eventGroup.id,
          shortDescription: 'Atividade prática com leitores de tela.',
        },
        isSubscribed: args.isSubscribed,
        returnUrl: args.returnUrl,
      },
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Congresso de tecnologia')).toBeVisible();
    await expect(canvas.getByText('Trilha de acessibilidade')).toBeVisible();
    await expect(canvas.getByText('Atividade prática com leitores de tela.')).toBeVisible();
    await expect(canvas.getByText('Minicurso')).toBeVisible();
  },
};

export const LongContent: Story = {
  args: {
    name: 'Atividade interdisciplinar de tecnologia, acessibilidade, ciência aberta e transformação social',
    locationDescription: 'Auditório principal do centro de eventos, bloco acadêmico e cultural',
    context: 'short-description',
    shortDescription: 'Uma descrição longa para validar a hierarquia da linha do calendário em telas estreitas.',
  },
};
