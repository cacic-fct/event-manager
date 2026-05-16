import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { WorkspaceLayoutComponent } from './workspace-layout.component';

const meta: Meta<WorkspaceLayoutComponent> = {
  component: WorkspaceLayoutComponent,
  title: 'CACIC Eventos/Workspace/Workspace Layout',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<WorkspaceLayoutComponent>;

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
