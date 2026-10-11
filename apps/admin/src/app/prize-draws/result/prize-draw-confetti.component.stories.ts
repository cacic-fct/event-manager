import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { PrizeDrawConfettiStoryHarness } from './prize-draw-confetti.story-harness';

type StoryArgs = {
  particleCount: number;
  durationMs: number;
};

const meta: Meta<StoryArgs> = {
  component: PrizeDrawConfettiStoryHarness,
  title: 'Admin/Prize Draws/Results/Confetti',
  tags: ['autodocs'],
  args: { particleCount: 110, durationMs: 2400 },
  argTypes: {
    particleCount: { control: { type: 'range', min: 48, max: 300, step: 4 } },
    durationMs: { control: { type: 'range', min: 400, max: 5000, step: 100 } },
  },
  parameters: {
    docs: {
      description: {
        component: 'Confetti reveal effect with controls for particle count and duration. Use the global motion control to inspect reduced-motion behavior.',
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
    const action = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'Recriar padrão de confete'
      : 'Repetir confete';
    await userEvent.click(await canvas.findByRole('button', { name: action }));
    await expect(canvas.getByText('Confete da revelação')).toBeVisible();
    expect(canvasElement.querySelector('canvas')).toBeTruthy();
  },
};

export const DenseBurst: Story = {
  args: { particleCount: 220, durationMs: 3200 },
};

export const RareEasterEggFlood: Story = {
  args: { particleCount: 1000, durationMs: 5000 },
};
