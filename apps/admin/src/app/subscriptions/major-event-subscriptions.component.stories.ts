import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { MajorEventSubscriptionsComponent } from './major-event-subscriptions.component';
import { createWorkspaceSubscriptionsStoryProviders } from './subscriptions-story-support';

const meta: Meta<MajorEventSubscriptionsComponent> = {
  component: MajorEventSubscriptionsComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Subscriptions/Workspace Major Event Subscriptions Subtab',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideRouter([])],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<MajorEventSubscriptionsComponent>;

const selectedMajorEventProviders = (
  selectedMajorEventSubscriptionId: string | null = null,
  pendingReceiptsCount = 3,
) =>
  applicationConfig({
    providers: [
      ...createWorkspaceSubscriptionsStoryProviders({
        majorEventId: 'major-event-1',
        selectedMajorEventSubscriptionId,
        pendingReceiptsCount,
      }),
    ],
  });

export const Playground: Story = {
  args: { pendingReceiptsCount: 3 },
  decorators: [
    applicationConfig({
      providers: [...createWorkspaceSubscriptionsStoryProviders({ majorEventId: null, pendingReceiptsCount: 3 })],
    }),
  ],
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
  args: { pendingReceiptsCount: 3 },
  decorators: [selectedMajorEventProviders()],
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
  args: { pendingReceiptsCount: 3 },
  decorators: [selectedMajorEventProviders('subscription-1')],
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible());
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Inscritos' })).toBeVisible());
    await waitFor(() => expect(canvas.getByRole('button', { name: /voltar para lista de inscrições/i })).toBeVisible());
    await userEvent.click(await canvas.findByText('Grace Hopper'));
    await waitFor(() => expect(canvas.getByRole('heading', { name: 'Grace Hopper' })).toBeVisible());
  },
};

export const CompactSubscriberBrowser: Story = {
  args: { pendingReceiptsCount: 3 },
  decorators: [selectedMajorEventProviders()],
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
    pendingReceiptsCount: 3,
  },
  decorators: [selectedMajorEventProviders()],
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoReceiptsToValidate: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  args: {
    pendingReceiptsCount: 0,
  },
  decorators: [selectedMajorEventProviders(null, 0)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: /validar comprovantes/i });
    await waitFor(() => expect(link).toBeVisible());
    await expect(link).toHaveAttribute('aria-disabled', 'true');
  },
};
