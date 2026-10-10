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

export const Default: Story = {};
export const Response: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Enviar avaliação' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '5 estrelas' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar avaliação' }));
    await expect(canvas.getByText('Obrigado pela avaliação!')).toBeVisible();
  },
};
