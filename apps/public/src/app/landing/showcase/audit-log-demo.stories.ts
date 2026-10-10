import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AuditLogDemoComponent } from './audit-log-demo';

const meta: Meta<AuditLogDemoComponent> = {
  component: AuditLogDemoComponent,
  title: 'CACiC Eventos/Landing/Auditoria',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<AuditLogDemoComponent>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Atividade recente' })).toBeVisible();
    await expect(canvas.getByText('4 registros')).toBeVisible();
    await expect(canvas.getByText('Marina Costa')).toBeVisible();
  },
};

export const EventEditReview: Story = {
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Evento atualizado pelo painel administrativo/ }));
    await expect(canvas.getByRole('heading', { name: 'Evento atualizado pelo painel administrativo.' })).toBeVisible();
    await expect(canvas.getByText('40')).toBeVisible();
    await expect(canvas.getByText('60')).toBeVisible();
  },
};

export const ReceiptApprovalMobile: Story = {
  globals: { theme: 'light', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Comprovantes' }));
    await expect(canvas.getByText('1 encontrado')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /Comprovante aprovado/ }));
    await expect(canvas.getByText('Em análise')).toBeVisible();
    await expect(canvas.getByText('Aprovado')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Voltar aos registros' })).toBeVisible();
  },
};

export const DarkReducedPermissionAndCertificateReview: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Permissões' }));
    await userEvent.click(canvas.getByRole('button', { name: /Papel de acesso alterado/ }));
    await expect(canvas.getByText('Facilitadora')).toBeVisible();
    await expect(canvas.getByText('Organizadora')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Voltar aos registros' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Certificados' }));
    await userEvent.click(canvas.getByRole('button', { name: /Certificado emitido/ }));
    await expect(canvas.getByText('Pendente')).toBeVisible();
    await expect(canvas.getByText('Emitido')).toBeVisible();
  },
};
