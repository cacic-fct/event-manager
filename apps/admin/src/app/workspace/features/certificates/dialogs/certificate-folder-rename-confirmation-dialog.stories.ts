import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { ConfirmationDialogComponent, ConfirmationDialogData } from '../../../../shared/components/confirmation-dialog.component';

type CertificateFolderRenameStoryArgs = {
  newFolderName: string;
};

const dialogRefMock = {
  close: () => undefined,
};

@Component({
  selector: 'app-storybook-certificate-folder-rename-confirmation-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class CertificateFolderRenameConfirmationDialogStoryComponent {
  private readonly injector = inject(Injector);

  readonly component = ConfirmationDialogComponent;
  readonly newFolderName = input('Atividades complementares');
  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: 'Renomear pasta e reemitir certificados?',
            message: 'Alterar o nome da pasta será refletido em todos os certificados já emitidos nela.',
            details: [
              `Novo nome: ${this.newFolderName()}.`,
              'Escopo: todas as configurações ativas desta pasta.',
              'Os certificados existentes serão reemitidos com o novo nome da pasta.',
            ],
            confirmLabel: 'Renomear e reemitir',
            tone: 'danger',
          } satisfies ConfirmationDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<CertificateFolderRenameStoryArgs> = {
  component: CertificateFolderRenameConfirmationDialogStoryComponent,
  title: 'CACiC Eventos/Workspace/Certificates/Rename Folder Confirmation',
  tags: ['autodocs'],
  args: {
    newFolderName: 'Atividades complementares',
  },
  argTypes: {
    newFolderName: { control: 'text' },
  },
  parameters: {
    layout: 'centered',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CertificateFolderRenameStoryArgs>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('heading', { name: 'Renomear pasta e reemitir certificados?' }),
    ).toBeVisible();
    await expect(canvas.getByText('Escopo: todas as configurações ativas desta pasta.')).toBeVisible();
    await userEvent.hover(canvas.getByRole('button', { name: 'Renomear e reemitir' }));
  },
};
