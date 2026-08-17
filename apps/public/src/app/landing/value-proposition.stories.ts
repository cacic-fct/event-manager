import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { PlatformStatsLoadState, ValuePropositionComponent } from './value-proposition';

interface ValuePropositionStoryArgs {
  statsState: PlatformStatsLoadState;
  peopleCount: number;
  eventsCount: number;
  majorEventsCount: number;
  certificatesCount: number;
}

faker.seed(20_260_717);

const defaultArgs: ValuePropositionStoryArgs = {
  statsState: 'ready',
  peopleCount: faker.number.int({ min: 100_000, max: 160_000 }),
  eventsCount: faker.number.int({ min: 5_000, max: 9_000 }),
  majorEventsCount: faker.number.int({ min: 250, max: 500 }),
  certificatesCount: faker.number.int({ min: 250_000, max: 400_000 }),
};

const meta: Meta<ValuePropositionStoryArgs> = {
  component: ValuePropositionComponent,
  title: 'CACiC Eventos/Landing/Value Proposition',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    statsState: { control: 'select', options: ['loading', 'ready', 'unavailable'] },
    peopleCount: { control: { type: 'range', min: 0, max: 1_000_000, step: 100 } },
    eventsCount: { control: { type: 'range', min: 0, max: 100_000, step: 10 } },
    majorEventsCount: { control: { type: 'range', min: 0, max: 10_000, step: 1 } },
    certificatesCount: { control: { type: 'range', min: 0, max: 2_000_000, step: 100 } },
  },
  render: (args) => ({
    props: {
      statsState: args.statsState,
      stats:
        args.statsState === 'ready'
          ? {
              peopleCount: args.peopleCount,
              eventsCount: args.eventsCount,
              majorEventsCount: args.majorEventsCount,
              certificatesCount: args.certificatesCount,
            }
          : null,
    },
  }),
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<ValuePropositionStoryArgs>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Eventos universitários facilitados' })).toBeVisible();
    await expect(canvas.getByText(args.peopleCount.toLocaleString('pt-BR'))).toBeVisible();
  },
};

export const ZeroedStatistics: Story = {
  args: { peopleCount: 0, eventsCount: 0, majorEventsCount: 0, certificatesCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findAllByText('0')).toHaveLength(4);
  },
};

export const VeryLargeStatistics: Story = {
  args: { peopleCount: 999_999, eventsCount: 99_999, majorEventsCount: 9_999, certificatesCount: 1_999_900 },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('1.999.900')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { statsState: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Carregando estatísticas/i)).toBeVisible();
  },
};

export const StatisticsUnavailable: Story = {
  args: { statsState: 'unavailable' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/estatísticas.*indisponíveis/i)).toBeVisible();
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('heading', { name: 'Eventos universitários facilitados' })).toBeVisible();
  },
};
