import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { SportsDemoComponent } from './sports-demo';

const meta: Meta<SportsDemoComponent> = {
  component: SportsDemoComponent,
  title: 'Public/Landing/Demos/Sports',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { controls: { disable: true }, a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<SportsDemoComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Classificação' }));
    await expect(canvas.getByRole('table', { name: 'Classificação' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Partida' }));
    await expect(canvasElement.querySelector('.score-line [aria-hidden="true"]')).toHaveTextContent('2 : 1');
    await expect(canvas.getByText('2 a 1', { selector: '.sr-only' })).toHaveStyle({ clipPath: 'inset(50%)' });
    await expect(canvas.getByRole('timer')).toBeVisible();
  },
};

export const Standings: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Classificação' }));
    await expect(canvas.getByRole('table', { name: 'Classificação' })).toBeVisible();
  },
};
