import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { WalletBarcodeComponent } from './barcode';
import { TICKET_FIXTURE_HOLDER_USER_ID } from '@cacic-fct/shared-ticketing/testing';

type WalletBarcodeStoryArgs = {
  userId: string;
  payloadPrefix: string;
  barcodeType: 'aztec' | 'code128';
  errorCorrectionLevel: string;
  label: string;
  ariaHidden: boolean;
};

const meta: Meta<WalletBarcodeStoryArgs> = {
  component: WalletBarcodeComponent,
  title: 'CACiC Eventos/Profile/Wallet/Barcode',
  tags: ['autodocs'],
  args: {
    userId: 'user-storybook-123',
    payloadPrefix: 'user:',
    barcodeType: 'aztec',
    errorCorrectionLevel: '35',
    label: 'Código de identificação da carteira',
    ariaHidden: false,
  },
  argTypes: {
    userId: { control: 'text' },
    payloadPrefix: { control: 'text' },
    barcodeType: {
      control: 'select',
      options: ['aztec', 'code128'],
    },
    errorCorrectionLevel: {
      control: 'select',
      options: ['5', '23', '35', '50', '90'],
    },
    label: { control: 'text' },
    ariaHidden: { control: 'boolean' },
  },
  parameters: {
    layout: 'centered',
    a11y: { test: 'todo' },
  },
  decorators: [
    (story) => ({
      ...story(),
      styles: [
        `
          :host {
            display: block;
            height: 320px;
            width: 320px;
          }
        `,
      ],
    }),
  ],
};

export default meta;

type Story = StoryObj<WalletBarcodeStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: /código de identificação/i })).toBeVisible();
  },
};

export const Decorative: Story = {
  args: {
    ariaHidden: true,
    label: 'Código decorativo oculto da tecnologia assistiva',
  },
};

export const EmptyUser: Story = {
  args: {
    userId: '',
    label: 'Código vazio',
  },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const TicketPayload: Story = {
  args: {
    userId: `ticket:018f47a1-3d5b-7abc-8def-0123456789ab:${TICKET_FIXTURE_HOLDER_USER_ID}`,
    payloadPrefix: '',
    label: 'Código do bilhete',
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
