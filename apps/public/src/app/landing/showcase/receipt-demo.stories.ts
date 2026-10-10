import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { ReceiptDemoComponent } from './receipt-demo';

const meta: Meta<ReceiptDemoComponent> = {
  component: ReceiptDemoComponent,
  title: 'CACiC Eventos/Landing/Receipt Upload',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<ReceiptDemoComponent>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Enviar comprovante' })).toBeDisabled();
  },
};

export const AwaitingValidation: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const receipt = new File(['%PDF-1.7\n'], 'comprovante.pdf', { type: 'application/pdf' });
    await userEvent.upload(canvas.getByLabelText('Arquivo do comprovante'), receipt);
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar comprovante' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('Aguardando validação');
  },
};

export const MobileFileSelection: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(canvas.getByLabelText('Arquivo do comprovante'), new File(['receipt'], 'recibo.png', { type: 'image/png' }));
    await expect(canvas.getByText('recibo.png')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Enviar comprovante' })).toBeEnabled();
  },
};
