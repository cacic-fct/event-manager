import { provideHttpClient } from '@angular/common/http';
import { LOCALE_ID } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import {
  createPublicEvent,
  createPublicEventGroup,
  createPublicMajorEvent,
  publicFixtureDateFromNow,
} from '../testing/public-entity-fixtures';
import { GroupPreviewComponent } from './group-page';

interface GroupPreviewStoryArgs {
  eventCount: number;
  includeMajorEvent: boolean;
}

const defaultArgs: GroupPreviewStoryArgs = {
  eventCount: 3,
  includeMajorEvent: true,
};

interface GroupPreviewStoryContext {
  args: GroupPreviewStoryArgs;
}

const meta: Meta<GroupPreviewStoryArgs> = {
  component: GroupPreviewComponent,
  title: 'CACiC Eventos/Preview/Event Group',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        { provide: LOCALE_ID, useValue: 'pt-BR' },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'previewToken' ? 'storybook-preview-token' : null),
              },
            },
          },
        },
      ],
    }),
  ],
  args: defaultArgs,
  argTypes: {
    eventCount: { control: { type: 'range', min: 1, max: 8, step: 1 } },
    includeMajorEvent: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<GroupPreviewStoryArgs>;

const playgroundContext = createStoryContext();
const noMajorEventContext = createStoryContext({ includeMajorEvent: false });
const singleEventContext = createStoryContext({ eventCount: 1 });

export const Playground: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  render: (args) => renderStory(args, playgroundContext),
  parameters: storyParameters(playgroundContext),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Pré-Visualização')).toBeVisible();
    await expect(await canvas.findByText('Grupo de eventos')).toBeVisible();
  },
};

export const SemGrandeEvento: Story = {
  args: {
    includeMajorEvent: false,
  },
  globals: { theme: 'light' },
  render: (args) => renderStory(args, noMajorEventContext),
  parameters: storyParameters(noMajorEventContext),
};

export const EventoUnico: Story = {
  args: {
    eventCount: 1,
  },
  globals: { theme: 'light' },
  render: (args) => renderStory(args, singleEventContext),
  parameters: storyParameters(singleEventContext),
};

function createStoryContext(args: Partial<GroupPreviewStoryArgs> = {}): GroupPreviewStoryContext {
  return {
    args: { ...defaultArgs, ...args },
  };
}

function renderStory(args: GroupPreviewStoryArgs, context: GroupPreviewStoryContext) {
  context.args = { ...defaultArgs, ...args };
  return { props: {} };
}

function storyParameters(context: GroupPreviewStoryContext) {
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

function buildPreview(args: GroupPreviewStoryArgs) {
  faker.seed(20260802);
  const eventGroup = createPublicEventGroup({
    id: 'group-preview',
    name: 'Minicursos de Férias',
    emoji: '🧪',
    shouldIssueCertificate: true,
    shouldIssueCertificateForEachEvent: true,
    shouldIssuePartialCertificate: true,
  });
  const majorEvent = args.includeMajorEvent
    ? createPublicMajorEvent({
        id: 'major-preview',
        name: 'SECOMPP 2026',
        subscriptionStartDate: null,
        subscriptionEndDate: null,
      })
    : null;

  return {
    previewAt: publicFixtureDateFromNow(),
    expiresAt: publicFixtureDateFromNow(1, 13),
    eventGroup,
    events: Array.from({ length: args.eventCount }, (_, index) =>
      createPublicEvent({
        id: `event-${index}`,
        name: faker.helpers.arrayElement(['Minicurso Angular', 'Minicurso NestJS', 'Workshop Docker', 'Palestra Web']),
        creditMinutes: 120,
        startDate: publicFixtureDateFromNow(index + 1),
        endDate: publicFixtureDateFromNow(index + 1, 14),
        type: index % 2 === 0 ? 'MINICURSO' : 'PALESTRA',
        emoji: index % 2 === 0 ? '💻' : '🔐',
        description: faker.lorem.paragraph(),
        shortDescription: faker.lorem.sentence(),
        latitude: null,
        longitude: null,
        locationDescription: 'Auditório 1',
        majorEvent,
        eventGroup,
        allowSubscription: false,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        slots: null,
        slotsAvailable: null,
        queueCount: 0,
        autoSubscribe: false,
        shouldIssueCertificate: true,
        shouldCollectAttendance: true,
        isOnlineAttendanceAllowed: false,
        onlineAttendanceStartDate: null,
        onlineAttendanceEndDate: null,
        isPubliclyListed: true,
        youtubeCode: null,
        buttonText: null,
        buttonLink: null,
        lecturers: [],
      }),
    ),
  };
}
