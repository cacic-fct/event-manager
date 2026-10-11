import type { ReadInputBarcodeFormat } from 'zxing-wasm';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { AztecScannerComponent } from './aztec-scanner.component';

type AztecScannerStoryArgs = {
  title: string;
  acceptedPrefixes: readonly string[];
  pauseAfterScanMs: number;
  frameSize: number;
  formats: ReadInputBarcodeFormat[];
};

const meta: Meta<AztecScannerStoryArgs> = {
  component: AztecScannerComponent,
  title: 'Shared/Scanning/Aztec Scanner',
  tags: ['autodocs'],
  args: {
    title: 'Escanear carteira',
    acceptedPrefixes: ['user:'],
    pauseAfterScanMs: 1800,
    frameSize: 1280,
    formats: ['Aztec'],
  },
  argTypes: {
    title: { control: 'text', description: 'Instruction shown above the camera preview.' },
    acceptedPrefixes: { control: 'object', description: 'Accepted barcode payload prefixes.' },
    pauseAfterScanMs: { control: { type: 'number', min: 0, max: 5000, step: 100 }, description: 'Pause the camera after a successful scan.' },
    frameSize: { control: { type: 'number', min: 480, max: 1920, step: 80 }, description: 'Maximum camera preview dimension in pixels.' },
    formats: { control: 'object', description: 'Barcode formats accepted by the scanner.' },
  },
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'This story uses the browser camera when permission is available. Use the controls to change accepted formats and payload prefixes.',
      },
    },
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<AztecScannerStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Escanear carteira')).toBeVisible();
    await expect(await canvas.findByText(/permissão|câmera|preparando/i)).toBeVisible();
  },
};

export const QrAndAztec: Story = {
  args: {
    title: 'Escanear ingresso',
    acceptedPrefixes: ['ticket:', 'user:'],
    formats: ['Aztec', 'QRCode'],
  },
};
