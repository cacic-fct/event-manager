import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
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
  title: 'Shared/Scanner/Aztec Scanner Dialog',
  tags: ['autodocs'],
  args: {
    title: 'Escanear carteira',
    acceptedPrefixes: ['user:'],
    pauseAfterScanMs: 1800,
    continuousMode: false,
    mode: ['Aztec'],
  },
  argTypes: {
    title: { control: 'text' },
    acceptedPrefixes: { control: 'object' },
    pauseAfterScanMs: { control: { type: 'number', min: 0, max: 5000, step: 100 } },
    continuousMode: { control: 'boolean' },
    mode: { control: 'object' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<AztecScannerDialogStoryArgs>;

export const SingleScan: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Escanear carteira')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /cancelar/i })).toBeVisible();
  },
};

export const ContinuousScan: Story = {
  args: {
    title: 'Coleta contínua',
    continuousMode: true,
    acceptedPrefixes: ['user:', 'attendance:'],
  },
};

