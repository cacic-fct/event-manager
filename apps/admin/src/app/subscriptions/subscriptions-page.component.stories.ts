import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SubscriptionsPageComponent } from './subscriptions-page.component';
import { createWorkspaceSubscriptionsStoryProviders } from './subscriptions-story-support';

const meta: Meta<SubscriptionsPageComponent> = {
  component: SubscriptionsPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Subscriptions/Workspace Subscriptions Tab',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: createSubscriptionsTabStoryProviders(3),
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<SubscriptionsPageComponent>;

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
  args: {},
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoReceiptsToValidate: Story = {
  args: {},
  decorators: [
    applicationConfig({
      providers: createSubscriptionsTabStoryProviders(0),
    }),
  ],
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: /validar comprovantes/i });
    await waitFor(() => expect(link).toBeVisible());
    await expect(link).toHaveAttribute('aria-disabled', 'true');
  },
};

export const DeepLinkedSubscriberDetail: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  args: {},
  decorators: [
    applicationConfig({
      providers: createSubscriptionsTabStoryProviders(3, 'subscription-1'),
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible());
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Inscritos' })).toBeVisible());
    await waitFor(() => expect(canvas.getByRole('button', { name: /voltar para lista de eventos/i })).toBeVisible());
  },
};

function createSubscriptionsTabStoryProviders(pendingReceiptsCount: number, subscriptionId?: string) {
  return [
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: {
        paramMap: of(convertToParamMap({ majorEventId: 'major-event-1', subscriptionId })),
      },
    },
    ...createWorkspaceSubscriptionsStoryProviders({
      majorEventId: 'major-event-1',
      selectedMajorEventSubscriptionId: subscriptionId,
      pendingReceiptsCount,
    }),
  ];
}
