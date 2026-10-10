import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { CertificateDemoComponent } from './certificate-demo';

const meta: Meta<CertificateDemoComponent> = {
  component: CertificateDemoComponent,
  title: 'CACiC Eventos/Landing/Certificados',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<CertificateDemoComponent>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Configurar certificado' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Nome público do certificado' })).toHaveValue(
      'Interfaces que incluem',
    );
    await expect(canvas.getByText('2 participantes elegíveis')).toBeVisible();
    await expect(canvas.getByText('Marina Costa')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Emitir certificados pendentes' })).toBeEnabled();
  },
};

export const SpeakerIssuanceAndInspection: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Emitir para' }));
    await userEvent.click(within(document.body).getByRole('option', { name: 'Palestrantes' }));
    await expect(canvas.getByText('1 palestrante elegível')).toBeVisible();
    await expect(canvas.getByText('Beatriz Lima')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Emitir certificados pendentes' }));
    await expect(canvas.getByRole('heading', { name: 'Certificados emitidos' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Certificados emitidos' })).toHaveFocus();
    await expect(canvas.getByText('Certificados disponíveis')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Visualizar certificado de Beatriz Lima' }));
    await expect(canvas.getByRole('heading', { name: 'Dados de validação' })).toHaveFocus();
    await expect(canvas.getByText('DEMO-SPEAKER-001')).toBeVisible();
    await expect(canvas.getByText('Palestrante')).toBeVisible();
  },
};

export const MobileIssuedInspection: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Emitir certificados pendentes' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Visualizar certificado de Marina Costa' }));
    await expect(canvas.getByText('Evento', { selector: 'dt' })).toBeVisible();
    await expect(canvas.getByText('Semana de Tecnologia')).toBeVisible();
    await expect(canvas.getByText('DEMO-PART-001')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Voltar à lista' })).toBeVisible();
  },
};
