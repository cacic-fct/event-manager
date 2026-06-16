import type { Meta, StoryObj } from '@storybook/angular';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { expect, userEvent, within } from 'storybook/test';
import type { EventType, PublicEvent, PublicMajorEvent } from '@cacic-fct/shared-utils';
import { CalendarEventListItem } from './calendar-event-list-item';

faker.seed(20260616);

type CalendarEventListItemStoryArgs = {
  name: string;
  type: EventType;
  context: 'major-event' | 'event-group' | 'short-description';
  slotsAvailable: number;
  queueCount: number;
  returnUrl: string;
};

const meta: Meta<CalendarEventListItemStoryArgs> = {
  component: CalendarEventListItem,
  title: 'Public/Tabs/Calendar/Calendar Event List Item',
  tags: ['autodocs'],
  args: {
    name: 'Arquitetura Angular com Signals',
    type: 'MINICURSO',
    context: 'major-event',
    slotsAvailable: 12,
    queueCount: 3,
    returnUrl: '/calendar',
  },
  argTypes: {
    name: { control: 'text' },
    type: { control: 'select', options: ['MINICURSO', 'PALESTRA', 'OTHER'] },
    context: { control: 'select', options: ['major-event', 'event-group', 'short-description'] },
    slotsAvailable: { control: { type: 'range', min: 0, max: 80, step: 1 } },
    queueCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    returnUrl: { control: 'text' },
  },
  render: (args) => ({
    props: {
      event: createDemoEvent(args),
      returnUrl: args.returnUrl,
    },
  }),
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarEventListItemStoryArgs>;

const demoMajorEvent: PublicMajorEvent = {
  id: 'major-story',
  name: 'CACiC Storybook',
  emoji: '💻',
  startDate: '2026-05-20T12:00:00.000Z',
  endDate: '2026-05-23T21:00:00.000Z',
  description: 'Evento de demonstração para Storybook.',
  subscriptionStartDate: '2026-05-01T12:00:00.000Z',
  subscriptionEndDate: '2026-05-19T21:00:00.000Z',
  maxCoursesPerAttendee: 2,
  maxLecturesPerAttendee: 8,
  buttonText: 'Site oficial',
  buttonLink: 'https://example.com',
  contactInfo: 'eventos@example.com',
  contactType: 'EMAIL',
  isPaymentRequired: false,
  additionalPaymentInfo: null,
  shouldIssueCertificate: true,
};

const demoEvent: PublicEvent = {
  id: 'event-story',
  name: 'Arquitetura Angular com Signals',
  creditMinutes: 120,
  startDate: '2026-05-21T17:00:00.000Z',
  endDate: '2026-05-21T19:00:00.000Z',
  emoji: '🧠',
  type: 'MINICURSO' as const,
  description: 'Uma sessão prática com estados, efeitos e componentes standalone.',
  shortDescription: 'Signals na prática',
  latitude: -22.1211,
  longitude: -51.4086,
  locationDescription: 'Laboratório 01',
  majorEventId: demoMajorEvent.id,
  majorEvent: demoMajorEvent,
  eventGroupId: 'group-story',
  eventGroup: {
    id: 'group-story',
    name: 'Trilha Frontend',
    emoji: '✨',
    shouldIssueCertificateForEachEvent: true,
    shouldIssuePartialCertificate: true,
    shouldIssueCertificate: true,
  },
  allowSubscription: true,
  subscriptionStartDate: '2026-05-01T12:00:00.000Z',
  subscriptionEndDate: '2026-05-21T16:00:00.000Z',
  slots: 40,
  slotsAvailable: 12,
  queueCount: 3,
  autoSubscribe: false,
  shouldIssueCertificate: true,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: true,
  onlineAttendanceStartDate: '2026-05-21T17:00:00.000Z',
  onlineAttendanceEndDate: '2026-05-21T19:00:00.000Z',
  publiclyVisible: true,
  youtubeCode: null,
  buttonText: null,
  buttonLink: null,
};

function createDemoEvent(args: CalendarEventListItemStoryArgs): PublicEvent {
  faker.seed(20260616 + args.slotsAvailable + args.queueCount);
  return {
    ...demoEvent,
    name: args.name,
    type: args.type,
    shortDescription:
      args.context === 'short-description' ? faker.helpers.arrayElement(['Signals na prática', 'Sessão aberta']) : null,
    majorEvent: args.context === 'major-event' ? demoMajorEvent : null,
    eventGroup:
      args.context === 'event-group'
        ? {
            id: 'group-story',
            name: 'Trilha Frontend',
            emoji: '✨',
            shouldIssueCertificateForEachEvent: true,
            shouldIssuePartialCertificate: true,
            shouldIssueCertificate: true,
          }
        : null,
    slotsAvailable: args.slotsAvailable,
    queueCount: args.queueCount,
  };
}

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

export const OnlineDesktop: Story = {
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OnlineMobile: Story = {
  args: {
    name: 'Palestra noturna com descrição longa para responsividade',
    type: 'PALESTRA',
    context: 'event-group',
    returnUrl: '/calendar?view=week',
  },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {
    context: 'short-description',
    slotsAvailable: 0,
    queueCount: 8,
  },
  parameters: {
    viewport: { defaultViewport: 'tablet' },
  },
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
