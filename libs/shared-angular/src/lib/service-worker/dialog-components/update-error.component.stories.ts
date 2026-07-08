import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { UpdateErrorDialogComponent } from './update-error.component';

type UpdateErrorDialogStoryArgs = {
  error: string;
};

const dialogRefMock = {
  close: () => undefined,
};

@Component({
  selector: 'lib-storybook-update-error-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class UpdateErrorDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = UpdateErrorDialogComponent;
  readonly error = input('O pacote de atualização foi baixado, mas não pôde ser ativado.');

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { error: this.error() } },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<UpdateErrorDialogStoryArgs> = {
  component: UpdateErrorDialogStoryHostComponent,
  title: 'Shared/Service Worker/Update Error Dialog',
  tags: ['autodocs'],
  args: {
    error: 'O pacote de atualização foi baixado, mas não pôde ser ativado.',
  },
  argTypes: {
    error: { control: 'text' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<UpdateErrorDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Erro ao atualizar o aplicativo')).toBeVisible();
  },
};

