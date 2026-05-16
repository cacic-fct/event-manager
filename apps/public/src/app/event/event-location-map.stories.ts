import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { EventLocationMap } from './event-location-map';

const meta: Meta<EventLocationMap> = {
  component: EventLocationMap,
  title: 'Public/Event/Event Location Map',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<EventLocationMap>;

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

export const OnlineDesktop: Story = {
  args: { latitude: -22.1211, longitude: -51.4086, title: 'FCT Unesp' },
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OnlineMobile: Story = {
  args: { latitude: -22.1211, longitude: -51.4086, title: 'Laboratório 01' },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const DarkMobile: Story = {
  args: { latitude: null, longitude: null, title: 'Local a confirmar' },
  parameters: {
    backgrounds: { default: 'dark' },
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'dark', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: { latitude: -22.1211, longitude: -51.4086, title: 'Auditório' },
  parameters: {
    viewport: { defaultViewport: 'tablet' },
  },
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
