import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { WalletDemoComponent } from './wallet-demo';

const meta: Meta<WalletDemoComponent> = {
  component: WalletDemoComponent,
  title: 'CACiC Eventos/Landing/Wallet Cards',
  tags: ['autodocs', 'landing-showcase'],
  args: { selectedCard: null, initialView: 'cards' },
  argTypes: {
    selectedCard: { control: 'select', options: [null, 'credential', 'ticket', 'offline'] },
    initialView: { control: 'select', options: ['cards', 'transfer', 'incoming'] },
  },
  parameters: { a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<WalletDemoComponent>;

export const Playground: Story = {
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Credencial do CACiC Eventos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(canvas.getByRole('button', { name: 'Bilhete para Kit de boas-vindas' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(canvas.getByText('Ciência da Computação na FCT-Unesp')).toBeVisible();
    await expect(canvas.getByText('836 429')).toBeVisible();
  },
};

export const DarkReducedMotionTicket: Story = {
  args: { selectedCard: 'ticket' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Bilhete para Kit de boas-vindas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(canvas.getByText('Bilhete ativo')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Kit de boas-vindas' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Transferir bilhete' })).toBeVisible();
  },
};

export const OfflineCodeCountdown: Story = {
  args: { selectedCard: 'offline' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Código off-line' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('progressbar', { name: /Código expira em/ })).toBeVisible();
    await expect(canvas.getByText(/\d{3} \d{3}/)).toBeVisible();
  },
};

export const MobileOpenAndClose: Story = {
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ticket = canvas.getByRole('button', { name: 'Bilhete para Kit de boas-vindas' });

    await userEvent.click(ticket);
    await expect(ticket).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByText('Bilhete ativo')).toBeVisible();

    await userEvent.click(ticket);
    await expect(ticket).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas.getByRole('button', { name: 'Credencial do CACiC Eventos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(canvas.getByText('Ciência da Computação na FCT-Unesp')).toBeVisible();
  },
};

export const TransferTicket: Story = {
  args: { selectedCard: 'ticket' },
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Transferir bilhete' }));
    await expect(await canvas.findByRole('heading', { name: 'Transferir bilhete' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Enviar bilhete' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Ver recebimento' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Receber bilhete' }));
    await expect(await canvas.findByRole('heading', { name: 'Bilhete recebido' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Voltar à carteira' }));
    await expect(canvas.getByText('Transferência concluída')).toBeVisible();
  },
};

export const IncomingTransfer: Story = {
  args: { initialView: 'incoming' },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Marina Costa quer transferir este bilhete')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Voltar à carteira' }));
    await expect(canvas.getByRole('button', { name: 'Bilhete para Kit de boas-vindas' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

export const ManualSelectionStopsAutoplay: Story = {
  globals: { theme: 'light', motion: 'full' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const ticket = canvas.getByRole('button', { name: 'Bilhete para Kit de boas-vindas' });
    const respectsReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (respectsReducedMotion) {
      return;
    }

    await waitFor(() => expect(ticket).toHaveAttribute('aria-pressed', 'true'), { timeout: 2500 });
    await userEvent.click(ticket);
    await expect(ticket).toHaveAttribute('aria-pressed', 'false');
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
    await expect(canvas.getByRole('button', { name: 'Código off-line' })).toHaveAttribute('aria-pressed', 'false');
  },
};
