import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { expect, userEvent, within } from 'storybook/test';
import { WorkspaceMajorEventSubscriptionsSubtabComponent } from './workspace-major-event-subscriptions-subtab.component';
import { createWorkspaceSubscriptionsStoryProviders } from './workspace-subscriptions-story-support';

const meta: Meta<WorkspaceMajorEventSubscriptionsSubtabComponent> = {
  component: WorkspaceMajorEventSubscriptionsSubtabComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Subscriptions/Workspace Major Event Subscriptions Subtab',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        ...createWorkspaceSubscriptionsStoryProviders({
          majorEventId: 'major-event-1',
          pendingReceiptsCount: 3,
        }),
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<WorkspaceMajorEventSubscriptionsSubtabComponent>;

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
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const NoReceiptsToValidate: Story = {
  args: {
    pendingReceiptsCount: 0,
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: /validar comprovantes/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('aria-disabled', 'true');
  },
};
