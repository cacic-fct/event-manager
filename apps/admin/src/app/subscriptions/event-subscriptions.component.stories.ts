import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, type Decorator } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { EventSubscriptionsComponent } from './event-subscriptions.component';
import { createWorkspaceSubscriptionsStoryProviders } from './subscriptions-story-support';

interface EventSubscriptionsStoryArgs {
  eventCount: number;
  subscriptionCount: number;
  sportsEvery: number;
  longNames: boolean;
  readOnly: boolean;
}

const defaultArgs: EventSubscriptionsStoryArgs = {
  eventCount: 10,
  subscriptionCount: 16,
  sportsEvery: 3,
  longNames: false,
  readOnly: false,
};

const withProviders: Decorator<EventSubscriptionsStoryArgs> = (story, context) =>
  applicationConfig({
    providers: [
      provideRouter([]),
      ...createWorkspaceSubscriptionsStoryProviders({
        eventCount: context.args.eventCount,
        eventSubscriptionCount: context.args.subscriptionCount,
        sportsEvery: context.args.sportsEvery,
        longNames: context.args.longNames,
        permissions: context.args.readOnly
          ? ['event#read', 'major-event#read', 'subscription#read', 'receipt#read']
          : undefined,
      }),
    ],
  })(story, context);

const meta: Meta<EventSubscriptionsStoryArgs> = {
  component: EventSubscriptionsComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Subscriptions/Event Workbench',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    eventCount: { control: { type: 'range', min: 0, max: 40, step: 1 } },
    subscriptionCount: { control: { type: 'range', min: 0, max: 60, step: 1 } },
    sportsEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    longNames: { control: 'boolean' },
    readOnly: { control: 'boolean' },
  },
  decorators: [withProviders],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<EventSubscriptionsStoryArgs>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByLabelText('Partida de torneio esportivo')).toBeVisible();
    await expect(await canvas.findByRole('heading', { name: 'Inscritos' })).toBeVisible();
  },
};

export const DenseWorkbench: Story = {
  args: { eventCount: 40, subscriptionCount: 60, sportsEvery: 2 },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findAllByLabelText('Partida de torneio esportivo')).length).toBe(20);
  },
};

export const EmptyEvents: Story = {
  args: { eventCount: 0, subscriptionCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Nenhum evento encontrado/i)).toBeVisible();
  },
};

export const NoSubscriptions: Story = {
  args: { eventCount: 4, subscriptionCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Nenhuma inscrição/i)).toBeVisible();
  },
};

export const ReadOnly: Story = {
  args: { readOnly: true },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(await within(canvasElement).findByRole('heading', { name: 'Inscritos' })).toBeVisible();
  },
};

export const LongNamesTablet: Story = {
  args: { longNames: true, eventCount: 16, subscriptionCount: 24 },
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findAllByText(/Atividade interdisciplinar/)).length).toBeGreaterThan(5);
  },
};
