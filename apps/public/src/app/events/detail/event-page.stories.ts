import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { PublicEvent, PublicEventForm } from '@cacic-fct/event-manager-public-contracts';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import {
  createPublicStoryEventFromControls,
  createPublicStoryLecturerProfilesFromControls,
  createMutableStoryContext,
  publicEventStoryControlArgTypes,
  publicEventStoryDefaultControls,
  publicLecturerStoryControlArgTypes,
  publicLecturerStoryDefaultControls,
  renderMutableStory,
  type MutableStoryContext,
  type PublicEventStoryControls,
  type PublicLecturerStoryControls,
} from '../../testing/public-event-story-fixtures';
import { Event } from './event-page';

interface EventStoryArgs extends PublicEventStoryControls, PublicLecturerStoryControls {
  apiState: 'ready' | 'loading' | 'error';
  latencyMs: number;
  weatherState: 'forecast' | 'unavailable' | 'extreme-heat';
  allowSubscription: boolean;
  hasAvailableSlots: boolean;
  isSubscribed: boolean;
  hasAttendance: boolean;
}

const defaultArgs: EventStoryArgs = {
  ...publicEventStoryDefaultControls,
  ...publicLecturerStoryDefaultControls,
  apiState: 'ready',
  latencyMs: 120,
  weatherState: 'forecast',
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

const onlineContext = createStoryContext();

const meta: Meta<EventStoryArgs> = {
  component: Event,
  title: 'CACiC Eventos/Events/Detail Page',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    ...publicEventStoryControlArgTypes,
    ...publicLecturerStoryControlArgTypes,
    apiState: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    weatherState: { control: 'select', options: ['forecast', 'unavailable', 'extreme-heat'] },
    allowSubscription: { control: 'boolean' },
    hasAvailableSlots: { control: 'boolean' },
    isSubscribed: { control: 'boolean' },
    hasAttendance: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    ...eventParameters(onlineContext),
  },
  render: (args) => renderStory(args, onlineContext),
};

export default meta;

type Story = StoryObj<EventStoryArgs>;

const previewContext = createStoryContext();

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

export const Playground: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const WithoutLecturers: Story = {
  args: {
    lecturerCount: 0,
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Ministrantes')).toBeNull();
  },
};

export const LecturerWithoutContact: Story = {
  args: {
    lecturerCount: 1,
    lecturerEmail: '',
    lecturerWhatsapp: '',
    publishGoogleUserPicture: false,
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Ministrantes')).toBeVisible();
    await expect(canvas.queryByRole('link', { name: /ana@example.com/i })).toBeNull();
    await expect(canvas.queryByRole('link', { name: /whatsapp/i })).toBeNull();
  },
};

export const WithAttendanceForms: Story = {
  args: {
    hasAttendance: true,
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Formulários')).toBeVisible();
    await expect(await canvas.findByRole('link', { name: /avaliação do evento/i })).toBeVisible();
  },
};

export const OfflineFallback: Story = {
  args: {},
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const SoldOut: Story = {
  args: { hasAvailableSlots: false, slotsAvailable: 0, allowSubscription: true },
  globals: { theme: 'light', network: 'online' },
};

export const AlreadySubscribed: Story = {
  args: { isSubscribed: true, hasAttendance: false },
  globals: { theme: 'light', network: 'online' },
};

export const ExtremeHeatForecast: Story = {
  args: { weatherState: 'extreme-heat' },
  globals: { theme: 'light', network: 'online' },
};

export const Loading: Story = {
  args: { apiState: 'loading', latencyMs: 0 },
  globals: { theme: 'light', network: 'online' },
};

export const LoadError: Story = {
  args: { apiState: 'error', latencyMs: 0 },
  globals: { theme: 'dark', network: 'online', motion: 'reduced' },
};

export const LongContentMobile: Story = {
  args: {
    name: 'Encontro interdisciplinar de tecnologia, acessibilidade, ciência aberta e transformação social',
    shortDescription:
      'Uma programação detalhada para validar descrições extensas, múltiplas seções e ações em telas estreitas.',
    lecturerBiography:
      'Pesquisadora e educadora com atuação interdisciplinar em produtos públicos digitais acessíveis.',
    lecturerCount: 8,
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', network: 'online', motion: 'reduced' },
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
      handlers: {
        graphql: [
          http.post('/api/graphql', async ({ request }) => {
            if (context.args.apiState === 'loading') {
              await delay('infinite');
            }
            if (context.args.latencyMs > 0) {
              await delay(context.args.latencyMs);
            }
            const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
            if (context.args.apiState === 'error') {
              return HttpResponse.json({ errors: [{ message: 'Não foi possível carregar o evento.' }] });
            }
            return HttpResponse.json({ data: eventGraphqlData(body.query ?? '', context.args) });
          }),
        ],
      },
    },
  };
}

function previewParameters(context: EventStoryContext) {
  return {
    msw: {
      handlers: {
        graphql: [
          http.post('/api/graphql', () =>
            HttpResponse.json({
              data: {
                publicationPreview: buildPreview(context.args),
              },
            }),
          ),
        ],
      },
    },
  };
}

function buildPreview(args: EventStoryArgs) {
  const event = buildEvent(args);
  return {
    previewAt: publicFixtureDateFromNow(),
    expiresAt: publicFixtureDateFromNow(1, 13),
    event,
  };
}

function buildEvent(args: EventStoryArgs) {
  return createPublicStoryEventFromControls(args, {
    id: 'event-1',
    allowSubscription: args.allowSubscription,
    lecturers: createPublicStoryLecturerProfilesFromControls(args),
  });
}

function eventGraphqlData(query: string, args: EventStoryArgs) {
  const event = buildEvent(args);
  if (query.includes('publicEvent(')) {
    return {
      publicEvent: event,
      publicEventSubscriptionSummary: { eventId: event.id, hasAvailableSlots: args.hasAvailableSlots },
      publicEventWeather: args.weatherState === 'unavailable' ? null : publicEventWeather(event, args.weatherState),
      currentUserEventSubscription: args.isSubscribed ? currentUserEventSubscription(event) : null,
      currentUserEventAttendance: args.hasAttendance ? currentUserEventAttendance(event) : null,
    };
  }

  if (query.includes('CurrentUserEventForms')) {
    return {
      currentUserEventForms: args.hasAttendance ? [publicEventForm(event)] : [],
    };
  }

  if (
    query.includes('SubscribeCurrentUserStandaloneEvent') ||
    query.includes('UnsubscribeCurrentUserStandaloneEvent')
  ) {
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

function publicEventForm(event: PublicEvent): PublicEventForm {
  return {
    id: 'form-1',
    name: 'Avaliação do evento',
    description: 'Conte como foi sua experiência.',
    elementsJson: JSON.stringify([
      {
        id: 'rating',
        type: 'singleChoice',
        title: 'Como você avalia a atividade?',
        required: true,
        options: [
          { id: 'great', label: 'Ótima' },
          { id: 'good', label: 'Boa' },
        ],
      },
    ]),
    sigilo: 'SECRET',
    responseMode: 'ONE_PER_TARGET',
    resultsPublic: false,
    resultsLive: false,
    allowResponseEdits: true,
    publicationState: 'PUBLISHED',
    links: [
      {
        id: 'link-1',
        formId: 'form-1',
        targetType: 'EVENT',
        eventId: event.id,
        majorEventId: null,
        priceTierIds: [],
        target: {
          type: 'EVENT',
          id: event.id,
          name: event.name,
          emoji: event.emoji,
        },
        audience: 'ATTENDEES',
        insertInSubscriptionFlow: false,
        requiredInSubscriptionFlow: false,
        displayOrder: 0,
        availableFrom: null,
        availableUntil: null,
        notifyOnPublish: false,
        allowLecturerManualPublish: false,
        lastNotifiedAt: null,
        responseCount: 0,
        createdAt: publicFixtureDateFromNow(-1, 10),
        updatedAt: publicFixtureDateFromNow(-1, 10),
      },
    ],
    responseCount: 0,
    createdAt: publicFixtureDateFromNow(-1, 10),
    updatedAt: publicFixtureDateFromNow(-1, 10),
  };
}

function currentUserEventAttendance(event: PublicEvent) {
  return {
    eventId: event.id,
    attendedAt: event.onlineAttendanceStartDate ?? event.startDate,
    createdAt: event.onlineAttendanceStartDate ?? event.startDate,
  };
}

function publicEventWeather(event: PublicEvent, state: EventStoryArgs['weatherState']) {
  return {
    eventId: event.id,
    temperature: state === 'extreme-heat' ? 41 : 24,
    weatherCode: state === 'extreme-heat' ? 0 : 1,
    summary: state === 'extreme-heat' ? 'Calor extremo' : 'Ensolarado',
    materialIcon: state === 'extreme-heat' ? 'device_thermostat' : 'wb_sunny',
    forecastTime: event.startDate,
    fetchedAt: new Date().toISOString(),
    attribution: 'Open-Meteo',
  };
}
