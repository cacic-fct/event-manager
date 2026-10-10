import type { Meta, StoryObj } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
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
  title: 'Admin/Registration/Subscriptions/Major Events',
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
    withScenarioControls<MajorEventSubscriptionsStoryArgs>(),
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
    docs: {
      description: {
        component: 'Major event subscription browser with controls for subscriber volume, context, and selection.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<MajorEventSubscriptionsStoryArgs>;

export const Playground: Story = {
  args: { selectedMajorEvent: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Inscritos' })).toBeVisible());
    const subscriptionLinks = await canvas.findAllByRole('link', { name: /^Abrir inscrição de / });
    await expect(subscriptionLinks.length).toBeGreaterThan(0);
    await expect(subscriptionLinks[0]).toBeVisible();
  },
};

export const SubscriberBrowser: Story = {
  args: { selectedMajorEvent: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Inscritos' })).toBeVisible());
    const creationLabels = await canvas.findAllByText(/Criada pela administração/);
    await expect(creationLabels.length).toBeGreaterThan(0);
    await expect(creationLabels[0]).toBeVisible();
    await expect((await canvas.findAllByRole('link', { name: /^Abrir inscrição de / })).length).toBeGreaterThan(1);
  },
};

export const SubscriberDetail: Story = {
  args: { selectedMajorEvent: true, selectedSubscription: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Inscritos' })).toBeVisible());
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Ana Oliveira' })).toBeVisible());
    await expect(canvasElement.querySelector('.warning-reason')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /mais informações sobre/i })).not.toBeInTheDocument();
    await expect(canvas.getByDisplayValue(/R\$\s*1,20/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Editar inscrição' }));
    const lecturerEvent = canvas.getByRole('checkbox', { name: 'Selecionar GraphQL com NestJS' });
    await expect(lecturerEvent).toBeChecked();
    await userEvent.click(lecturerEvent);
    await expect(canvasElement.querySelector('.warning-reason')).toBeNull();
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
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoReceiptsToValidate: Story = {
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

export const LongNames: Story = {
  args: { selectedMajorEvent: true, longNames: true, majorEventCount: 12, eventCount: 20, subscriptionCount: 20 },
};
