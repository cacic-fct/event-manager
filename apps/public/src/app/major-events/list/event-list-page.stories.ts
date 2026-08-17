import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import type { PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import { createStoryPublicMajorEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { of } from 'rxjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MajorEvent } from './event-list-page';

type MajorEventApiState = 'ready' | 'loading' | 'error';
type MajorEventRegistrationState = 'open' | 'upcoming' | 'closed';

interface MajorEventStoryArgs {
  apiState: MajorEventApiState;
  eventCount: number;
  subscribedCount: number;
  latencyMs: number;
  authenticated: boolean;
  name: string;
  emoji: string;
  description: string;
  requiresPayment: boolean;
  rankedSubscriptionEnabled: boolean;
  sportsEvery: number;
  eventlessTournamentEvery: number;
  registrationState: MajorEventRegistrationState;
  subscriptionStatus: string;
}

const defaultArgs: MajorEventStoryArgs = {
  apiState: 'ready',
  eventCount: 8,
  subscribedCount: 3,
  latencyMs: 120,
  authenticated: true,
  name: 'CACiC Storybook',
  emoji: '💻',
  description: 'Grande evento de demonstração com atividades, inscrições e certificados.',
  requiresPayment: false,
  rankedSubscriptionEnabled: true,
  sportsEvery: 3,
  eventlessTournamentEvery: 5,
  registrationState: 'open',
  subscriptionStatus: 'CONFIRMED',
};

let activeArgs = defaultArgs;
const loginMock = fn(async () => undefined);

const previewRoute = {
  paramMap: of(convertToParamMap({ previewToken: 'storybook-major-preview' })),
  queryParamMap: of(convertToParamMap({})),
  snapshot: {
    paramMap: convertToParamMap({ previewToken: 'storybook-major-preview' }),
    queryParamMap: convertToParamMap({}),
  },
};

const meta: Meta<MajorEventStoryArgs> = {
  component: MajorEvent,
  title: 'CACiC Eventos/Major Events/List',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    apiState: { control: 'select', options: ['ready', 'loading', 'error'] },
    eventCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    subscribedCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    authenticated: { control: 'boolean' },
    name: { control: 'text' },
    emoji: { control: 'text' },
    description: { control: 'text' },
    requiresPayment: { control: 'boolean' },
    rankedSubscriptionEnabled: { control: 'boolean' },
    sportsEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    eventlessTournamentEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    registrationState: { control: 'select', options: ['open', 'upcoming', 'closed'] },
    subscriptionStatus: {
      control: 'select',
      options: [
        'CONFIRMED',
        'WAITING_RECEIPT_UPLOAD',
        'RECEIPT_UNDER_REVIEW',
        'REJECTED_INVALID_RECEIPT',
        'REJECTED_NO_SLOTS',
        'REJECTED_SCHEDULE_CONFLICT',
        'CANCELED',
      ],
    },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: AuthService,
          useValue: { isAuthenticated: () => activeArgs.authenticated, login: loginMock },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: { handlers: { graphql: [majorEventsHandler()] } },
  },
};

export default meta;
type Story = StoryObj<MajorEventStoryArgs>;

export const Playground: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ args, canvasElement }) => {
    const cards = await within(canvasElement).findAllByRole('heading', { level: 2 });
    await expect(cards).toHaveLength(args.eventCount);
  },
};

export const DenseMixedCatalog: Story = {
  args: { eventCount: 30, subscribedCount: 12, sportsEvery: 2, eventlessTournamentEvery: 5, latencyMs: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findAllByRole('heading', { level: 2 })).toHaveLength(30);
    await expect((await canvas.findAllByText('Ver torneio')).length).toBeGreaterThan(10);
  },
};

export const Empty: Story = {
  args: { eventCount: 0, subscribedCount: 0, latencyMs: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum grande evento disponível.')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { apiState: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByLabelText('Carregando grandes eventos')).toBeVisible();
  },
};

export const ApiError: Story = {
  args: { apiState: 'error' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível carregar os grandes eventos.')).toBeVisible();
  },
};

export const Unauthenticated: Story = {
  args: { authenticated: false, subscribedCount: 0, eventCount: 4 },
  play: async ({ canvasElement }) => {
    const loginButtons = await within(canvasElement).findAllByRole('button', { name: /Entrar para/ });
    await userEvent.click(loginButtons[0]);
    await expect(loginMock).toHaveBeenCalled();
  },
};

export const ClosedRegistration: Story = {
  args: { registrationState: 'closed', subscribedCount: 0, eventCount: 5 },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findAllByText(/Inscrições.*encerradas/)).length).toBeGreaterThan(1);
  },
};

export const ReceiptRequired: Story = {
  args: {
    eventCount: 4,
    subscribedCount: 4,
    requiresPayment: true,
    subscriptionStatus: 'WAITING_RECEIPT_UPLOAD',
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findAllByText('Enviar comprovante')).toHaveLength(4);
  },
};

export const LongContentMobile: Story = {
  args: {
    eventCount: 3,
    name: 'Congresso interdisciplinar universitário de tecnologia, ciência, cultura, extensão e acessibilidade',
    description:
      'Uma programação extensa criada para validar títulos, descrições e ações com conteúdo significativamente maior que o habitual.',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Congresso interdisciplinar/)).toBeVisible();
  },
};

export const PreviewLink: Story = {
  args: { eventCount: 1, subscribedCount: 0 },
  decorators: [applicationConfig({ providers: [{ provide: ActivatedRoute, useValue: previewRoute }] })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Pré-visualização')).toBeVisible();
    await expect(await canvas.findByText(/Pré-visualização temporária/)).toBeVisible();
  },
};

function majorEventsHandler() {
  return http.post('/api/graphql', async ({ request }) => {
    const body = (await request.json()) as { query?: string };
    const query = body.query ?? '';

    if (activeArgs.apiState === 'loading') {
      await delay('infinite');
    } else if (activeArgs.latencyMs > 0) {
      await delay(activeArgs.latencyMs);
    }
    if (activeArgs.apiState === 'error') {
      return HttpResponse.json({ errors: [{ message: 'Não foi possível carregar os grandes eventos.' }] });
    }

    const events = buildMajorEvents(activeArgs);
    if (query.includes('PublicationPreviewMajorEvent')) {
      return HttpResponse.json({
        data: {
          publicationPreview: {
            expiresAt: publicFixtureDateFromNow(1, 13),
            majorEvent: events[0] ?? buildMajorEvent(activeArgs, 0),
          },
        },
      });
    }
    if (query.includes('CurrentUserMajorEventSubscriptions')) {
      return HttpResponse.json({
        data: {
          currentUserMajorEventSubscriptions: events
            .slice(0, activeArgs.subscribedCount)
            .map((event, index) => buildSubscription(event, index)),
        },
      });
    }
    if (query.includes('PublicMajorEvents')) {
      return HttpResponse.json({ data: { publicMajorEvents: events } });
    }
    return HttpResponse.json({ data: {} });
  });
}

function buildMajorEvents(args: MajorEventStoryArgs): PublicMajorEvent[] {
  const count = Math.min(Math.max(Math.trunc(args.eventCount), 0), 30);
  faker.seed(20_260_821);
  return Array.from({ length: count }, (_, index) => buildMajorEvent(args, index));
}

function buildMajorEvent(args: MajorEventStoryArgs, index: number): PublicMajorEvent {
  const sports = args.sportsEvery > 0 && index % args.sportsEvery === 0;
  const eventless = sports && args.eventlessTournamentEvery > 0 && index % args.eventlessTournamentEvery === 0;
  const registrationDates = {
    open: { start: publicFixtureDateFromNow(-15, 8), end: publicFixtureDateFromNow(5, 23) },
    upcoming: { start: publicFixtureDateFromNow(3, 8), end: publicFixtureDateFromNow(15, 23) },
    closed: { start: publicFixtureDateFromNow(-20, 8), end: publicFixtureDateFromNow(-2, 23) },
  }[args.registrationState];

  return createStoryPublicMajorEvent(index, {
    id: `major-event-story-${index + 1}`,
    name: index === 0 ? args.name : `${['Semana de tecnologia', 'Mostra científica', 'Festival de extensão'][index % 3]} · ${faker.word.adjective()}`,
    emoji: index === 0 ? args.emoji : ['💻', '🔬', '🌎'][index % 3],
    description: index === 0 ? args.description : faker.lorem.sentences(2),
    rankedSubscriptionEnabled: args.rankedSubscriptionEnabled,
    requiresPayment: args.requiresPayment || index % 2 === 0,
    subscriptionStartDate: registrationDates.start,
    subscriptionEndDate: registrationDates.end,
    hasEvents: !eventless,
    regularSubscriptionOpen: args.registrationState === 'open',
    sportsTournament: sports
      ? {
          id: `tournament-story-${index + 1}`,
          selfSubscriptionEnabled: true,
          registrationOpen: args.registrationState === 'open',
        }
      : null,
  });
}

function buildSubscription(event: PublicMajorEvent, index: number): CurrentUserMajorEventSubscription {
  return {
    id: `major-subscription-story-${index + 1}`,
    majorEventId: event.id,
    subscriptionStatus: activeArgs.subscriptionStatus,
    amountPaid: activeArgs.requiresPayment ? 2_500 : null,
    paymentDate: null,
    paymentTier: activeArgs.requiresPayment ? 'STUDENT' : null,
    imageLicenseAgreementAccepted: true,
    majorEvent: event,
    selectedEvents: activeArgs.subscriptionStatus === 'CONFIRMED' ? [{ id: `selected-event-${index + 1}` }] : [],
  } as CurrentUserMajorEventSubscription;
}
