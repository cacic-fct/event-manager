import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { expect, userEvent, within } from 'storybook/test';
import { AttendanceDemoComponent } from './attendance-demo';

const meta: Meta<AttendanceDemoComponent> = {
  component: AttendanceDemoComponent,
  title: 'Public/Landing/Demos/Attendance',
  tags: ['autodocs', 'landing-showcase'],
  decorators: [applicationConfig({ providers: [provideNoopAnimations()] })],
  parameters: { controls: { disable: true }, layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<AttendanceDemoComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Interfaces que incluem')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Marina Costa' })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Marcar como presente' }));
    await expect(canvas.getByText('1 de 3 pessoas classificadas')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Rafael Almeida' })).toBeVisible();
  },
};

export const ListAndReview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Exibir lista' }));
    const peopleList = canvas.getByRole('list', { name: 'Pessoas inscritas' });
    await expect(peopleList).toBeVisible();
    await expect(within(peopleList).getByText('Beatriz Lima')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Marcar Rafael Almeida como presente' }));
    await expect(canvas.getByText('1 de 3 pessoas classificadas')).toBeVisible();
  },
};

export const AbsentDecision: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Marcar como faltou' }));
    await expect(canvas.getByText('1 de 3 pessoas classificadas')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Rafael Almeida' })).toBeVisible();
  },
};

export const ManualCallCompletion: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ['Marina Costa', 'Rafael Almeida', 'Beatriz Lima']) {
      await expect(await canvas.findByRole('heading', { name })).toBeVisible();
      await userEvent.click(canvas.getByRole('button', { name: 'Marcar como presente' }));
    }
    await expect(await canvas.findByRole('heading', { name: 'Pergunte:' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Continuar' }));
    await expect(await canvas.findByRole('heading', { name: 'Todas as pessoas foram classificadas' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Continuar' }));
    await userEvent.type(
      await canvas.findByRole('textbox', { name: 'Documento, e-mail ou telefone' }),
      'visitante@exemplo.com.br',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Registrar presença' }));
    await expect(canvas.getByRole('heading', { name: 'Chamada concluída.' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Recomeçar chamada' })).toBeVisible();
  },
};
