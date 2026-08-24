import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { MajorEventSubscriptionsComponent } from './major-event-subscriptions.component';
import { createWorkspaceSubscriptionsStoryProviders } from './subscriptions-story-support';

interface MajorEventSubscriptionsStoryArgs {
  selectedMajorEvent: boolean;
  selectedSubscription: boolean;
  pendingReceiptsCount: number;
  majorEventCount: number;
  eventCount: number;
  subscriptionCount: number;
  longNames: boolean;
  sportsEvery: number;
  readOnly: boolean;
}

const defaultArgs: MajorEventSubscriptionsStoryArgs = {
  selectedMajorEvent: false,
  selectedSubscription: false,
  pendingReceiptsCount: 3,
  majorEventCount: 4,
  eventCount: 8,
  subscriptionCount: 5,
  longNames: false,
  sportsEvery: 3,
  readOnly: false,
};

const meta: Meta<MajorEventSubscriptionsStoryArgs> = {
  component: MajorEventSubscriptionsComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Subscriptions/Workspace Major Event Subscriptions Subtab',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    selectedMajorEvent: { control: 'boolean' },
    selectedSubscription: { control: 'boolean', if: { arg: 'selectedMajorEvent' } },
    pendingReceiptsCount: { control: { type: 'range', min: 0, max: 500, step: 1 } },
    majorEventCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    eventCount: { control: { type: 'range', min: 0, max: 40, step: 1 } },
    subscriptionCount: { control: { type: 'range', min: 0, max: 60, step: 1 } },
    longNames: { control: 'boolean' },
    sportsEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    readOnly: { control: 'boolean' },
  },
  decorators: [
    (story, context) =>
      applicationConfig({
        providers: [
          provideRouter([]),
          ...createWorkspaceSubscriptionsStoryProviders({
            majorEventId: context.args.selectedMajorEvent ? 'major-event-1' : null,
            selectedMajorEventSubscriptionId: context.args.selectedSubscription ? 'subscription-1' : null,
            pendingReceiptsCount: context.args.pendingReceiptsCount,
            majorEventCount: context.args.majorEventCount,
            eventCount: context.args.eventCount,
            majorSubscriptionCount: context.args.subscriptionCount,
            longNames: context.args.longNames,
            sportsEvery: context.args.sportsEvery,
            permissions: context.args.readOnly ? [] : undefined,
          }),
        ],
      })(story, context),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<MajorEventSubscriptionsStoryArgs>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('heading', { name: /selecione um grande evento/i })).toBeVisible());
    await expect(canvas.queryByRole('heading', { name: 'Inscritos' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByText('Semana da Computação'));
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Inscritos' })).toBeVisible());
  },
};

export const SubscriberBrowser: Story = {
  args: { selectedMajorEvent: true },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Inscritos' })).toBeVisible());
    await userEvent.click(canvas.getByText('Ada Lovelace'));
    await waitFor(() => expect(canvas.getByRole('button', { name: /voltar para lista de inscrições/i })).toBeVisible());
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: /voltar para lista de inscrições/i }));
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Inscritos' })).toBeVisible());
  },
};

export const SubscriberDetail: Story = {
  args: { selectedMajorEvent: true, selectedSubscription: true },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible());
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Inscritos' })).toBeVisible());
    await waitFor(() => expect(canvas.getByRole('button', { name: /voltar para lista de inscrições/i })).toBeVisible());
    await userEvent.click(await canvas.findByText('Grace Hopper'));
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Grace Hopper' })).toBeVisible());
    await expect(canvas.getByDisplayValue(/R\$\s*1,20/)).toBeVisible();
  },
};

export const CompactSubscriberBrowser: Story = {
  args: { selectedMajorEvent: true },
  globals: { theme: 'light' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Grace Hopper'));
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Grace Hopper' })).toBeVisible());
  },
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

export const DataLoaded: Story = {
  args: {
    selectedMajorEvent: true,
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoReceiptsToValidate: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  args: {
    selectedMajorEvent: true,
    pendingReceiptsCount: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: /validar comprovantes/i });
    await waitFor(() => expect(link).toBeVisible());
    await expect(link).toHaveAttribute('aria-disabled', 'true');
  },
};

export const DenseMixedData: Story = {
  args: {
    selectedMajorEvent: true,
    majorEventCount: 30,
    eventCount: 40,
    subscriptionCount: 60,
    pendingReceiptsCount: 120,
    sportsEvery: 2,
  },
};

export const EmptyCatalog: Story = {
  args: { majorEventCount: 0, eventCount: 0, subscriptionCount: 0, pendingReceiptsCount: 0 },
};

export const EmptySubscriptions: Story = {
  args: { selectedMajorEvent: true, subscriptionCount: 0 },
};

export const ReadOnly: Story = {
  args: { selectedMajorEvent: true, readOnly: true },
};

export const LongNamesMobile: Story = {
  args: { selectedMajorEvent: true, longNames: true, majorEventCount: 12, eventCount: 20, subscriptionCount: 20 },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
