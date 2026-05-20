import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import type { PublicEvent, PublicMajorEvent } from '@cacic-fct/shared-utils';
import { CalendarEventListItem } from './calendar-event-list-item';

const meta: Meta<CalendarEventListItem> = {
  component: CalendarEventListItem,
  title: 'Public/Tabs/Calendar/Calendar Event List Item',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarEventListItem>;

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
  args: { event: demoEvent, returnUrl: '/calendar' },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OnlineMobile: Story = {
  args: {
    event: { ...demoEvent, name: 'Palestra noturna com descrição longa para responsividade' },
    returnUrl: '/calendar?view=week',
  },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DarkMobile: Story = {
  args: { event: { ...demoEvent, id: 'cached-event', majorEvent: null }, returnUrl: '/offline' },
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'dark', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: { event: demoEvent, returnUrl: '/calendar' },
  parameters: {
    viewport: { defaultViewport: 'tablet' },
  },
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
