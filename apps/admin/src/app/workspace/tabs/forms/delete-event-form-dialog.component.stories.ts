import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { DeleteEventFormDialogComponent, DeleteEventFormDialogData } from './delete-event-form-dialog.component';

type DeleteEventFormDialogStoryArgs = DeleteEventFormDialogData;

const dialogRefMock = {
  close: () => undefined,
};

@Component({
  selector: 'app-storybook-delete-event-form-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class DeleteEventFormDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = DeleteEventFormDialogComponent;
  readonly name = input('Pesquisa de satisfação');
  readonly responseCount = input(24);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            name: this.name(),
            responseCount: this.responseCount(),
          } satisfies DeleteEventFormDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<DeleteEventFormDialogStoryArgs> = {
  component: DeleteEventFormDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Forms/Delete Event Form Dialog',
  tags: ['autodocs'],
  args: {
    name: 'Pesquisa de satisfação',
    responseCount: 24,
  },
  argTypes: {
    name: { control: 'text' },
    responseCount: { control: { type: 'number', min: 0, max: 500, step: 1 } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<DeleteEventFormDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Excluir formulário?')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /excluir/i })).toBeVisible();
  },
};

export const SingleResponse: Story = {
  args: {
    name: 'Confirmação de presença',
    responseCount: 1,
  },
};

export const NoResponses: Story = {
  args: {
    name: 'Rascunho sem respostas',
    responseCount: 0,
  },
};

