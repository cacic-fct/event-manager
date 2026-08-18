import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import {
  SubscriptionCsvColumnDialogComponent,
  type SubscriptionCsvColumnDialogData,
} from './subscription-csv-column-dialog.component';

interface CsvColumnStoryArgs {
  fileName: string;
  emailHeader: string;
  nameHeader: string;
  eventIdsHeader: string;
  documentHeader: string;
  extraColumnCount: number;
  previewRowCount: number;
  longValues: boolean;
}

const defaultArgs: CsvColumnStoryArgs = {
  fileName: 'inscricoes-cacic-2026.csv',
  emailHeader: 'E-mail',
  nameHeader: 'Nome completo',
  eventIdsHeader: 'IDs dos eventos',
  documentHeader: 'CPF',
  extraColumnCount: 2,
  previewRowCount: 4,
  longValues: false,
};

function buildData(args: CsvColumnStoryArgs): SubscriptionCsvColumnDialogData {
  faker.seed(20260816 + args.extraColumnCount + args.previewRowCount);
  const coreHeaders = [args.emailHeader, args.nameHeader, args.eventIdsHeader, args.documentHeader].filter(Boolean);
  const extraHeaders = Array.from({ length: Math.max(0, Math.min(20, args.extraColumnCount)) }, (_, index) =>
    args.longValues ? `Campo adicional institucional detalhado ${index + 1}` : `Extra ${index + 1}`,
  );
  const headers = [...new Set([...coreHeaders, ...extraHeaders])];
  const previewRows = Array.from({ length: Math.max(0, Math.min(30, args.previewRowCount)) }, (_, index) =>
    Object.fromEntries(
      headers.map((header) => {
        if (header === args.emailHeader) return [header, faker.internet.email().toLocaleLowerCase('pt-BR')];
        if (header === args.nameHeader) return [header, faker.person.fullName()];
        if (header === args.eventIdsHeader) {
          const value = args.longValues
            ? `evento-interdisciplinar-${index + 1};oficina-acessibilidade-${index + 1};palestra-seguranca-${index + 1}`
            : `event-${index + 1};event-${index + 2}`;
          return [header, value];
        }
        if (header === args.documentHeader) return [header, faker.string.numeric(11)];
        return [header, faker.company.catchPhrase()];
      }),
    ),
  );
  return { fileName: args.fileName, headers, previewRows };
}

@Component({
  selector: 'app-storybook-subscription-csv-column-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class CsvColumnStoryHost {
  private readonly injector = inject(Injector);
  readonly component = SubscriptionCsvColumnDialogComponent;
  readonly fileName = input(defaultArgs.fileName);
  readonly emailHeader = input(defaultArgs.emailHeader);
  readonly nameHeader = input(defaultArgs.nameHeader);
  readonly eventIdsHeader = input(defaultArgs.eventIdsHeader);
  readonly documentHeader = input(defaultArgs.documentHeader);
  readonly extraColumnCount = input(defaultArgs.extraColumnCount);
  readonly previewRowCount = input(defaultArgs.previewRowCount);
  readonly longValues = input(defaultArgs.longValues);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: buildData({
            fileName: this.fileName(),
            emailHeader: this.emailHeader(),
            nameHeader: this.nameHeader(),
            eventIdsHeader: this.eventIdsHeader(),
            documentHeader: this.documentHeader(),
            extraColumnCount: this.extraColumnCount(),
            previewRowCount: this.previewRowCount(),
            longValues: this.longValues(),
          }),
        },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    }),
  );
}

const meta: Meta<CsvColumnStoryArgs> = {
  component: CsvColumnStoryHost,
  title: 'CACiC Eventos/Workspace/Dialogs/Subscription Csv Column Dialog',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    fileName: { control: 'text' },
    emailHeader: { control: 'text' },
    nameHeader: { control: 'text' },
    eventIdsHeader: { control: 'text' },
    documentHeader: { control: 'text' },
    extraColumnCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    previewRowCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    longValues: { control: 'boolean' },
  },
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<CsvColumnStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(defaultArgs.fileName)).toBeVisible();
    await expect(await canvas.findAllByRole('combobox')).toHaveLength(7);
    await expect(canvas.getByRole('button', { name: 'Importar' })).toBeDisabled();
  },
};

export const DenseCsv: Story = {
  args: { extraColumnCount: 20, previewRowCount: 30 },
};

export const MinimalHeaders: Story = {
  args: { documentHeader: '', extraColumnCount: 0, previewRowCount: 1 },
};

export const NoHeaders: Story = {
  args: { emailHeader: '', nameHeader: '', eventIdsHeader: '', documentHeader: '', extraColumnCount: 0 },
};

export const NoPreviewRows: Story = {
  args: { previewRowCount: 0 },
};

export const LongContentMobile: Story = {
  args: {
    fileName: 'inscricoes-interdisciplinares-universitarias-com-dados-complementares-2026.csv',
    extraColumnCount: 10,
    previewRowCount: 12,
    longValues: true,
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
