import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  AttendanceCsvColumnDialogComponent,
  AttendanceCsvColumnDialogData,
} from './attendance-csv-column-dialog.component';

interface CsvColumnDialogStoryArgs {
  fileName: string;
  title: string;
  confirmLabel: string;
  headerCount: number;
  previewRowCount: number;
  emptyValueEvery: number;
  longValues: boolean;
}

const closeMock = fn();

@Component({
  selector: 'app-storybook-attendance-csv-column-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class AttendanceCsvColumnDialogStoryHostComponent {
  private readonly injector = inject(Injector);
  readonly component = AttendanceCsvColumnDialogComponent;
  readonly fileName = input('presencas.csv');
  readonly title = input('Importar presenças');
  readonly confirmLabel = input('Importar');
  readonly headerCount = input(4);
  readonly previewRowCount = input(6);
  readonly emptyValueEvery = input(0);
  readonly longValues = input(false);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: createDialogData(this) },
        { provide: MatDialogRef, useValue: { close: closeMock } },
      ],
    }),
  );
}

const defaultArgs: CsvColumnDialogStoryArgs = {
  fileName: 'presencas-semana-da-computacao.csv',
  title: 'Importar presenças',
  confirmLabel: 'Importar',
  headerCount: 5,
  previewRowCount: 8,
  emptyValueEvery: 0,
  longValues: false,
};

const meta: Meta<CsvColumnDialogStoryArgs> = {
  component: AttendanceCsvColumnDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Attendance CSV Column',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    fileName: { control: 'text' },
    title: { control: 'text' },
    confirmLabel: { control: 'text' },
    headerCount: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    previewRowCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    emptyValueEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    longValues: { control: 'boolean' },
  },
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<CsvColumnDialogStoryArgs>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(defaultArgs.fileName)).toBeVisible();
    await expect(canvas.getAllByRole('listitem')).toHaveLength(8);
    await userEvent.click(canvas.getByRole('button', { name: 'Importar' }));
    await expect(closeMock).toHaveBeenCalledWith('Nome');
  },
};

export const DensePreview: Story = {
  args: { headerCount: 12, previewRowCount: 30 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('listitem')).toHaveLength(8);
  },
};

export const EmptyHeaders: Story = {
  args: { headerCount: 0, previewRowCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Importar' })).toBeDisabled();
  },
};

export const EmptyPreviewValues: Story = {
  args: { previewRowCount: 8, emptyValueEvery: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByRole('listitem')).toHaveLength(0);
  },
};

export const LongContentMobile: Story = {
  args: {
    fileName: 'lista-de-presencas-do-congresso-interdisciplinar-universitario-de-tecnologia-e-acessibilidade.csv',
    title: 'Selecionar a coluna usada para localizar cada participante no cadastro institucional',
    confirmLabel: 'Continuar com a importação',
    longValues: true,
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/congresso-interdisciplinar/)).toBeVisible();
  },
};

function createDialogData(host: AttendanceCsvColumnDialogStoryHostComponent): AttendanceCsvColumnDialogData {
  faker.seed(20_260_825);
  const standardHeaders = ['Nome', 'E-mail', 'RA', 'CPF', 'Telefone', 'Turma', 'Curso', 'Campus'];
  const headers = Array.from(
    { length: Math.min(Math.max(host.headerCount(), 0), 12) },
    (_, index) => standardHeaders[index] ?? `Coluna ${index + 1}`,
  );
  const previewRows = Array.from({ length: Math.min(Math.max(host.previewRowCount(), 0), 30) }, (_, rowIndex) =>
    Object.fromEntries(
      headers.map((header, headerIndex) => {
        const empty = host.emptyValueEvery() > 0 && (rowIndex + 1) % host.emptyValueEvery() === 0;
        const value =
          headerIndex === 0
            ? host.longValues()
              ? `${faker.person.fullName()} de Albuquerque Vasconcelos — representante da comunidade universitária`
              : faker.person.fullName()
            : faker.internet.email();
        return [header, empty ? '' : value];
      }),
    ),
  );

  return {
    fileName: host.fileName(),
    title: host.title(),
    confirmLabel: host.confirmLabel(),
    headers,
    previewRows,
  };
}
