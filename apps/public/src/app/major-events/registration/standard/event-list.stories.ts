import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import {
  PublicEventCollectionStoryControls,
  createPublicStoryEvents,
  publicEventCollectionStoryControlArgTypes,
  publicEventCollectionStoryDefaultControls,
} from '../../../testing/public-event-story-fixtures';
import { SubscriptionEventList } from './event-list';

interface SubscriptionEventListStoryArgs extends PublicEventCollectionStoryControls {
  selectedFirstEvent: boolean;
  autoSelectSecondEvent: boolean;
  disableSoldOutEvents: boolean;
}

const defaultArgs: SubscriptionEventListStoryArgs = {
  ...publicEventCollectionStoryDefaultControls,
  selectedFirstEvent: true,
  autoSelectSecondEvent: false,
  disableSoldOutEvents: false,
};

const meta: Meta<SubscriptionEventListStoryArgs> = {
  component: SubscriptionEventList,
  title: 'CACiC Eventos/Major Events/Registration/Standard/Event List',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    ...publicEventCollectionStoryControlArgTypes,
    selectedFirstEvent: { control: 'boolean' },
    autoSelectSecondEvent: { control: 'boolean' },
    disableSoldOutEvents: { control: 'boolean' },
  },
  render: (args) => {
    const events = createPublicStoryEvents(args);
    const selectedEventIds = new Set<string>();
    const autoSelectedEventIds = new Set<string>();
    const firstEventId = events[0]?.id;
    const secondEventId = events[1]?.id;
    if (args.selectedFirstEvent && firstEventId !== undefined && firstEventId !== null) {
      selectedEventIds.add(firstEventId);
    }
    if (args.autoSelectSecondEvent && secondEventId !== undefined && secondEventId !== null) {
      autoSelectedEventIds.add(secondEventId);
    }

    return {
      props: {
        events,
        summariesByEventId: buildSummaries(events),
        selectedEventIds,
        autoSelectedEventIds,
        disabledReasons: args.disableSoldOutEvents ? buildDisabledReasons(events) : new Map(),
      },
    };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<SubscriptionEventListStoryArgs>;

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

export const Playground: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {
    selectedFirstEvent: false,
    autoSelectSecondEvent: false,
  },
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const SoldOutAndAutomaticSelection: Story = {
  args: {
    selectedFirstEvent: false,
    autoSelectSecondEvent: true,
    disableSoldOutEvents: true,
    slotsAvailable: 0,
    queueCount: 14,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText('Sem vagas disponíveis')[0]).toBeVisible();
  },
};

export const DenseGroupedCatalog: Story = {
  args: { eventCount: 30, selectedFirstEvent: true, autoSelectSecondEvent: true },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findAllByRole('checkbox')).toHaveLength(30);
  },
};

export const Empty: Story = {
  args: { eventCount: 0, selectedFirstEvent: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByRole('checkbox')).toHaveLength(0);
  },
};

export const UnlimitedAvailability: Story = {
  args: { eventCount: 8, slotsAvailable: -1, queueCount: 0 },
  render: (args) => {
    const events = createPublicStoryEvents(args).map((event) => ({ ...event, slotsAvailable: null }));
    return {
      props: {
        events,
        summariesByEventId: buildSummaries(events),
        selectedEventIds: new Set<string>(),
        autoSelectedEventIds: new Set<string>(),
        disabledReasons: new Map<string, string>(),
      },
    };
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findAllByText(/Vagas ilimitadas/)).toHaveLength(8);
  },
};

export const LongContentMobile: Story = {
  args: {
    eventCount: 6,
    name: 'Atividade interdisciplinar universitária de tecnologia, ciência, cultura e acessibilidade',
    eventGroupName: 'Trilha extensa de experiências acadêmicas e comunitárias',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Atividade interdisciplinar/)).toBeVisible();
  },
};

function buildSummaries(events: ReturnType<typeof createPublicStoryEvents>) {
  return new Map(
    events.map((item) => [
      item.id,
      {
        eventId: item.id,
        hasAvailableSlots: item.slotsAvailable == null || item.slotsAvailable > 0,
        availableSlots: item.slotsAvailable,
        projectedQueuePosition: (item.queueCount ?? 0) + 1,
      },
    ]),
  );
}

function buildDisabledReasons(events: ReturnType<typeof createPublicStoryEvents>) {
  return new Map(
    events
      .filter((event) => event.slotsAvailable != null && event.slotsAvailable <= 0)
      .map((event) => [event.id, 'Sem vagas disponíveis']),
  );
}
