import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { EventExtrasComponent } from './event-extras';

const meta: Meta<EventExtrasComponent> = {
  component: EventExtrasComponent,
  title: 'Public/Landing/Demos/Event Options',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { controls: { disable: true }, layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<EventExtrasComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Classificação' }));
    await expect(canvas.getByRole('table', { name: 'Classificação' })).toBeVisible();
  },
};

export const FeedbackResponse: Story = {
  play: async ({ canvasElement }) => {
    canvasElement.querySelector('.feedback-showcase')?.scrollIntoView();
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('button', { name: 'Enviar avaliação' })).toBeDisabled();
    await userEvent.click(await canvas.findByRole('button', { name: '5 estrelas' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Enviar avaliação' }));
    await expect(canvas.getByText('Obrigado pela avaliação!')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Responder novamente' }));
    await expect(await canvas.findByRole('button', { name: 'Enviar avaliação' })).toBeDisabled();
  },
};

export const MatchOperations: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Operação' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Aumentar placar de Compiladores' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Finalizar partida' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Partida' }));
    await expect(canvasElement.querySelector('.match-status')).toBeVisible();
    await expect(await canvas.findByText('3 a 1', { selector: '.cdk-visually-hidden' })).toBeInTheDocument();
  },
};

export const PersistentStopwatch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Operação' }));
    await expect(await canvas.findByRole('button', { name: 'Pausar cronômetro' })).toBeVisible();
    const operation = canvasElement.querySelector('app-landing-match-operations-demo');
    const clock = operation?.querySelector('.match-operations__clock-value strong');
    const initialTime = clock?.textContent;
    await userEvent.click(await canvas.findByRole('button', { name: 'Classificação' }));
    await expect(operation?.isConnected).toBe(true);
    await waitFor(async () => { await expect(clock?.textContent).not.toBe(initialTime); }, { timeout: 2500 });
    await userEvent.click(await canvas.findByRole('button', { name: 'Operação' }));
    await expect(canvasElement.querySelector('app-landing-match-operations-demo')).toBe(operation);
    await expect(canvas.getByRole('button', { name: 'Pausar cronômetro' })).toBeVisible();
  },
};
