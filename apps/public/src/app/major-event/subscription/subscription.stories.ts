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
import { HttpResponse, http } from 'msw';
import { NEVER } from 'rxjs';
import { expect, screen, userEvent, within } from 'storybook/test';
import { MajorEventSubscription } from './subscription';
import { MajorEventSubscriptionRealtimeService } from './subscription-realtime.service';

const now = new Date('2026-07-01T12:00:00.000-03:00');

interface SubscriptionStoryData {
  majorEvent: PublicMajorEvent;
  events: PublicEvent[];
  forms: PublicEventForm[];
}

const meta: Meta<MajorEventSubscription> = {
  component: MajorEventSubscription,
  title: 'Public/Major Event/Subscription/Subscription',
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

type Story = StoryObj<MajorEventSubscription>;
type StoryScenario = 'forms' | 'existing';

const isoDaysFromNow = (days: number, hour: number): string => {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

function createStoryData(scenario: StoryScenario): SubscriptionStoryData {
  faker.seed(20260701 + scenario.length);
  const majorEvent = createPublicMajorEvent({
    id: 'major-1',
    name: 'CACiC Inscrições',
    emoji: 'computer',
    startDate: isoDaysFromNow(15, 9),
    endDate: isoDaysFromNow(17, 18),
    description: faker.lorem.paragraph(),
    subscriptionStartDate: isoDaysFromNow(-3, 8),
    subscriptionEndDate: isoDaysFromNow(10, 23),
    rankedSubscriptionEnabled: false,
    isPaymentRequired: false,
    majorEventPrices: [],
  });
  const events = [
    createPublicEvent({
      id: 'event-1',
      name: 'Oficina de Angular',
      shortDescription: 'Componentes standalone e signals.',
      emoji: 'integration_instructions',
      type: 'MINICURSO',
      startDate: isoDaysFromNow(15, 9),
      endDate: isoDaysFromNow(15, 12),
      majorEventId: majorEvent.id,
      majorEvent,
      eventGroupId: null,
      eventGroup: null,
      subscriptionStartDate: isoDaysFromNow(-3, 8),
      subscriptionEndDate: isoDaysFromNow(10, 23),
      autoSubscribe: false,
    }),
    createPublicEvent({
      id: 'event-2',
      name: 'Palestra de acessibilidade',
      shortDescription: 'Critérios práticos para interfaces públicas.',
      emoji: 'accessibility_new',
      type: 'PALESTRA',
      startDate: isoDaysFromNow(15, 14),
      endDate: isoDaysFromNow(15, 16),
      majorEventId: majorEvent.id,
      majorEvent,
      eventGroupId: null,
      eventGroup: null,
      subscriptionStartDate: isoDaysFromNow(-3, 8),
      subscriptionEndDate: isoDaysFromNow(10, 23),
      autoSubscribe: false,
    }),
  ];

  return {
    majorEvent,
    events,
    forms: [
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
            eventId: events[0].id,
            majorEventId: null,
            target: {
              type: 'EVENT',
              id: events[0].id,
              name: events[0].name,
              emoji: events[0].emoji,
            },
            displayOrder: 1,
          }),
        ],
      }),
    ],
  };
}

function subscriptionHandlers(scenario: StoryScenario) {
  const storyData = createStoryData(scenario);
  return [
    http.post('/api/graphql', async ({ request }) => {
      const body = (await request.json()) as { query?: string; variables?: Record<string, unknown> };
      const query = body.query ?? '';
      const variables = body.variables ?? {};
      const selectedEventIds = Array.isArray(variables['selectedEventIds'])
        ? variables['selectedEventIds'].map(String)
        : [storyData.events[0].id];

      if (query.includes('PublicMajorEventSubscriptionPage')) {
        return HttpResponse.json({
          data: {
            publicMajorEventSubscriptionPage: {
              majorEvent: storyData.majorEvent,
              events: storyData.events,
              subscriptionSummaries: storyData.events.map((event) => ({ eventId: event.id, hasAvailableSlots: true })),
            },
          },
        });
      }

      if (query.includes('CurrentUserMajorEventSubscription')) {
        return HttpResponse.json({
          data: {
            currentUserMajorEventSubscription:
              scenario === 'existing'
                ? {
                    id: 'subscription-major-1',
                    majorEventId: storyData.majorEvent.id,
                    subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
                    amountPaid: null,
                    paymentDate: null,
                    paymentTier: null,
                    majorEvent: storyData.majorEvent,
                    selectedEvents: [storyData.events[0]],
                  }
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
        const selectedEvents = storyData.events.filter((event) => selectedEventIds.includes(event.id));
        return HttpResponse.json({
          data: {
            upsertCurrentUserMajorEventSubscription: {
              id: 'subscription-major-1',
              majorEventId: storyData.majorEvent.id,
              subscriptionStatus: 'CONFIRMED',
              amountPaid: null,
              paymentDate: null,
              paymentTier: null,
              majorEvent: storyData.majorEvent,
              selectedEvents,
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
    }),
  ];
}

async function completeSubscriptionFlow(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('checkbox', { name: /Selecionar Oficina de Angular/i }));
  await userEvent.click(await canvas.findByRole('button', { name: /Inscrever-se/i }));

  const dialog = within(await screen.findByRole('dialog', { name: /Confirmar inscrição/i }));
  await expect(await dialog.findByText('Formulários')).toBeVisible();
  await expect(await dialog.findByText('Camiseta do evento')).toBeVisible();
  await expect(await dialog.findByText('Preferência da oficina')).toBeVisible();
  await userEvent.click(await dialog.findByRole('radio', { name: 'M' }));
  await userEvent.click(await dialog.findByRole('radio', { name: 'Sim' }));
  await userEvent.click(await dialog.findByRole('button', { name: /Inscrever-se/i }));
}

export const FormsInSubscriptionFlow: Story = {
  parameters: {
    msw: { handlers: subscriptionHandlers('forms') },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => completeSubscriptionFlow(canvasElement),
};

export const ExistingSubscriptionWithForms: Story = {
  parameters: {
    msw: { handlers: subscriptionHandlers('existing') },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Comprovante em análise')).toBeVisible();
    await expect(await canvas.findByText('Oficina de Angular')).toBeVisible();
  },
};
