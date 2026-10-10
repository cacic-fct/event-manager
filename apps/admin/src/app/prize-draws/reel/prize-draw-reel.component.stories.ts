import { PrizeDrawSpeed } from '@cacic-fct/event-manager-admin-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { prizeDrawStoryFullNames, prizeDrawStoryLongFullName } from '../prize-draw-story.fixtures';
import { PrizeDrawReelStoryHarness } from './prize-draw-reel.story-harness';

type StoryArgs = {
  speed: PrizeDrawSpeed;
  rosterSize: number;
  winnerName: string;
  countdownSeconds: 3 | 5;
  durationScale: number;
  demo: boolean;
};

const meta: Meta<StoryArgs> = {
  component: PrizeDrawReelStoryHarness,
  title: 'Admin/Prize Draws/Reel',
  tags: ['autodocs'],
  args: {
    speed: 'QUICK',
    rosterSize: 18,
    winnerName: prizeDrawStoryFullNames[2],
    countdownSeconds: 3,
    durationScale: 1,
    demo: false,
  },
  argTypes: {
    speed: { control: 'inline-radio', options: ['INSTANT', 'QUICK', 'DRAMATIC'] },
    rosterSize: { control: { type: 'range', min: 1, max: 80, step: 1 } },
    winnerName: { control: 'select', options: prizeDrawStoryFullNames.slice(0, 24) },
    countdownSeconds: { control: 'inline-radio', options: [3, 5], if: { arg: 'speed', eq: 'DRAMATIC' } },
    durationScale: { control: { type: 'range', min: 0.2, max: 2, step: 0.1 } },
    demo: { control: 'boolean' },
  },
  parameters: {
    docs: {
      description: {
        component: 'Prize draw reel interaction with controls for winner, speed, roster size, and countdown duration. Use the global motion control for reduced-motion behavior.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Sortear agora' })).toBeEnabled();
    await expect(canvasElement.querySelector('[data-motion-stage="idle"]')).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: 'Sortear agora' }));
    await waitFor(() => expect(canvasElement.querySelector('.reel--complete')).toBeVisible(), { timeout: 4_000 });
  },
};

export const DramaticFiveSecondCountdown: Story = {
  args: { speed: 'DRAMATIC', countdownSeconds: 5, rosterSize: 36, winnerName: prizeDrawStoryFullNames[7] },
};

export const WinnerAtEndOfLargeRoster: Story = {
  args: { rosterSize: 80, winnerName: prizeDrawStoryFullNames[23], durationScale: 1.2 },
};

export const EmptyRoster: Story = {
  args: { rosterSize: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Reiniciar' }));
    await expect((await canvas.findAllByText('Nenhuma pessoa elegível')).length).toBeGreaterThan(0);
    await expect(canvas.getByRole('button', { name: 'Sortear agora' })).toBeDisabled();
  },
};

export const LongWinnerName: Story = {
  args: { rosterSize: 32, winnerName: prizeDrawStoryLongFullName, speed: 'DRAMATIC' },
};
