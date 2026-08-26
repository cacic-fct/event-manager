import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { PrizeDrawConfettiStoryHarness } from './prize-draw-confetti.story-harness';

type StoryArgs = {
  particleCount: number;
  durationMs: number;
  reducedMotion: boolean;
};

const meta: Meta<StoryArgs> = {
  component: PrizeDrawConfettiStoryHarness,
  title: 'CACiC Eventos/Sorteios/Confete da revelação',
  tags: ['autodocs'],
  args: { particleCount: 110, durationMs: 2400, reducedMotion: false },
  argTypes: {
    particleCount: { control: { type: 'range', min: 48, max: 300, step: 4 } },
    durationMs: { control: { type: 'range', min: 400, max: 5000, step: 100 } },
    reducedMotion: { control: 'boolean' },
  },
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Repetir confete' }));
    await expect(canvas.getByText('Confete da revelação')).toBeVisible();
    expect(canvasElement.querySelector('canvas')).toBeTruthy();
  },
};

export const DenseBurst: Story = {
  args: { particleCount: 220, durationMs: 3200 },
};

export const ReducedMotion: Story = {
  args: { reducedMotion: true },
  globals: { motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Recriar padrão de confete' })).toBeEnabled();
    expect(canvasElement.querySelector('canvas')).toBeTruthy();
  },
};

export const RareEasterEggFlood: Story = {
  args: { particleCount: 1000, durationMs: 5000 },
};

export const DarkMobile: Story = {
  args: { particleCount: 72, durationMs: 1800, reducedMotion: true },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
