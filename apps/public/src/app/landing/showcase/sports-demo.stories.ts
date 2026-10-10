import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { SportsDemoComponent } from './sports-demo';

const meta: Meta<SportsDemoComponent> = {
  component: SportsDemoComponent,
  title: 'CACiC Eventos/Landing/Sports',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<SportsDemoComponent>;

export const Match: Story = {};
export const Standings: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Classificação' }));
    await expect(canvas.getByRole('table', { name: 'Classificação' })).toBeVisible();
  },
};
