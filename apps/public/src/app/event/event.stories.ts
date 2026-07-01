import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { publicStoryFixtureDate } from '@cacic-fct/event-manager-public-testing';
import { HttpResponse, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import {
  PublicEventStoryControls,
  MutableStoryContext,
  createPublicStoryEventFromControls,
  createMutableStoryContext,
  publicEventStoryControlArgTypes,
  publicEventStoryDefaultControls,
  renderMutableStory,
} from '../testing/public-event-story-fixtures';
import { Event } from './event';

interface EventStoryArgs extends PublicEventStoryControls {
  allowSubscription: boolean;
  hasAvailableSlots: boolean;
  isSubscribed: boolean;
  hasAttendance: boolean;
}

const defaultArgs: EventStoryArgs = {
  ...publicEventStoryDefaultControls,
  allowSubscription: true,
  hasAvailableSlots: true,
  isSubscribed: false,
  hasAttendance: false,
};

type EventStoryContext = MutableStoryContext<EventStoryArgs>;

const previewRoute = {
  paramMap: of(convertToParamMap({ previewToken: 'storybook-event-preview' })),
  queryParamMap: of(convertToParamMap({ returnUrl: '/menu' })),
  snapshot: {
    paramMap: convertToParamMap({ previewToken: 'storybook-event-preview' }),
    queryParamMap: convertToParamMap({ returnUrl: '/menu' }),
  },
};

const meta: Meta<EventStoryArgs> = {
  component: Event,
  title: 'Public/Event/Event',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    ...publicEventStoryControlArgTypes,
    allowSubscription: { control: 'boolean' },
    hasAvailableSlots: { control: 'boolean' },
    isSubscribed: { control: 'boolean' },
    hasAttendance: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<EventStoryArgs>;

const previewContext = createStoryContext();
const onlineContext = createStoryContext();

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
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
  render: (args) => renderStory(args, onlineContext),
  parameters: eventParameters(onlineContext),
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {},
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const PreviewLink: Story = {
  args: defaultArgs,
  globals: { theme: 'light', network: 'online' },
  render: (args) => renderStory(args, previewContext),
  decorators: [
    applicationConfig({
      providers: [{ provide: ActivatedRoute, useValue: previewRoute }],
    }),
  ],
  parameters: previewParameters(previewContext),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Pré-Visualização')).toBeVisible();
    await expect(await canvas.findByText(/Pré-visualização temporária/)).toBeVisible();
  },
};

function createStoryContext(args: Partial<EventStoryArgs> = {}): EventStoryContext {
  return createMutableStoryContext(defaultArgs, args);
}

function renderStory(args: EventStoryArgs, context: EventStoryContext) {
  return renderMutableStory(defaultArgs, args, context);
}

function eventParameters(context: EventStoryContext) {
  return {
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
          return HttpResponse.json({ data: eventGraphqlData(body.query ?? '', context.args) });
        }),
      ],
    },
  };
}

function previewParameters(context: EventStoryContext) {
  return {
    msw: {
      handlers: [
        http.post('/api/graphql', () =>
          HttpResponse.json({
            data: {
              publicContentPreview: buildPreview(context.args),
            },
          }),
        ),
      ],
    },
  };
}

function buildPreview(args: EventStoryArgs) {
  const event = buildEvent(args);
  return {
    previewAt: publicStoryFixtureDate,
    expiresAt: '2026-08-01T13:00:00.000Z',
    event,
  };
}

function buildEvent(args: EventStoryArgs) {
  return createPublicStoryEventFromControls(args, {
    id: 'event-1',
    allowSubscription: args.allowSubscription,
  });
}

function eventGraphqlData(query: string, args: EventStoryArgs) {
  const event = buildEvent(args);
  if (query.includes('publicEvent(')) {
    return {
      publicEvent: event,
      publicEventSubscriptionSummary: { eventId: event.id, hasAvailableSlots: args.hasAvailableSlots },
      publicEventWeather: publicEventWeather(event),
      currentUserEventSubscription: args.isSubscribed ? currentUserEventSubscription(event) : null,
      currentUserEventAttendance: args.hasAttendance ? currentUserEventAttendance(event) : null,
    };
  }

  if (query.includes('SubscribeCurrentUserStandaloneEvent') || query.includes('UnsubscribeCurrentUserStandaloneEvent')) {
    return {
      subscribeCurrentUserStandaloneEvent: event,
      unsubscribeCurrentUserStandaloneEvent: event,
    };
  }

  if (query.includes('ConfirmCurrentUserOnlineAttendance')) {
    return {
      confirmCurrentUserOnlineAttendance: currentUserEventAttendance(event),
    };
  }

  return {};
}

function currentUserEventSubscription(event: PublicEvent) {
  return {
    eventId: event.id,
    eventGroupSubscriptionId: null,
    createdAt: event.subscriptionStartDate ?? event.startDate,
    event,
  };
}

function currentUserEventAttendance(event: PublicEvent) {
  return {
    eventId: event.id,
    attendedAt: event.onlineAttendanceStartDate ?? event.startDate,
    createdAt: event.onlineAttendanceStartDate ?? event.startDate,
  };
}

function publicEventWeather(event: PublicEvent) {
  return {
    eventId: event.id,
    temperature: 24,
    weatherCode: 1,
    summary: 'Ensolarado',
    materialIcon: 'wb_sunny',
    forecastTime: event.startDate,
    fetchedAt: new Date().toISOString(),
    attribution: 'Open-Meteo',
  };
}
