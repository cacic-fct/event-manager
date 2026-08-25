import type {
  EventType,
  PublicEvent,
  PublicEventForm,
  PublicMajorEvent,
} from '@cacic-fct/event-manager-public-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { HttpResponse, delay, http } from 'msw';
import { NEVER } from 'rxjs';
import { expect, screen, userEvent, within } from 'storybook/test';
import {
  createPublicEvent,
  createPublicEventForm,
  createPublicEventFormLink,
  createPublicEventGroup,
  createPublicMajorEvent,
  createPublicMajorEventPrice,
  createPublicPaymentInfo,
} from '../../../testing/public-entity-fixtures';
import { RankedMajorEventSubscription } from './ranked-subscription';
import { MajorEventSubscriptionRealtimeService } from '../realtime.service';

const now = new Date();

type StoryScenario = 'default' | 'payment' | 'auto-only' | 'existing';
type RankedApiState = 'ready' | 'loading' | 'error';

interface RankedStoryArgs {
  apiState: RankedApiState;
  scenario: StoryScenario;
  eventCount: number;
  latencyMs: number;
  maxCourses: number;
  maxLectures: number;
  maxOther: number;
  availableSlots: number;
  soldOutEvery: number;
  autoSubscribeEvery: number;
  queueBase: number;
  eventNamePrefix: string;
}

const defaultArgs: RankedStoryArgs = {
  apiState: 'ready',
  scenario: 'default',
  eventCount: 8,
  latencyMs: 120,
  maxCourses: 2,
  maxLectures: 3,
  maxOther: 1,
  availableSlots: 12,
  soldOutEvery: 5,
  autoSubscribeEvery: 0,
  queueBase: 0,
  eventNamePrefix: '',
};

let activeArgs = defaultArgs;

const meta: Meta<RankedStoryArgs> = {
  component: RankedMajorEventSubscription,
  title: 'CACiC Eventos/Major Events/Registration/Ranked',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    apiState: { control: 'select', options: ['ready', 'loading', 'error'] },
    scenario: { control: 'select', options: ['default', 'payment', 'auto-only', 'existing'] },
    eventCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    maxCourses: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    maxLectures: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    maxOther: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    availableSlots: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    soldOutEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    autoSubscribeEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    queueBase: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    eventNamePrefix: { control: 'text' },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {} };
  },
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
    msw: { handlers: { graphql: [rankedHandler()] } },
  },
};

export default meta;

type Story = StoryObj<RankedStoryArgs>;

interface RankedStoryData {
  majorEvent: PublicMajorEvent;
  events: PublicEvent[];
  forms: PublicEventForm[];
  subscription: CurrentUserMajorEventSubscription | null;
}

const isoDaysFromNow = (days: number, hour: number): string => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

function createMajorEvent(scenario: StoryScenario, args: RankedStoryArgs): PublicMajorEvent {
  return createPublicMajorEvent({
    id: 'major-1',
    name: scenario === 'payment' ? 'SECOMPP Preferencial' : 'CACiC Preferencial',
    emoji: faker.helpers.arrayElement(['💻', '🚀', '🎓']),
    startDate: isoDaysFromNow(10, 9),
    endDate: isoDaysFromNow(13, 18),
    description: faker.lorem.paragraphs(2),
    subscriptionStartDate: isoDaysFromNow(-5, 8),
    subscriptionEndDate: isoDaysFromNow(6, 23),
    maxCoursesPerAttendee: scenario === 'auto-only' ? 1 : args.maxCourses,
    maxLecturesPerAttendee: scenario === 'auto-only' ? 1 : args.maxLectures,
    maxUncategorizedPerAttendee: scenario === 'auto-only' ? 1 : args.maxOther,
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
    paymentInfo: createPublicPaymentInfo({
      id: 'payment-1',
      bankName: 'Banco Storybook',
      agency: '0001',
      account: '12345-6',
      holder: 'CACiC FCT',
      document: '12.345.678/0001-90',
      pixKey: 'pagamentos@example.com',
      pixCity: 'PRESIDENTE PRUDENTE',
      majorEventId: 'major-1',
    }),
    majorEventPrices: [
      createPublicMajorEventPrice({
        id: 'price-1',
        type: 'TIERED',
        tiers: [
          { id: 'tier-student', name: 'Estudante', value: 2500, includesSportsRegistration: false },
          { id: 'tier-community', name: 'Comunidade', value: 5000, includesSportsRegistration: false },
        ],
      }),
    ],
  });
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
    availableSlots?: number;
    queueCount?: number;
    namePrefix?: string;
  } = {},
): PublicEvent {
  const eventGroupId = options.eventGroupId === undefined ? `group-${(index % 2) + 1}` : options.eventGroupId;
  const eventGroup = eventGroupId
    ? createPublicEventGroup({
        id: eventGroupId,
        name: options.eventGroupName ?? faker.helpers.arrayElement(['Trilha Web', 'Trilha Dados']),
        emoji: options.eventGroupEmoji ?? faker.helpers.arrayElement(['🌐', '📊']),
        shouldIssueCertificateForEachEvent: true,
        shouldIssuePartialCertificate: true,
        shouldIssueCertificate: true,
      })
    : null;
  const type = options.type ?? faker.helpers.arrayElement<EventType>(['MINICURSO', 'PALESTRA', 'OTHER']);
  return createPublicEvent({
    id: `event-${index + 1}`,
    name: `${options.namePrefix?.trim() ? `${options.namePrefix.trim()} ` : ''}${faker.helpers.arrayElement([
      'Arquitetura Angular com Signals',
      'OCR aplicado a eventos acadêmicos',
      'Observabilidade para APIs GraphQL',
      'Acessibilidade em produtos digitais',
      'Design systems para produtos públicos',
      'Segurança prática em APIs',
    ])}`,
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
    eventGroup,
    allowSubscription: true,
    subscriptionStartDate: isoDaysFromNow(-3, 8),
    subscriptionEndDate: isoDaysFromNow(index + 9, 23),
    slots: 40,
    slotsAvailable: options.hasAvailableSlots === false ? 0 : (options.availableSlots ?? 12),
    queueCount: (options.queueCount ?? 0) + index,
    autoSubscribe: options.autoSubscribe ?? false,
    shouldIssueCertificate: true,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: index % 2 === 0,
    onlineAttendanceStartDate: isoDaysFromNow(index + 10, 8),
    onlineAttendanceEndDate: isoDaysFromNow(index + 10, 18),
    isPubliclyListed: true,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
  });
}

function createStoryData(scenario: StoryScenario, args: RankedStoryArgs = activeArgs): RankedStoryData {
  faker.seed(20260520 + scenario.length);
  const majorEvent = createMajorEvent(scenario, args);
  const allAuto = scenario === 'auto-only';
  const eventCount = Math.max(0, Math.min(30, Math.round(args.eventCount)));
  const events = Array.from({ length: eventCount }, (_, index) => {
    const eventGroupId = index % 5 === 0 ? null : index % 2 === 0 ? 'group-data' : 'group-web';
    const autoSubscribe =
      index === 0 ||
      allAuto ||
      (args.autoSubscribeEvery > 0 && (index + 1) % Math.round(args.autoSubscribeEvery) === 0);
    const soldOut = args.soldOutEvery > 0 && (index + 1) % Math.round(args.soldOutEvery) === 0;
    return createEvent(index, majorEvent, {
      autoSubscribe,
      eventGroupId,
      eventGroupName: eventGroupId === 'group-web' ? 'Trilha Web' : 'Trilha Dados',
      eventGroupEmoji: eventGroupId === 'group-web' ? '🌐' : '📊',
      type: index % 3 === 0 ? 'OTHER' : index % 3 === 1 ? 'MINICURSO' : 'PALESTRA',
      hasAvailableSlots: !soldOut,
      availableSlots: Math.max(0, Math.round(args.availableSlots)),
      queueCount: Math.max(0, Math.round(args.queueBase)),
      namePrefix: args.eventNamePrefix,
    });
  });
  const selectedEvents = scenario === 'existing' ? events.slice(0, 4) : [];
  const eventForm = events[1]
    ? createPublicEventForm({
        id: 'ranked-form-event-accessibility',
        name: 'Preferência da atividade',
        responseMode: 'ONE_PER_TARGET',
        elementsJson: JSON.stringify([
          {
            id: 'accessibility',
            type: 'singleChoice',
            title: 'Precisa de recurso de acessibilidade?',
            required: true,
            options: [
              { id: 'yes', label: 'Sim' },
              { id: 'no', label: 'Não' },
            ],
          },
        ]),
        links: [
          createPublicEventFormLink({
            id: 'ranked-link-event-accessibility',
            formId: 'ranked-form-event-accessibility',
            targetType: 'EVENT',
            eventId: events[1].id,
            majorEventId: null,
            target: {
              type: 'EVENT',
              id: events[1].id,
              name: events[1].name,
              emoji: events[1].emoji,
            },
            displayOrder: 1,
          }),
        ],
      })
    : null;
  return {
    majorEvent,
    events,
    forms: [
      createPublicEventForm({
        id: 'ranked-form-major-shirt',
        name: 'Camiseta do evento',
        responseMode: 'SINGLE_PER_FORM',
        links: [
          createPublicEventFormLink({
            id: 'ranked-link-major-shirt',
            formId: 'ranked-form-major-shirt',
            targetType: 'MAJOR_EVENT',
            eventId: null,
            majorEventId: majorEvent.id,
            target: {
              type: 'MAJOR_EVENT',
              id: majorEvent.id,
              name: majorEvent.name,
              emoji: majorEvent.emoji,
            },
            displayOrder: 0,
          }),
        ],
      }),
      ...(eventForm ? [eventForm] : []),
    ],
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

function rankedHandler() {
  return http.post('/api/graphql', async ({ request }) => {
    const args = activeArgs;
    if (args.apiState === 'loading') {
      await delay('infinite');
    }
    if (args.latencyMs > 0) {
      await delay(args.latencyMs);
    }
    if (args.apiState === 'error') {
      return HttpResponse.json({ errors: [{ message: 'Não foi possível carregar a inscrição preferencial.' }] });
    }
    const storyData = createStoryData(args.scenario, args);
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
              hasAvailableSlots: event.slotsAvailable == null || event.slotsAvailable > 0,
              availableSlots: event.slotsAvailable,
              projectedQueuePosition: (event.queueCount ?? 0) + 1,
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

    if (query.includes('CurrentUserEventForms')) {
      const targetType = String(body.variables?.['targetType']);
      const targetId =
        targetType === 'EVENT' ? String(body.variables?.['eventId']) : String(body.variables?.['majorEventId']);
      return HttpResponse.json({
        data: {
          currentUserEventForms: storyData.forms.filter((form) =>
            form.links.some(
              (link) =>
                link.targetType === targetType &&
                (targetType === 'EVENT' ? link.eventId === targetId : link.majorEventId === targetId),
            ),
          ),
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

    if (query.includes('SubmitCurrentUserEventFormResponse')) {
      const input = body.variables?.['input'] as Record<string, unknown>;
      return HttpResponse.json({
        data: {
          submitCurrentUserEventFormResponse: {
            id: `response-${String(input['formId'])}`,
            formId: input['formId'],
            linkId: input['linkId'] ?? null,
            targetType: input['targetType'],
            eventId: input['eventId'] ?? null,
            majorEventId: input['majorEventId'] ?? null,
            personId: 'person-storybook',
            respondentName: 'Storybook User',
            respondentEmail: 'storybook@example.com',
            answersJson: input['answersJson'],
            source: 'SUBSCRIPTION_FLOW',
            submittedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
        },
      });
    }

    return HttpResponse.json({ data: {} });
  });
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

export const Playground: Story = {
  globals: { theme: 'dark', network: 'online', motion: 'reduced' },
  play: async ({ canvasElement }) => expectSelectionStep(canvasElement),
};

export const Ranking: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => goToRankingStep(canvasElement),
};

export const RankingWithFormsFlow: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    await goToRankingStep(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /Inscrever-se/i }));
    const dialog = within(await screen.findByRole('dialog', { name: /Confirmar inscrição/i }));
    await expect(await dialog.findByText('Formulários')).toBeVisible();
    await expect(await dialog.findByText('Camiseta do evento')).toBeVisible();
    await expect(await dialog.findByText('Preferência da atividade')).toBeVisible();
    await userEvent.click(await dialog.findByRole('radio', { name: 'M' }));
    await userEvent.click(await dialog.findByRole('radio', { name: 'Sim' }));
    await userEvent.click(await dialog.findByRole('button', { name: /Inscrever-se/i }));
  },
};

export const PaymentRanking: Story = {
  args: { scenario: 'payment' },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    await goToRankingStep(canvasElement);
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Preço')).toBeVisible();
    await expect(await canvas.findByText('Estudante')).toBeVisible();
  },
};

export const AutomaticOnly: Story = {
  args: { scenario: 'auto-only' },
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
  args: { scenario: 'existing' },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Comprovante em análise')).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: /ordenar preferências/i }));
    await expect(await canvas.findByText('Atualizar inscrição')).toBeVisible();
  },
};

export const DenseCatalog: Story = {
  args: {
    eventCount: 30,
    maxCourses: 8,
    maxLectures: 8,
    maxOther: 6,
    soldOutEvery: 4,
    autoSubscribeEvery: 7,
    queueBase: 18,
  },
  globals: { theme: 'light', network: 'online', viewport: { value: 'responsive' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Voto preferencial')).toBeVisible();
    await expect(await canvas.findAllByRole('checkbox')).toHaveLength(30);
  },
};

export const EmptyCatalog: Story = {
  args: { eventCount: 0, maxCourses: 0, maxLectures: 0, maxOther: 0 },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Voto preferencial')).toBeVisible();
    await expect(canvas.queryAllByRole('checkbox')).toHaveLength(0);
  },
};

export const Loading: Story = {
  args: { apiState: 'loading', latencyMs: 0 },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Carregando inscrição...')).toBeVisible();
  },
};

export const LoadError: Story = {
  args: { apiState: 'error', latencyMs: 0 },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/não foi possível carregar a inscrição preferencial/i),
    ).toBeVisible();
  },
};

export const LongContent: Story = {
  args: {
    eventCount: 14,
    eventNamePrefix: 'Atividade interdisciplinar avançada com práticas inclusivas, observabilidade e segurança',
  },
  globals: { theme: 'light', network: 'online', viewport: { value: 'mobile1' } },
};
