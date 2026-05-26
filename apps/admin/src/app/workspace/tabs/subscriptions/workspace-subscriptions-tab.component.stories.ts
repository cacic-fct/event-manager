import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { WorkspaceSubscriptionsTabComponent } from './workspace-subscriptions-tab.component';
import { createWorkspaceSubscriptionsStoryProviders } from './workspace-subscriptions-story-support';

const meta: Meta<WorkspaceSubscriptionsTabComponent> = {
  component: WorkspaceSubscriptionsTabComponent,
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

type Story = StoryObj<WorkspaceSubscriptionsTabComponent>;

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
  args: {},
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DenseDesktop: Story = {
  args: {},
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DarkMode: Story = {
  args: {},
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'dark' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MobileLayout: Story = {
  args: {},
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
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
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: /validar comprovantes/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('aria-disabled', 'true');
  },
};

function createSubscriptionsTabStoryProviders(pendingReceiptsCount: number) {
  return [
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: {
        paramMap: of(convertToParamMap({ majorEventId: 'major-event-1' })),
      },
    },
    ...createWorkspaceSubscriptionsStoryProviders({
      majorEventId: 'major-event-1',
      pendingReceiptsCount,
    }),
  ];
}
