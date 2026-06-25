import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { MajorEvent } from './major-event';

interface MajorEventStoryArgs {
  requiresPayment: boolean;
  rankedSubscriptionEnabled: boolean;
}

const defaultArgs: MajorEventStoryArgs = {
  requiresPayment: false,
  rankedSubscriptionEnabled: true,
};

interface MajorEventStoryContext {
  args: MajorEventStoryArgs;
}

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
  title: 'Public/Major Event/Major Event',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    requiresPayment: { control: 'boolean' },
    rankedSubscriptionEnabled: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<MajorEventStoryArgs>;

const previewContext = createStoryContext();

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
  args: {},
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

function createStoryContext(args: Partial<MajorEventStoryArgs> = {}): MajorEventStoryContext {
  return {
    args: { ...defaultArgs, ...args },
  };
}

function renderStory(args: MajorEventStoryArgs, context: MajorEventStoryContext) {
  context.args = { ...defaultArgs, ...args };
  return { props: {} };
}

function previewParameters(context: MajorEventStoryContext) {
  return {
    msw: {
      handlers: [
        http.post('/api/graphql', () =>
          HttpResponse.json({
            data: {
              publicContentPreview: {
                expiresAt: '2026-08-01T13:00:00.000Z',
                majorEvent: buildMajorEvent(context.args),
              },
            },
          }),
        ),
      ],
    },
  };
}

function buildMajorEvent(args: MajorEventStoryArgs) {
  faker.seed(20260803);
  return {
    id: 'major-preview',
    name: faker.helpers.arrayElement(['SECOMP 2026', 'CACiC 2026']),
    emoji: '💻',
    startDate: '2026-08-01T12:00:00.000Z',
    endDate: '2026-08-04T21:00:00.000Z',
    description: faker.lorem.paragraphs(2),
    subscriptionStartDate: '2026-07-01T12:00:00.000Z',
    subscriptionEndDate: '2026-07-31T21:00:00.000Z',
    maxCoursesPerAttendee: 2,
    maxLecturesPerAttendee: 4,
    maxUncategorizedPerAttendee: 1,
    rankedSubscriptionEnabled: args.rankedSubscriptionEnabled,
    buttonText: 'Site oficial',
    buttonLink: 'https://cacic.dev',
    contactInfo: 'eventos@example.com',
    contactType: 'EMAIL',
    isPaymentRequired: args.requiresPayment,
    additionalPaymentInfo: args.requiresPayment ? 'Pagamento validado por comprovante.' : null,
    shouldIssueCertificate: true,
    shouldIssueCertificateForNonPayingAttendees: false,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    paymentInfo: args.requiresPayment
      ? {
          id: 'payment-preview',
          bankName: 'Banco Storybook',
          agency: '0001',
          account: '12345-6',
          holder: 'CACiC FCT',
          document: '12.345.678/0001-90',
          pixKey: 'pagamentos@example.com',
          pixCity: 'PRESIDENTE PRUDENTE',
          majorEventId: 'major-preview',
        }
      : null,
    majorEventPrices: args.requiresPayment
      ? [
          {
            id: 'price-preview',
            type: 'STUDENT',
            tiers: [{ id: 'tier-preview', name: 'Estudante', value: 2500 }],
          },
        ]
      : [],
  };
}
