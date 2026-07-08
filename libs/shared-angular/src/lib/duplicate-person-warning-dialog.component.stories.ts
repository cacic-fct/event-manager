import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import {
  DuplicatePersonWarningDialogComponent,
  DuplicatePersonWarningDialogData,
} from './duplicate-person-warning-dialog.component';

type DuplicatePersonWarningDialogStoryArgs = DuplicatePersonWarningDialogData;

const dialogRefMock = {
  close: () => undefined,
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

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { message: this.message() } satisfies DuplicatePersonWarningDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<DuplicatePersonWarningDialogStoryArgs> = {
  component: DuplicatePersonWarningDialogStoryHostComponent,
  title: 'Shared/Dialogs/Duplicate Person Warning Dialog',
  tags: ['autodocs'],
  args: {
    message: 'Já existe uma pessoa com este CPF vinculada ao workspace.',
  },
  argTypes: {
    message: { control: 'text' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<DuplicatePersonWarningDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Registro duplicado')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /entendi/i })).toBeDisabled();
  },
};

export const LongMessage: Story = {
  args: {
    message:
      'Encontramos outro registro com o mesmo documento, e-mail secundário ou código externo. Revise os dados antes de continuar com a coleta de presença.',
  },
};

