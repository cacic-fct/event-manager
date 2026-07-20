import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { ValuePropositionComponent } from './value-proposition';

const meta: Meta<ValuePropositionComponent> = {
  component: ValuePropositionComponent,
  title: 'Public/Landing/Components/Value Proposition',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<ValuePropositionComponent>;

faker.seed(20260717);

const platformStats = {
  peopleCount: faker.number.int({ min: 100_000, max: 160_000 }),
  eventsCount: faker.number.int({ min: 5_000, max: 9_000 }),
  majorEventsCount: faker.number.int({ min: 250, max: 500 }),
  certificatesCount: faker.number.int({ min: 250_000, max: 400_000 }),
};

export const Loaded: Story = {
  globals: { theme: 'light' },
  args: {
    statsState: 'ready',
    stats: platformStats,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Eventos universitários facilitados' })).toBeVisible();
    await expect(canvas.getByText(platformStats.peopleCount.toLocaleString('pt-BR'))).toBeVisible();
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  args: {
    statsState: 'ready',
    stats: platformStats,
  },
};

export const Loading: Story = { globals: { theme: 'light' }, args: { statsState: 'loading', stats: null } };

export const StatisticsUnavailable: Story = {
  globals: { theme: 'light' },
  args: { statsState: 'unavailable', stats: null },
};
