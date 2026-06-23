import type { EventType, PublicEvent, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { HttpResponse, http } from 'msw';
import { NEVER } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { RankedMajorEventSubscription } from './ranked-subscription';
import { MajorEventSubscriptionRealtimeService } from './subscription-realtime.service';

const now = new Date('2026-05-20T12:00:00.000-03:00');

const meta: Meta<RankedMajorEventSubscription> = {
  component: RankedMajorEventSubscription,
  title: 'Public/Major Event/Subscription/Ranked Subscription',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: MajorEventSubscriptionRealtimeService,
          useValue: { watch: () => NEVER },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: { inheritHandlers: true },
  },
};

export default meta;

type Story = StoryObj<RankedMajorEventSubscription>;
type StoryScenario = 'default' | 'payment' | 'auto-only' | 'existing';

interface RankedStoryData {
  majorEvent: PublicMajorEvent;
  events: PublicEvent[];
  subscription: CurrentUserMajorEventSubscription | null;
}

const isoDaysFromNow = (days: number, hour: number): string => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

function createMajorEvent(scenario: StoryScenario): PublicMajorEvent {
  return {
    id: 'major-1',
    name: scenario === 'payment' ? 'SECOMPP Preferencial' : 'CACiC Preferencial',
    emoji: faker.helpers.arrayElement(['💻', '🚀', '🎓']),
    startDate: isoDaysFromNow(10, 9),
    endDate: isoDaysFromNow(13, 18),
    description: faker.lorem.paragraphs(2),
    subscriptionStartDate: isoDaysFromNow(-5, 8),
    subscriptionEndDate: isoDaysFromNow(6, 23),
    maxCoursesPerAttendee: scenario === 'auto-only' ? 1 : 2,
    maxLecturesPerAttendee: scenario === 'auto-only' ? 1 : 3,
    maxUncategorizedPerAttendee: scenario === 'auto-only' ? 1 : 1,
    rankedSubscriptionEnabled: true,
    buttonText: 'Site oficial',
    buttonLink: 'https://cacic.dev',
    contactInfo: faker.internet.email(),
    contactType: 'EMAIL',
    isPaymentRequired: scenario === 'payment' || scenario === 'existing',
    additionalPaymentInfo: 'Pagamento confirmado por comprovante.',
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    paymentInfo: {
      id: 'payment-1',
      bankName: 'Banco Storybook',
      agency: '0001',
      account: '12345-6',
      holder: 'CACiC FCT',
      document: '12.345.678/0001-90',
      pixKey: 'pagamentos@example.com',
      pixCity: 'PRESIDENTE PRUDENTE',
      majorEventId: 'major-1',
    },
    majorEventPrices: [
      {
        id: 'price-1',
        type: 'TIERED',
        tiers: [
          { id: 'tier-student', name: 'Estudante', value: 2500 },
          { id: 'tier-community', name: 'Comunidade', value: 5000 },
        ],
      },
    ],
  };
}

function createEvent(
  index: number,
  majorEvent: PublicMajorEvent,
  options: {
    autoSubscribe?: boolean;
    eventGroupId?: string | null;
    eventGroupName?: string;
    eventGroupEmoji?: string;
    type?: EventType;
    hasAvailableSlots?: boolean;
  } = {},
): PublicEvent {
  const eventGroupId = options.eventGroupId === undefined ? `group-${(index % 2) + 1}` : options.eventGroupId;
  const type = options.type ?? faker.helpers.arrayElement<EventType>(['MINICURSO', 'PALESTRA', 'OTHER']);
  return {
    id: `event-${index + 1}`,
    name: faker.helpers.arrayElement([
      'Arquitetura Angular com Signals',
      'OCR aplicado a eventos acadêmicos',
      'Observabilidade para APIs GraphQL',
      'Acessibilidade em produtos digitais',
      'Design systems para produtos públicos',
      'Segurança prática em APIs',
    ]),
    creditMinutes: faker.helpers.arrayElement([60, 90, 120, 180]),
    startDate: isoDaysFromNow(index + 10, 9 + (index % 4) * 2),
    endDate: isoDaysFromNow(index + 10, 11 + (index % 4) * 2),
    emoji: faker.helpers.arrayElement(['🧠', '🛠️', '📡', '✨', '🔐']),
    type,
    description: faker.lorem.paragraphs(2),
    shortDescription: faker.lorem.sentence(),
    latitude: -22.1211,
    longitude: -51.4086,
    locationDescription: faker.helpers.arrayElement(['Auditório', 'Laboratório 01', 'Sala multiuso']),
    majorEventId: majorEvent.id,
    majorEvent,
    eventGroupId,
    eventGroup: eventGroupId
      ? {
          id: eventGroupId,
          name: options.eventGroupName ?? faker.helpers.arrayElement(['Trilha Web', 'Trilha Dados']),
          emoji: options.eventGroupEmoji ?? faker.helpers.arrayElement(['🌐', '📊']),
          shouldIssueCertificateForEachEvent: true,
          shouldIssuePartialCertificate: true,
          shouldIssueCertificate: true,
        }
      : null,
    allowSubscription: true,
    subscriptionStartDate: isoDaysFromNow(-3, 8),
    subscriptionEndDate: isoDaysFromNow(index + 9, 23),
    slots: 40,
    slotsAvailable: options.hasAvailableSlots === false ? 0 : 12,
    queueCount: index,
    autoSubscribe: options.autoSubscribe ?? false,
    shouldIssueCertificate: true,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: index % 2 === 0,
    onlineAttendanceStartDate: isoDaysFromNow(index + 10, 8),
    onlineAttendanceEndDate: isoDaysFromNow(index + 10, 18),
    publiclyVisible: true,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
  };
}

function createStoryData(scenario: StoryScenario): RankedStoryData {
  faker.seed(20260520 + scenario.length);
  const majorEvent = createMajorEvent(scenario);
  const allAuto = scenario === 'auto-only';
  const events = [
    createEvent(0, majorEvent, { autoSubscribe: true, eventGroupId: null, type: 'OTHER' }),
    createEvent(1, majorEvent, {
      autoSubscribe: allAuto,
      eventGroupId: 'group-web',
      eventGroupName: 'Trilha Web',
      eventGroupEmoji: '🌐',
      type: 'MINICURSO',
    }),
    createEvent(2, majorEvent, {
      autoSubscribe: allAuto,
      eventGroupId: 'group-web',
      eventGroupName: 'Trilha Web',
      eventGroupEmoji: '🌐',
      type: 'MINICURSO',
    }),
    createEvent(3, majorEvent, {
      autoSubscribe: allAuto,
      eventGroupId: 'group-data',
      eventGroupName: 'Trilha Dados',
      eventGroupEmoji: '📊',
      type: 'PALESTRA',
    }),
    createEvent(4, majorEvent, {
      autoSubscribe: allAuto,
      eventGroupId: null,
      type: 'OTHER',
      hasAvailableSlots: scenario !== 'default',
    }),
  ];
  const selectedEvents = scenario === 'existing' ? events.slice(0, 4) : [];
  return {
    majorEvent,
    events,
    subscription:
      scenario === 'existing'
        ? {
            id: 'subscription-major-1',
            majorEventId: majorEvent.id,
            subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
            amountPaid: 2500,
            paymentDate: null,
            paymentTier: 'Estudante',
            majorEvent,
            selectedEvents,
            notSubscribedEvents: events.filter((event) => !selectedEvents.some((selected) => selected.id === event.id)),
          }
        : null,
  };
}

function rankedHandlers(scenario: StoryScenario) {
  const storyData = createStoryData(scenario);
  return [
    http.post('/api/graphql', async ({ request }) => {
      const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
      const query = body.query ?? '';
      const selectedEventIds = Array.isArray(body.variables?.['selectedEventIds'])
        ? body.variables['selectedEventIds'].map(String)
        : storyData.events.slice(0, 3).map((event) => event.id);

      if (query.includes('PublicMajorEventSubscriptionPage')) {
        return HttpResponse.json({
          data: {
            publicMajorEventSubscriptionPage: {
              majorEvent: storyData.majorEvent,
              events: storyData.events,
              subscriptionSummaries: storyData.events.map((event) => ({
                eventId: event.id,
                hasAvailableSlots: event.slotsAvailable !== 0,
              })),
            },
          },
        });
      }

      if (query.includes('CurrentUserMajorEventSubscription')) {
        return HttpResponse.json({
          data: {
            currentUserMajorEventSubscription: storyData.subscription,
          },
        });
      }

      if (query.includes('UpsertCurrentUserRankedMajorEventSubscription')) {
        const selectedEvents = storyData.events.filter((event) => selectedEventIds.includes(event.id));
        return HttpResponse.json({
          data: {
            upsertCurrentUserMajorEventSubscription: {
              id: 'subscription-major-1',
              majorEventId: storyData.majorEvent.id,
              subscriptionStatus: storyData.majorEvent.isPaymentRequired ? 'WAITING_RECEIPT_UPLOAD' : 'CONFIRMED',
              amountPaid: null,
              paymentDate: null,
              paymentTier: body.variables?.['paymentTier'] ?? null,
              majorEvent: storyData.majorEvent,
              selectedEvents,
              notSubscribedEvents: storyData.events.filter((event) => !selectedEventIds.includes(event.id)),
            },
          },
        });
      }

      return HttpResponse.json({ data: {} });
    }),
  ];
}

const expectSelectionStep = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByText('Voto preferencial')).toBeVisible();
  await expect(await canvas.findByText('Selecione todos os eventos que você quer participar')).toBeVisible();
  expect(canvas.queryByText('Quero participar')).not.toBeInTheDocument();
};

const goToRankingStep = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expectSelectionStep(canvasElement);
  const optionalCheckbox = canvas.queryAllByRole('checkbox').find((checkbox) => !checkbox.hasAttribute('disabled'));
  if (optionalCheckbox) {
    await userEvent.click(optionalCheckbox);
  }
  await userEvent.click(await canvas.findByRole('button', { name: /ordenar preferências/i }));
  await expect(await canvas.findByText('Quero participar')).toBeVisible();
  await expect(await canvas.findByText('Não quero')).toBeVisible();
};

export const Selection: Story = {
  parameters: {
    msw: { handlers: rankedHandlers('default') },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => expectSelectionStep(canvasElement),
};

export const Ranking: Story = {
  parameters: {
    msw: { handlers: rankedHandlers('default') },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => goToRankingStep(canvasElement),
};

export const PaymentRanking: Story = {
  parameters: {
    msw: { handlers: rankedHandlers('payment') },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    await goToRankingStep(canvasElement);
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Preço')).toBeVisible();
    await expect(await canvas.findByText('Estudante')).toBeVisible();
  },
};

export const AutomaticOnly: Story = {
  parameters: {
    msw: { handlers: rankedHandlers('auto-only') },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectSelectionStep(canvasElement);
    expect(canvas.queryByLabelText(/minicursos desejados/i)).not.toBeInTheDocument();
    await userEvent.click(await canvas.findByRole('button', { name: /ordenar preferências/i }));
    await expect(await canvas.findByText('Inscrição automática')).toBeVisible();
  },
};

export const ExistingSubscription: Story = {
  parameters: {
    msw: { handlers: rankedHandlers('existing') },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Comprovante em análise')).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: /ordenar preferências/i }));
    await expect(await canvas.findByText('Atualizar inscrição')).toBeVisible();
  },
};
