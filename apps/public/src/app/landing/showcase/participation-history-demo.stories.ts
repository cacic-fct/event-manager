import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ParticipationHistoryDemoComponent } from './participation-history-demo';

const meta: Meta<ParticipationHistoryDemoComponent> = {
  component: ParticipationHistoryDemoComponent,
  title: 'Public/Landing/Demos/Participation History',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { controls: { disable: true }, layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<ParticipationHistoryDemoComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Minhas participações' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /Semana de Tecnologia/ }));
    await expect(canvas.getByRole('heading', { name: 'Semana de Tecnologia' })).toBeVisible();
    await expect(canvas.getByText('Inscrição confirmada')).toBeVisible();
    await expect(canvas.getAllByText('Interfaces que incluem').length).toBeGreaterThan(0);
    await expect(canvas.getAllByText('Realidade Virtual').length).toBeGreaterThan(0);
  },
};

export const CertificateAndArchiveActions: Story = {
  args: { initialParticipation: 'technology' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Baixar certificado de Interfaces que incluem' }));
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Certificado baixado'), { timeout: 2000 });
    await userEvent.click(canvas.getByRole('button', { name: 'Baixar todos os certificados' }));
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Certificados preparados'), { timeout: 2000 });
  },
};

export const ReturnToHistory: Story = {
  args: { initialParticipation: 'innovation' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Jornada de Inovação' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Voltar ao histórico' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Voltar ao histórico' }));
    await userEvent.click(canvas.getByRole('button', { name: /Semana de Tecnologia/ }));
    await expect(canvas.getByRole('heading', { name: 'Semana de Tecnologia' })).toBeVisible();
  },
};
