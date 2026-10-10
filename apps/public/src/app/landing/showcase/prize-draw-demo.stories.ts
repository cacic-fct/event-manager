import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { PrizeDrawDemoComponent } from './prize-draw-demo';

const meta: Meta<PrizeDrawDemoComponent> = {
  component: PrizeDrawDemoComponent,
  title: 'Public/Landing/Demos/Prize Draw',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { controls: { disable: true }, layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<PrizeDrawDemoComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Kit criatividade')).toBeVisible();
    await expect(canvas.getByText('9', { selector: '.prize-draw-demo__eligible strong' })).toBeVisible();
    await expect(
      await canvas.findByText('Resultado: Beatriz Lima ganhou Kit criatividade.', {}, { timeout: 4500 }),
    ).toBeInTheDocument();
  },
};

export const ReducedMotionWinner: Story = {
  globals: { motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const startButton = canvas.queryByRole('button', { name: 'Sortear' });
    if (startButton) {
      await userEvent.click(startButton);
    }
    await expect(
      await canvas.findByText('Resultado: Beatriz Lima ganhou Kit criatividade.', {}, { timeout: 4500 }),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByRole('button', { name: 'Sortear novamente' }, { timeout: 3000 }),
    ).toBeEnabled();
  },
};

export const ManualReplay: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Resultado: Beatriz Lima ganhou Kit criatividade.', {}, { timeout: 4500 }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Sortear novamente' }));
    await expect(canvas.getByRole('button', { name: 'Sorteando…' })).toBeDisabled();
    await expect(
      await canvas.findByText('Resultado: Beatriz Lima ganhou Kit criatividade.', {}, { timeout: 4500 }),
    ).toBeInTheDocument();
  },
};
