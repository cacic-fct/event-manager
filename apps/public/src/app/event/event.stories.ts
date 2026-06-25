import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { Event } from './event';

interface EventStoryArgs {
  allowSubscription: boolean;
  includeMajorEvent: boolean;
}

const defaultArgs: EventStoryArgs = {
  allowSubscription: true,
  includeMajorEvent: true,
};

interface EventStoryContext {
  args: EventStoryArgs;
}

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
    allowSubscription: { control: 'boolean' },
    includeMajorEvent: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<EventStoryArgs>;

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

function createStoryContext(args: Partial<EventStoryArgs> = {}): EventStoryContext {
  return {
    args: { ...defaultArgs, ...args },
  };
}

function renderStory(args: EventStoryArgs, context: EventStoryContext) {
  context.args = { ...defaultArgs, ...args };
  return { props: {} };
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
  faker.seed(20260804);
  const event = buildEvent(args);
  return {
    previewAt: '2026-08-01T12:00:00.000Z',
    expiresAt: '2026-08-01T13:00:00.000Z',
    event,
  };
}

function buildEvent(args: EventStoryArgs) {
  const majorEvent = args.includeMajorEvent
    ? {
        id: 'major-preview',
        name: 'SECOMPP 2026',
        emoji: '💻',
        startDate: '2026-08-01T12:00:00.000Z',
        endDate: '2026-08-04T21:00:00.000Z',
        description: faker.lorem.paragraph(),
        subscriptionStartDate: '2026-07-01T12:00:00.000Z',
        subscriptionEndDate: '2026-07-31T21:00:00.000Z',
        maxCoursesPerAttendee: 2,
        maxLecturesPerAttendee: 4,
        maxUncategorizedPerAttendee: 1,
        rankedSubscriptionEnabled: true,
        buttonText: 'Site oficial',
        buttonLink: 'https://cacic.dev',
        contactInfo: 'eventos@example.com',
        contactType: 'EMAIL',
        isPaymentRequired: false,
        additionalPaymentInfo: null,
        shouldIssueCertificate: true,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        paymentInfo: null,
        majorEventPrices: [],
      }
    : null;

  return {
    id: 'event-preview',
    name: faker.helpers.arrayElement(['Workshop Docker', 'Palestra Segurança na Web', 'Minicurso Angular']),
    creditMinutes: 120,
    startDate: '2026-08-02T13:00:00.000Z',
    endDate: '2026-08-02T15:00:00.000Z',
    emoji: '🔐',
    type: 'MINICURSO',
    description: faker.lorem.paragraphs(2),
    shortDescription: faker.lorem.sentence(),
    latitude: -22.1211,
    longitude: -51.4086,
    locationDescription: 'Laboratório 1',
    majorEventId: majorEvent?.id ?? null,
    majorEvent,
    eventGroupId: null,
    eventGroup: null,
    allowSubscription: args.allowSubscription,
    subscriptionStartDate: '2026-07-01T12:00:00.000Z',
    subscriptionEndDate: '2026-08-01T12:00:00.000Z',
    slots: 40,
    slotsAvailable: 12,
    queueCount: 0,
    autoSubscribe: false,
    shouldIssueCertificate: true,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: false,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    publiclyVisible: true,
    youtubeCode: null,
    buttonText: 'Material de apoio',
    buttonLink: 'https://cacic.dev',
    lecturers: [
      {
        id: 'lecturer-preview',
        displayName: faker.person.fullName(),
        biography: faker.lorem.paragraph(),
        publishGoogleUserPicture: false,
        googleUserPicture: null,
        email: faker.internet.email(),
        whatsapp: '+5518999999999',
      },
    ],
  };
}
