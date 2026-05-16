import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import type { PublicEvent, PublicMajorEvent } from '@cacic-fct/shared-utils';
import { CalendarWeekView } from './calendar-week-view';

const meta: Meta<CalendarWeekView> = {
  component: CalendarWeekView,
  title: 'Public/Tabs/Calendar/Calendar Week View',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CalendarWeekView>;

const demoMajorEvent: PublicMajorEvent = {
  id: 'major-story',
  name: 'CACIC Storybook',
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

const demoEvents: PublicEvent[] = [
  demoEvent,
  { ...demoEvent, id: 'event-story-2', name: 'Acessibilidade em produtos digitais', emoji: '♿', type: 'PALESTRA' as const, startDate: '2026-05-22T13:00:00.000Z', endDate: '2026-05-22T14:00:00.000Z', slotsAvailable: 0 },
  { ...demoEvent, id: 'event-story-3', name: 'Observabilidade para APIs GraphQL', emoji: '📡', type: 'OTHER' as const, startDate: '2026-06-02T18:00:00.000Z', endDate: '2026-06-02T20:00:00.000Z', eventGroup: null, eventGroupId: null },
];

const selectedDate = new Date('2026-05-21T12:00:00.000Z');
const weekDays = Array.from({ length: 7 }, (_, index) => ({ label: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][index], date: new Date(Date.UTC(2026, 4, 17 + index, 12)) }));


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

export const OnlineDesktop: Story = {
  args: { weekDays, selectedDate, events: demoEvents, canGoPrevious: true, returnUrl: '/calendar' },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OnlineMobile: Story = {
  args: { weekDays, selectedDate, events: demoEvents, canGoPrevious: true, returnUrl: '/calendar' },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DarkMobile: Story = {
  args: { weekDays, selectedDate, events: demoEvents.slice(0, 1), canGoPrevious: false, returnUrl: '/calendar?offline=true' },
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'dark', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: { weekDays, selectedDate, events: [], canGoPrevious: true, returnUrl: '/calendar' },
  parameters: {
    viewport: { defaultViewport: 'tablet' },
  },
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
