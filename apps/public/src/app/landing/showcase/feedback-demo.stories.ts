import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { FeedbackDemoComponent } from './feedback-demo';

const meta: Meta<FeedbackDemoComponent> = {
  component: FeedbackDemoComponent,
  title: 'CACiC Eventos/Landing/Feedback',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<FeedbackDemoComponent>;

export const Default: Story = {
  globals: { theme: 'light', motion: 'full' },
};

export const Playground: Story = {
  globals: { theme: 'light', motion: 'full' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rating = canvas.getByRole('button', { name: '4 estrelas' });
    await userEvent.click(rating);
    await expect(rating).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'Enviar avaliação' })).toBeEnabled();
  },
};

export const Response: Story = {
  globals: { theme: 'light', motion: 'full' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Enviar avaliação' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '5 estrelas' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar avaliação' }));
    await expect(canvas.getByText('Obrigado pela avaliação!')).toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
};
