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
  title: 'CACiC Eventos/Shared/Scanning/Aztec scanner',
  tags: ['autodocs'],
  args: {
    title: 'Escanear carteira',
    acceptedPrefixes: ['user:'],
    pauseAfterScanMs: 1800,
    frameSize: 1280,
    formats: ['Aztec'],
  },
  argTypes: {
    title: { control: 'text' },
    acceptedPrefixes: { control: 'object' },
    pauseAfterScanMs: { control: { type: 'number', min: 0, max: 5000, step: 100 } },
    frameSize: { control: { type: 'number', min: 480, max: 1920, step: 80 } },
    formats: { control: 'object' },
  },
  parameters: {
    layout: 'centered',
    a11y: { test: 'todo' },
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

export const CompactFrame: Story = {
  args: {
    title: 'Escanear credencial em dispositivo móvel',
    frameSize: 640,
    pauseAfterScanMs: 900,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};

export const DarkReducedMotion: Story = {
  args: {
    title: 'Escanear credencial no modo noturno',
    frameSize: 720,
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
