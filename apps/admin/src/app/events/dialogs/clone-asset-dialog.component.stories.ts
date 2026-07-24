import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { CloneAssetDialogComponent, CloneAssetPartOption } from './clone-asset-dialog.component';

type CloneAssetDialogStoryArgs = {
  sourceName: string;
  includeDisabledOption: boolean;
};

const dialogRefMock = {
  close: () => undefined,
};

function parts(includeDisabledOption: boolean): CloneAssetPartOption[] {
  return [
    {
      key: 'lecturers',
      label: 'Ministrantes',
      description: 'Copia os vínculos com pessoas ministrantes.',
      defaultSelected: true,
    },
    {
      key: 'certificateConfig',
      label: 'Configuração de certificado',
      description: 'Copia regras de emissão e modelos de certificado.',
      defaultSelected: true,
      disabled: includeDisabledOption,
      disabledReason: 'Exige permissão para visualizar e criar configurações de certificado.',
    },
    {
      key: 'attendanceSettings',
      label: 'Presença',
      description: 'Copia coleta e janelas de presença, sem copiar o código de presença.',
      defaultSelected: true,
    },
  ];
}

@Component({
  selector: 'app-storybook-clone-asset-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class CloneAssetDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = CloneAssetDialogComponent;
  readonly sourceName = input('Oficina de Git');
  readonly includeDisabledOption = input(false);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: 'Duplicar evento',
            sourceLabel: 'Evento existente',
            sourceName: this.sourceName(),
            defaultName: `${this.sourceName()} (cópia)`,
            parts: parts(this.includeDisabledOption()),
          },
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<CloneAssetDialogStoryArgs> = {
  component: CloneAssetDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Clone Asset Dialog',
  tags: ['autodocs'],
  args: {
    sourceName: 'Oficina de Git',
    includeDisabledOption: false,
  },
  argTypes: {
    sourceName: { control: 'text' },
    includeDisabledOption: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<CloneAssetDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Duplicar evento')).toBeVisible();
    await expect(await canvas.findByLabelText('Nome do novo cadastro')).toHaveValue('Oficina de Git (cópia)');
  },
};

export const MissingCertificatePermission: Story = {
  args: {
    includeDisabledOption: true,
  },
};
