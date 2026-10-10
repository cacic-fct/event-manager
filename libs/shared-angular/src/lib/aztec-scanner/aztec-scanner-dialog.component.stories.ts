import { NgComponentOutlet } from '@angular/common';
import { Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { ReadInputBarcodeFormat } from 'zxing-wasm';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { AztecScannerDialogComponent, AztecScannerDialogData } from './aztec-scanner-dialog.component';

type AztecScannerDialogStoryArgs = {
  title: string;
  acceptedPrefixes: readonly string[];
  pauseAfterScanMs: number;
  continuousMode: boolean;
  mode: ReadInputBarcodeFormat[];
};

const dialogRefMock = {
  close: () => undefined,
};

@Component({
  selector: 'lib-storybook-aztec-scanner-dialog-host',
  imports: [NgComponentOutlet],
  template: `
    <section role="dialog" aria-modal="true" aria-label="Leitor de código">
      <ng-container [ngComponentOutlet]="component" [ngComponentOutletInjector]="storyInjector()" />
    </section>
  `,
})
class AztecScannerDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = AztecScannerDialogComponent;
  readonly title = input('Escanear carteira');
  readonly acceptedPrefixes = input<readonly string[]>(['user:']);
  readonly pauseAfterScanMs = input(1800);
  readonly continuousMode = input(false);
  readonly mode = input<ReadInputBarcodeFormat[]>(['Aztec']);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: this.title(),
            acceptedPrefixes: this.acceptedPrefixes(),
            pauseAfterScanMs: this.pauseAfterScanMs(),
            continuousMode: this.continuousMode(),
            mode: this.mode(),
          } satisfies AztecScannerDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<AztecScannerDialogStoryArgs> = {
  component: AztecScannerDialogStoryHostComponent,
  title: 'Shared/Scanning/Aztec Scanner Dialog',
  tags: ['autodocs'],
  args: {
    title: 'Escanear carteira',
    acceptedPrefixes: ['user:'],
    pauseAfterScanMs: 1800,
    continuousMode: false,
    mode: ['Aztec'],
  },
  argTypes: {
    title: { control: 'text', description: 'Instruction shown in the scanner dialog.' },
    acceptedPrefixes: { control: 'object', description: 'Accepted barcode payload prefixes.' },
    pauseAfterScanMs: { control: { type: 'number', min: 0, max: 5000, step: 100 }, description: 'Pause the camera after a successful scan.' },
    continuousMode: { control: 'boolean', description: 'Keep scanning after a successful result.' },
    mode: { control: 'object', description: 'Barcode formats accepted by the dialog scanner.' },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A dialog host supplies the scanner data and a close handler. Use the controls to review one-shot and continuous scan modes.',
      },
    },
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<AztecScannerDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = canvas.getByRole('dialog', { name: 'Leitor de código' });
    await expect(within(dialog).getByRole('heading', { name: 'Escanear carteira' })).toBeVisible();
    await expect(within(dialog).getByRole('button', { name: /cancelar/i })).toBeVisible();
  },
};

export const ContinuousScan: Story = {
  args: {
    title: 'Coleta contínua',
    continuousMode: true,
    acceptedPrefixes: ['user:', 'attendance:'],
  },
};

export const QrAndAztecCodes: Story = {
  args: {
    title: 'Escanear ingresso ou carteira',
    acceptedPrefixes: ['ticket:', 'user:'],
    mode: ['Aztec', 'QRCode'],
  },
};
