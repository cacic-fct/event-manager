import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { applicationConfig, type Decorator } from '@storybook/angular';
import { of } from 'rxjs';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { WorkspacePermissionScope } from '../permissions/permissions.service';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import { SubscriptionsPageComponent } from './subscriptions-page.component';
import { createWorkspaceSubscriptionsStoryProviders } from './subscriptions-story-support';

interface SubscriptionsPageStoryArgs {
  pendingReceiptsCount: number;
  majorEventCount: number;
  eventCount: number;
  majorSubscriptionCount: number;
  eventSubscriptionCount: number;
  selectedDetail: boolean;
  readOnly: boolean;
  longNames: boolean;
  useAdminShell: boolean;
}

const defaultArgs: SubscriptionsPageStoryArgs = {
  pendingReceiptsCount: 7,
  majorEventCount: 4,
  eventCount: 8,
  majorSubscriptionCount: 12,
  eventSubscriptionCount: 10,
  selectedDetail: false,
  readOnly: false,
  longNames: false,
  useAdminShell: false,
};

const withSubscriptionsProviders: Decorator<SubscriptionsPageStoryArgs> = (story, context) => {
  const args = { ...defaultArgs, ...context.args };
  const subscriptionId = args.selectedDetail && args.majorSubscriptionCount > 0 ? 'subscription-1' : undefined;
  const readOnlyPermissions: WorkspacePermissionScope[] = [
    'event#read',
    'major-event#read',
    'subscription#read',
    'receipt#read',
  ];

  return applicationConfig({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ majorEventId: args.majorEventCount > 0 ? 'major-event-1' : undefined, subscriptionId })),
          snapshot: { url: [] },
        },
      },
      { provide: ADMIN_SHELL_CONTEXT, useValue: args.useAdminShell },
      ...createWorkspaceSubscriptionsStoryProviders({
        majorEventId: args.majorEventCount > 0 ? 'major-event-1' : null,
        selectedMajorEventSubscriptionId: subscriptionId,
        pendingReceiptsCount: args.pendingReceiptsCount,
        permissions: args.readOnly ? readOnlyPermissions : undefined,
        majorEventCount: args.majorEventCount,
        eventCount: args.eventCount,
        majorSubscriptionCount: args.majorSubscriptionCount,
        eventSubscriptionCount: args.eventSubscriptionCount,
        longNames: args.longNames,
      }),
    ],
  })(story, context);
};

const meta: Meta<SubscriptionsPageStoryArgs> = {
  component: SubscriptionsPageComponent,
  title: 'Admin/Registration/Subscriptions',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    pendingReceiptsCount: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    majorEventCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    eventCount: { control: { type: 'range', min: 0, max: 40, step: 1 } },
    majorSubscriptionCount: { control: { type: 'range', min: 0, max: 60, step: 1 } },
    eventSubscriptionCount: { control: { type: 'range', min: 0, max: 60, step: 1 } },
    selectedDetail: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    longNames: { control: 'boolean' },
    useAdminShell: { table: { disable: true } },
  },
  decorators: [withScenarioControls<SubscriptionsPageStoryArgs>(), withSubscriptionsProviders],
  parameters: {
    docs: {
      description: {
        component: 'Subscription workspace with controls for event context, result volume, and subscription states.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<SubscriptionsPageStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Inscrições e interesses', level: 1 })).toBeVisible();
    await expect(await canvas.findByRole('heading', { name: 'Inscritos' })).toBeVisible();
    await expect(canvasElement.querySelector('app-event-context-picker')).toBeVisible();
    await expect(canvas.queryByRole('tablist')).not.toBeInTheDocument();
  },
};

export const ShellEmbedded: Story = {
  args: { useAdminShell: true },
  render: () => ({ template: '<main><h1>Inscrições</h1><app-workspace-subscriptions-tab /></main>' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Inscrições', level: 1 })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Inscrições e interesses' })).not.toBeInTheDocument();
  },
};

export const DenseWorkspace: Story = {
  args: {
    pendingReceiptsCount: 84,
    majorEventCount: 30,
    eventCount: 40,
    majorSubscriptionCount: 60,
    eventSubscriptionCount: 60,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect((await canvas.findAllByText(/de 60/)).length).toBeGreaterThan(0);
  },
};

export const EmptyWorkspace: Story = {
  args: {
    pendingReceiptsCount: 0,
    majorEventCount: 0,
    eventCount: 0,
    majorSubscriptionCount: 0,
    eventSubscriptionCount: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Escolha o evento ou grande evento acima para consultar inscrições, incluir participantes e acompanhar pagamentos.')).toBeVisible();
  },
};

export const NoReceiptsToValidate: Story = {
  args: { pendingReceiptsCount: 0 },
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole('link', { name: /validar comprovantes/i });
    await waitFor(() => expect(link).toHaveAttribute('aria-disabled', 'true'));
  },
};

export const DeepLinkedSubscriberDetail: Story = {
  args: { selectedDetail: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('app-event-context-picker')).toBeVisible();
    await waitFor(() => expect(canvas.getByRole('button', { name: /voltar para lista de inscrições/i })).toBeVisible());
    const selectedSubscriber = canvasElement.querySelector<HTMLAnchorElement>(
      'app-workspace-record a[aria-current="page"]',
    );
    await expect(selectedSubscriber).toBeVisible();
    const selectedName = selectedSubscriber?.getAttribute('aria-label')?.replace(/^Abrir inscrição de /, '').trim() ?? '';
    await expect(canvas.getByRole('heading', { name: selectedName })).toBeVisible();
  },
};

export const ReadOnly: Story = {
  args: { readOnly: true, majorSubscriptionCount: 8 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(canvas.getByRole('heading', { name: 'Inscritos' })).toBeVisible();
  },
};

export const LongNames: Story = {
  args: { longNames: true, majorSubscriptionCount: 24, eventSubscriptionCount: 24 },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findAllByText(/participante/)).length).toBeGreaterThan(5);
  },
};
