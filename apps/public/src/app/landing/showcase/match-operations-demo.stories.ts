import { applicationConfig, moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { expect, userEvent, within } from 'storybook/test';
import { MatchOperationsDemoComponent } from './match-operations-demo';

const meta: Meta<MatchOperationsDemoComponent> = {
  component: MatchOperationsDemoComponent,
  title: 'Public/Landing/Demos/Match Operations',
  tags: ['autodocs', 'landing-showcase'],
  decorators: [
    moduleMetadata({ imports: [MatchOperationsDemoComponent] }),
    applicationConfig({ providers: [provideNoopAnimations()] }),
  ],
  render: () => ({
    props: {},
    template: '<div class="match-operations-story-surface"><app-landing-match-operations-demo /></div>',
    styles: [
      '.match-operations-story-surface { background: #153f38; border-radius: 16px; color: #f0fff7; margin: 0 auto; max-width: 570px; padding: 24px; }',
    ],
  }),
  parameters: { controls: { disable: true }, layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<MatchOperationsDemoComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Pausar cronômetro' })).toBeEnabled();

    await userEvent.click(canvas.getByRole('button', { name: 'Aumentar placar de Compiladores' }));
    await expect(canvas.getByText('3', { selector: '.match-operations__score' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Diminuir placar de Algoritmos' }));
    await expect(canvas.getByText('0', { selector: '.match-operations__score' })).toBeVisible();
  },
};

export const ClockPause: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Partida em andamento')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Pausar cronômetro' }));
    await expect(canvas.getByRole('button', { name: 'Retomar cronômetro' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Retomar cronômetro' }));
    await expect(canvas.getByRole('button', { name: 'Pausar cronômetro' })).toBeVisible();
  },
};

export const FinalizedAndRestarted: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Finalizar partida' }));
    await expect(canvas.getByText('Partida encerrada')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Aumentar placar de Compiladores' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Recomeçar' }));
    await expect(canvas.getByRole('button', { name: 'Pausar cronômetro' })).toBeVisible();
  },
};
