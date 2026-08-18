import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import {
  DuplicatePersonWarningDialogComponent,
  DuplicatePersonWarningDialogData,
} from './duplicate-person-warning-dialog.component';

type DuplicatePersonWarningDialogStoryArgs = DuplicatePersonWarningDialogData & {
  closed: ReturnType<typeof fn>;
};

@Component({
  selector: 'lib-storybook-duplicate-person-warning-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class DuplicatePersonWarningDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = DuplicatePersonWarningDialogComponent;
  readonly message = input('Já existe uma pessoa com este CPF vinculada ao workspace.');
  readonly closed = input<() => void>(() => undefined);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { message: this.message() } satisfies DuplicatePersonWarningDialogData,
        },
        { provide: MatDialogRef, useValue: { close: () => this.closed()() } },
      ],
    }),
  );
}

const meta: Meta<DuplicatePersonWarningDialogStoryArgs> = {
  component: DuplicatePersonWarningDialogStoryHostComponent,
  title: 'CACiC Eventos/Shared/Dialogs/Duplicate person warning',
  tags: ['autodocs'],
  args: {
    message: 'Já existe uma pessoa com este CPF vinculada ao workspace.',
    closed: fn(),
  },
  argTypes: {
    message: { control: 'text', description: 'Motivo seguro para interromper o cadastro duplicado.' },
    closed: { table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<DuplicatePersonWarningDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Registro duplicado')).toBeVisible();
    const acknowledgement = canvas.getByRole('button', { name: /entendi/i });
    await expect(acknowledgement).toBeDisabled();
    await waitFor(() => expect(acknowledgement).toBeEnabled(), { timeout: 3500 });
    await userEvent.click(acknowledgement);
    await expect(args.closed).toHaveBeenCalledOnce();
  },
};

export const LongMessage: Story = {
  args: {
    message:
      'Encontramos outro registro com o mesmo documento, e-mail secundário ou código externo. Revise os dados antes de continuar com a coleta de presença.',
  },
};

export const DarkReducedMotion: Story = {
  args: {
    message: 'Já existe uma pessoa com este e-mail institucional vinculada a outra conta.',
    closed: fn(),
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
