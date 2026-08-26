import type { PublicEvent, PublicEventForm, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import {
  createPublicEvent,
  createPublicEventForm,
  createPublicEventFormLink,
  createPublicMajorEvent,
} from '@cacic-fct/event-manager-public-testing';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { HttpResponse, delay, http } from 'msw';
import { NEVER } from 'rxjs';
import { expect, screen, userEvent, within } from 'storybook/test';
import { MajorEventSubscriptionRealtimeService } from '../realtime.service';
import { MajorEventSubscription } from './subscription';

type SubscriptionApiState = 'ready' | 'loading' | 'error';
type SubscriptionFormMode = 'none' | 'major-event' | 'event' | 'both';

interface SubscriptionStoryArgs {
  apiState: SubscriptionApiState;
  eventCount: number;
  latencyMs: number;
  existingSubscription: boolean;
  subscriptionStatus: string;
  formMode: SubscriptionFormMode;
  majorEventName: string;
  description: string;
  requiresPayment: boolean;
  requiresLicenseAgreement: boolean;
  slotsAvailable: number;
  fullEvery: number;
  queueCount: number;
  longEventNames: boolean;
}

interface SubscriptionStoryData {
  majorEvent: PublicMajorEvent;
  events: PublicEvent[];
  forms: PublicEventForm[];
}

const defaultArgs: SubscriptionStoryArgs = {
  apiState: 'ready',
  eventCount: 8,
  latencyMs: 120,
  existingSubscription: false,
  subscriptionStatus: 'CONFIRMED',
  formMode: 'both',
  majorEventName: 'CACiC Inscrições',
  description: 'Grande evento de demonstração com seleção de atividades e formulários condicionais.',
  requiresPayment: false,
  requiresLicenseAgreement: true,
  slotsAvailable: 18,
  fullEvery: 4,
  queueCount: 3,
  longEventNames: false,
};

let activeArgs = defaultArgs;
const now = new Date();

const meta: Meta<SubscriptionStoryArgs> = {
  component: MajorEventSubscription,
  title: 'CACiC Eventos/Major Events/Registration/Standard/Subscription',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    apiState: { control: 'select', options: ['ready', 'loading', 'error'] },
    eventCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    existingSubscription: { control: 'boolean' },
    subscriptionStatus: {
      control: 'select',
      options: [
        'CONFIRMED',
        'WAITING_RECEIPT_UPLOAD',
        'RECEIPT_UNDER_REVIEW',
        'REJECTED_INVALID_RECEIPT',
        'REJECTED_NO_SLOTS',
        'CANCELED',
      ],
    },
    formMode: { control: 'select', options: ['none', 'major-event', 'event', 'both'] },
    majorEventName: { control: 'text' },
    description: { control: 'text' },
    requiresPayment: { control: 'boolean' },
    requiresLicenseAgreement: { control: 'boolean' },
    slotsAvailable: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    fullEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    queueCount: { control: { type: 'range', min: 0, max: 50, step: 1 } },
    longEventNames: { control: 'boolean' },
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
    a11y: { test: 'error' },
    msw: { handlers: { graphql: [subscriptionHandler()] } },
  },
};

export default meta;
type Story = StoryObj<SubscriptionStoryArgs>;

export const Playground: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => completeSubscriptionFlow(canvasElement),
};

export const DenseActivityCatalog: Story = {
  args: { eventCount: 30, fullEvery: 5, slotsAvailable: 24, formMode: 'none', latencyMs: 0 },
  play: async ({ canvasElement }) => {
    const checkboxes = await within(canvasElement).findAllByRole('checkbox', {}, { timeout: 5_000 });
    await expect(checkboxes).toHaveLength(30);
    await expect(checkboxes.filter((checkbox) => checkbox.hasAttribute('disabled'))).toHaveLength(6);
  },
};

export const Empty: Story = {
  args: { eventCount: 0, formMode: 'none', latencyMs: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Nenhuma atividade/i)).toBeVisible();
  },
};

export const Loading: Story = {
  args: { apiState: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('progressbar')).toBeVisible();
  },
};

export const LoadError: Story = {
  args: { apiState: 'error' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível carregar a inscrição.')).toBeVisible();
  },
};

export const ExistingSubscription: Story = {
  args: { existingSubscription: true, subscriptionStatus: 'RECEIPT_UNDER_REVIEW' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Comprovante em análise')).toBeVisible();
    await expect(await canvas.findByText('Oficina de Angular')).toBeVisible();
  },
};

export const ReceiptUploadRequired: Story = {
  args: { existingSubscription: true, requiresPayment: true, subscriptionStatus: 'WAITING_RECEIPT_UPLOAD' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Aguardando envio do comprovante/i)).toBeVisible();
  },
};

export const NoForms: Story = {
  args: { formMode: 'none', eventCount: 6, requiresLicenseAgreement: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findAllByRole('checkbox')).toHaveLength(6);
  },
};

export const LicenseAgreementOnly: Story = {
  args: { formMode: 'none', eventCount: 4, requiresLicenseAgreement: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: /Selecionar Oficina de Angular/i }));
    await userEvent.click(await canvas.findByRole('button', { name: /Continuar/i }));
    await expect(
      await canvas.findByRole('heading', { name: 'Contrato de concessão de licença de imagem' }),
    ).toBeVisible();
  },
};

export const LongContentMobile: Story = {
  args: {
    eventCount: 5,
    longEventNames: true,
    majorEventName: 'Congresso interdisciplinar universitário de tecnologia, ciência, cultura e acessibilidade',
    description:
      'Programação detalhada para validar o fluxo de inscrição com títulos, descrições e opções significativamente maiores que o conteúdo habitual.',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findAllByText(/Atividade interdisciplinar/)).length).toBeGreaterThan(3);
  },
};

function subscriptionHandler() {
  return http.post('/api/graphql', async ({ request }) => {
    const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
    const query = body.query ?? '';
    const variables = body.variables ?? {};

    if (activeArgs.apiState === 'loading') {
      await delay('infinite');
    } else if (activeArgs.latencyMs > 0) {
      await delay(activeArgs.latencyMs);
    }
    if (activeArgs.apiState === 'error') {
      return HttpResponse.json({ errors: [{ message: 'Não foi possível carregar a inscrição.' }] });
    }

    const storyData = createStoryData(activeArgs);
    const selectedEventIds = Array.isArray(variables['selectedEventIds'])
      ? variables['selectedEventIds'].map(String)
      : [storyData.events[0]?.id].filter((id): id is string => Boolean(id));

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
          currentUserMajorEventSubscription: activeArgs.existingSubscription
            ? buildExistingSubscription(storyData)
            : null,
        },
      });
    }
    if (query.includes('CurrentUserEventForms')) {
      const targetType = String(variables['targetType']);
      const targetId = targetType === 'EVENT' ? String(variables['eventId']) : String(variables['majorEventId']);
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
    if (query.includes('UpsertCurrentUserMajorEventSubscription')) {
      return HttpResponse.json({
        data: {
          upsertCurrentUserMajorEventSubscription: {
            id: 'subscription-major-1',
            majorEventId: storyData.majorEvent.id,
            subscriptionStatus: activeArgs.requiresPayment ? 'WAITING_RECEIPT_UPLOAD' : 'CONFIRMED',
            amountPaid: null,
            paymentDate: null,
            paymentTier: null,
            majorEvent: storyData.majorEvent,
            selectedEvents: storyData.events.filter((event) => selectedEventIds.includes(event.id)),
          },
        },
      });
    }
    if (query.includes('SubmitCurrentUserEventFormResponse')) {
      const input = variables['input'] as Record<string, unknown>;
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

function createStoryData(args: SubscriptionStoryArgs): SubscriptionStoryData {
  faker.seed(20_260_823);
  const majorEvent = createPublicMajorEvent({
    id: 'major-1',
    name: args.majorEventName,
    emoji: '💻',
    startDate: isoDaysFromNow(15, 9),
    endDate: isoDaysFromNow(17, 18),
    description: args.description,
    subscriptionStartDate: isoDaysFromNow(-3, 8),
    subscriptionEndDate: isoDaysFromNow(10, 23),
    rankedSubscriptionEnabled: false,
    isPaymentRequired: args.requiresPayment,
    requiresImageLicenseAgreement: args.requiresLicenseAgreement,
    majorEventPrices: [],
  });
  const count = Math.min(Math.max(Math.trunc(args.eventCount), 0), 30);
  const events = Array.from({ length: count }, (_, index) =>
    createPublicEvent({
      id: `event-${index + 1}`,
      name:
        index === 0
          ? 'Oficina de Angular'
          : args.longEventNames
            ? `Atividade interdisciplinar de tecnologia, ciência e acessibilidade ${index + 1}`
            : `${['Palestra de acessibilidade', 'Observabilidade para APIs', 'Robótica para a comunidade'][index % 3]} · ${faker.word.adjective()}`,
      shortDescription: faker.company.catchPhrase(),
      emoji: ['🧠', '♿', '📡', '🤖'][index % 4],
      type: ['MINICURSO', 'PALESTRA', 'OTHER'][index % 3] as PublicEvent['type'],
      startDate: isoDaysFromNow(15 + Math.floor(index / 6), 8 + (index % 6) * 2),
      endDate: isoDaysFromNow(15 + Math.floor(index / 6), 10 + (index % 6) * 2),
      majorEventId: majorEvent.id,
      majorEvent,
      eventGroupId: null,
      eventGroup: null,
      subscriptionStartDate: isoDaysFromNow(-3, 8),
      subscriptionEndDate: isoDaysFromNow(10, 23),
      slots: 40,
      slotsAvailable: args.fullEvery > 0 && (index + 1) % args.fullEvery === 0 ? 0 : args.slotsAvailable,
      queueCount: args.queueCount + index,
      autoSubscribe: false,
    }),
  );

  return { majorEvent, events, forms: createStoryForms(args.formMode, majorEvent, events[0]) };
}

function createStoryForms(
  mode: SubscriptionFormMode,
  majorEvent: PublicMajorEvent,
  firstEvent: PublicEvent | undefined,
): PublicEventForm[] {
  const forms: PublicEventForm[] = [];
  if (mode === 'major-event' || mode === 'both') {
    forms.push(
      createPublicEventForm({
        id: 'form-major-shirt',
        name: 'Camiseta do evento',
        responseMode: 'SINGLE_PER_FORM',
        links: [
          createPublicEventFormLink({
            id: 'link-major-shirt',
            formId: 'form-major-shirt',
            targetType: 'MAJOR_EVENT',
            eventId: null,
            majorEventId: majorEvent.id,
            target: { type: 'MAJOR_EVENT', id: majorEvent.id, name: majorEvent.name, emoji: majorEvent.emoji },
            displayOrder: 0,
          }),
        ],
      }),
    );
  }
  if ((mode === 'event' || mode === 'both') && firstEvent) {
    forms.push(
      createPublicEventForm({
        id: 'form-event-meal',
        name: 'Preferência da oficina',
        description: 'Resposta específica para a atividade selecionada.',
        responseMode: 'ONE_PER_TARGET',
        elementsJson: JSON.stringify([
          {
            id: 'meal',
            type: 'singleChoice',
            title: 'Precisa de opção vegetariana?',
            required: true,
            options: [
              { id: 'yes', label: 'Sim' },
              { id: 'no', label: 'Não' },
            ],
          },
        ]),
        links: [
          createPublicEventFormLink({
            id: 'link-event-meal',
            formId: 'form-event-meal',
            targetType: 'EVENT',
            eventId: firstEvent.id,
            majorEventId: null,
            target: { type: 'EVENT', id: firstEvent.id, name: firstEvent.name, emoji: firstEvent.emoji },
            displayOrder: 1,
          }),
        ],
      }),
    );
  }
  return forms;
}

function buildExistingSubscription(storyData: SubscriptionStoryData) {
  return {
    id: 'subscription-major-1',
    majorEventId: storyData.majorEvent.id,
    subscriptionStatus: activeArgs.subscriptionStatus,
    amountPaid: activeArgs.requiresPayment ? 2_500 : null,
    paymentDate: null,
    paymentTier: activeArgs.requiresPayment ? 'Estudante' : null,
    majorEvent: storyData.majorEvent,
    selectedEvents: storyData.events.slice(0, Math.min(3, storyData.events.length)),
  };
}

async function completeSubscriptionFlow(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('checkbox', { name: /Selecionar Oficina de Angular/i }));
  await userEvent.click(await canvas.findByRole('button', { name: /Continuar/i }));
  await userEvent.click(await canvas.findByRole('radio', { name: 'M' }));
  await userEvent.click(await canvas.findByRole('button', { name: /Continuar/i }));
  await expect(await canvas.findByRole('heading', { name: 'Preferência da oficina' })).toBeVisible();
  await userEvent.click(await canvas.findByRole('radio', { name: 'Sim' }));
  await userEvent.click(await canvas.findByRole('button', { name: /Continuar/i }));
  await userEvent.click(
    await canvas.findByRole('checkbox', { name: /Li e concordo com o contrato de concessão de licença de imagem/i }),
  );
  await userEvent.click(await canvas.findByRole('button', { name: /Revisar inscrição/i }));
  const dialog = within(await screen.findByRole('dialog', { name: /Revise sua inscrição/i }));
  await expect(await dialog.findByText('Tamanho da camiseta')).toBeVisible();
  await expect(await dialog.findByText('Precisa de opção vegetariana?')).toBeVisible();
  await userEvent.click(await dialog.findByRole('button', { name: /Confirmar inscrição/i }));
}

function isoDaysFromNow(days: number, hour: number): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}
