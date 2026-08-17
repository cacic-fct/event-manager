import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { CloneAssetDialogComponent, CloneAssetPartOption } from './clone-asset-dialog.component';

type CloneAssetDialogStoryArgs = {
  sourceName: string;
  title: string;
  sourceLabel: string;
  copySuffix: string;
  includeLecturers: boolean;
  includeCertificate: boolean;
  includeAttendance: boolean;
  disableCertificate: boolean;
  defaultSelected: boolean;
};

const dialogRefMock = {
  close: () => undefined,
};

function parts(args: CloneAssetDialogStoryArgs): CloneAssetPartOption[] {
  const options: CloneAssetPartOption[] = [
    {
      key: 'lecturers',
      label: 'Ministrantes',
      description: 'Copia os vínculos com pessoas ministrantes.',
      defaultSelected: args.defaultSelected,
    },
    {
      key: 'certificateConfig',
      label: 'Configuração de certificado',
      description: 'Copia regras de emissão e modelos de certificado.',
      defaultSelected: args.defaultSelected,
      disabled: args.disableCertificate,
      disabledReason: 'Exige permissão para visualizar e criar configurações de certificado.',
    },
    {
      key: 'attendanceSettings',
      label: 'Presença',
      description: 'Copia coleta e janelas de presença, sem copiar o código de presença.',
      defaultSelected: args.defaultSelected,
    },
  ];
  return options.filter((part) => {
    if (part.key === 'lecturers') return args.includeLecturers;
    if (part.key === 'certificateConfig') return args.includeCertificate;
    return args.includeAttendance;
  });
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
  readonly title = input('Duplicar evento');
  readonly sourceLabel = input('Evento existente');
  readonly copySuffix = input('(cópia)');
  readonly includeLecturers = input(true);
  readonly includeCertificate = input(true);
  readonly includeAttendance = input(true);
  readonly disableCertificate = input(false);
  readonly defaultSelected = input(true);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: this.title(),
            sourceLabel: this.sourceLabel(),
            sourceName: this.sourceName(),
            defaultName: `${this.sourceName()} ${this.copySuffix()}`.trim(),
            parts: parts({
              sourceName: this.sourceName(),
              title: this.title(),
              sourceLabel: this.sourceLabel(),
              copySuffix: this.copySuffix(),
              includeLecturers: this.includeLecturers(),
              includeCertificate: this.includeCertificate(),
              includeAttendance: this.includeAttendance(),
              disableCertificate: this.disableCertificate(),
              defaultSelected: this.defaultSelected(),
            }),
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
    title: 'Duplicar evento',
    sourceLabel: 'Evento existente',
    copySuffix: '(cópia)',
    includeLecturers: true,
    includeCertificate: true,
    includeAttendance: true,
    disableCertificate: false,
    defaultSelected: true,
  },
  argTypes: {
    sourceName: { control: 'text' },
    title: { control: 'text' },
    sourceLabel: { control: 'text' },
    copySuffix: { control: 'text' },
    includeLecturers: { control: 'boolean' },
    includeCertificate: { control: 'boolean' },
    includeAttendance: { control: 'boolean' },
    disableCertificate: { control: 'boolean' },
    defaultSelected: { control: 'boolean' },
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
    disableCertificate: true,
  },
};

export const NoOptionalParts: Story = {
  args: { includeLecturers: false, includeCertificate: false, includeAttendance: false },
};

export const NothingPreselected: Story = {
  args: { defaultSelected: false },
};

export const LongContentMobile: Story = {
  args: {
    title: 'Duplicar atividade interdisciplinar',
    sourceLabel: 'Evento acadêmico, cultural e esportivo existente',
    sourceName: 'Oficina interdisciplinar de tecnologia, acessibilidade e extensão universitária',
    copySuffix: '(cópia para revisão editorial e publicação futura)',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const DarkReducedMotion: Story = {
  ...MissingCertificatePermission,
  globals: { theme: 'dark', motion: 'reduced' },
};
