import type { Meta, StoryObj } from '@storybook/angular';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { expect, userEvent, within } from 'storybook/test';
import { ExplanationCard } from './explanation-card';

faker.seed(20260616);

const meta: Meta<ExplanationCard> = {
  component: ExplanationCard,
  title: 'Public/Shared/Components/Explanation Card/Explanation Card',
  tags: ['autodocs'],
  args: {
    title: 'Funciona offline',
    icon: 'cloud_off',
  },
  argTypes: {
    title: { control: 'text' },
    icon: {
      control: 'select',
      options: ['cloud_off', 'database', 'system_update', 'verified', 'event_available', 'notifications_active'],
    },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<ExplanationCard>;

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

export const Playground: Story = {
  parameters: {
    viewport: { defaultViewport: 'desktop' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MobileSync: Story = {
  args: {
    title: faker.helpers.arrayElement(['Dados salvos no dispositivo', 'Atualização manual necessária']),
    icon: 'system_update',
  },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};
