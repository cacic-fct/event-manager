import { NgComponentOutlet } from '@angular/common';
import { Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { withScenarioControls } from './storybook/scenario-controls.decorator';
import {
  DuplicatePersonWarningDialogComponent,
  DuplicatePersonWarningDialogData,
} from './duplicate-person-warning-dialog.component';

type DuplicatePersonWarningDialogStoryArgs = DuplicatePersonWarningDialogData & {
  closed: ReturnType<typeof fn>;
};

@Component({
  selector: 'lib-storybook-duplicate-person-warning-dialog-host',
  imports: [NgComponentOutlet],
  template: `<ng-container [ngComponentOutlet]="component" [ngComponentOutletInjector]="storyInjector()" />`,
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
  title: 'Shared/Dialogs/Duplicate Person Warning',
  tags: ['autodocs'],
  decorators: [withScenarioControls<DuplicatePersonWarningDialogStoryArgs>()],
  args: {
    message: 'Já existe uma pessoa com este CPF vinculada ao workspace.',
    closed: fn(),
  },
  argTypes: {
    message: { control: 'text', description: 'Safe explanation shown before stopping a duplicate registration.' },
    closed: { table: { disable: true } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
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
