import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import type { MajorEventSubscriptionCsvImportResult } from '@cacic-fct/event-manager-admin-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { createAdminPerson } from '../../../testing/admin-entity-fixtures';
import { SubscriptionCsvImportResultDialogComponent } from './subscription-csv-import-result-dialog.component';

interface CsvImportResultStoryArgs {
  createdSubscriptionCount: number;
  updatedSubscriptionCount: number;
  duplicateCount: number;
  createdPeopleCount: number;
  failedCount: number;
  displayedPeopleCount: number;
  failedRowCount: number;
  longContent: boolean;
}

const defaultArgs: CsvImportResultStoryArgs = {
  createdSubscriptionCount: 10,
  updatedSubscriptionCount: 4,
  duplicateCount: 2,
  createdPeopleCount: 2,
  failedCount: 1,
  displayedPeopleCount: 2,
  failedRowCount: 1,
  longContent: false,
};

function buildResult(args: CsvImportResultStoryArgs): MajorEventSubscriptionCsvImportResult {
  faker.seed(20260816 + args.displayedPeopleCount + args.failedRowCount);
  return {
    createdSubscriptionCount: args.createdSubscriptionCount,
    updatedSubscriptionCount: args.updatedSubscriptionCount,
    duplicateCount: args.duplicateCount,
    createdPeopleCount: args.createdPeopleCount,
    failedCount: args.failedCount,
    createdPeople: Array.from({ length: Math.max(0, Math.min(30, args.displayedPeopleCount)) }, (_, index) =>
      createAdminPerson({
        id: `imported-person-${index + 1}`,
        name: args.longContent ? `${faker.person.fullName()} ${faker.company.catchPhrase()}` : faker.person.fullName(),
        email: faker.internet.email().toLocaleLowerCase('pt-BR'),
      }),
    ),
    failedRows: Array.from({ length: Math.max(0, Math.min(30, args.failedRowCount)) }, (_, index) =>
      args.longContent
        ? `Linha ${index + 2}: a inscrição para a atividade interdisciplinar não pôde ser vinculada ao cadastro institucional informado.`
        : `Linha ${index + 2}: evento inexistente ou pessoa inválida.`,
    ),
  };
}

@Component({
  selector: 'app-storybook-subscription-csv-result-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class CsvImportResultStoryHost {
  private readonly injector = inject(Injector);
  readonly component = SubscriptionCsvImportResultDialogComponent;
  readonly createdSubscriptionCount = input(defaultArgs.createdSubscriptionCount);
  readonly updatedSubscriptionCount = input(defaultArgs.updatedSubscriptionCount);
  readonly duplicateCount = input(defaultArgs.duplicateCount);
  readonly createdPeopleCount = input(defaultArgs.createdPeopleCount);
  readonly failedCount = input(defaultArgs.failedCount);
  readonly displayedPeopleCount = input(defaultArgs.displayedPeopleCount);
  readonly failedRowCount = input(defaultArgs.failedRowCount);
  readonly longContent = input(defaultArgs.longContent);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: buildResult({
            createdSubscriptionCount: this.createdSubscriptionCount(),
            updatedSubscriptionCount: this.updatedSubscriptionCount(),
            duplicateCount: this.duplicateCount(),
            createdPeopleCount: this.createdPeopleCount(),
            failedCount: this.failedCount(),
            displayedPeopleCount: this.displayedPeopleCount(),
            failedRowCount: this.failedRowCount(),
            longContent: this.longContent(),
          }),
        },
      ],
    }),
  );
}

const meta: Meta<CsvImportResultStoryArgs> = {
  component: CsvImportResultStoryHost,
  title: 'CACiC Eventos/Workspace/Dialogs/Subscription Csv Import Result Dialog',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    createdSubscriptionCount: { control: { type: 'range', min: 0, max: 5_000, step: 1 } },
    updatedSubscriptionCount: { control: { type: 'range', min: 0, max: 5_000, step: 1 } },
    duplicateCount: { control: { type: 'range', min: 0, max: 5_000, step: 1 } },
    createdPeopleCount: { control: { type: 'range', min: 0, max: 5_000, step: 1 } },
    failedCount: { control: { type: 'range', min: 0, max: 5_000, step: 1 } },
    displayedPeopleCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    failedRowCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    longContent: { control: 'boolean' },
  },
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<CsvImportResultStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('10 inscrições criadas, 4 atualizadas, 2 duplicadas, 1 falhas.')).toBeVisible();
    await expect(await canvas.findAllByRole('listitem')).toHaveLength(3);
  },
};

export const SuccessOnly: Story = {
  args: { updatedSubscriptionCount: 0, duplicateCount: 0, failedCount: 0, failedRowCount: 0 },
};

export const UpdatesAndDuplicates: Story = {
  args: { createdSubscriptionCount: 0, updatedSubscriptionCount: 250, duplicateCount: 80, failedCount: 0, failedRowCount: 0 },
};

export const FailuresOnly: Story = {
  args: {
    createdSubscriptionCount: 0,
    updatedSubscriptionCount: 0,
    duplicateCount: 0,
    createdPeopleCount: 0,
    displayedPeopleCount: 0,
    failedCount: 30,
    failedRowCount: 30,
  },
};

export const EmptyResult: Story = {
  args: {
    createdSubscriptionCount: 0,
    updatedSubscriptionCount: 0,
    duplicateCount: 0,
    createdPeopleCount: 0,
    displayedPeopleCount: 0,
    failedCount: 0,
    failedRowCount: 0,
  },
};

export const DenseMixedImport: Story = {
  args: {
    createdSubscriptionCount: 3_200,
    updatedSubscriptionCount: 1_100,
    duplicateCount: 420,
    createdPeopleCount: 300,
    displayedPeopleCount: 30,
    failedCount: 30,
    failedRowCount: 30,
  },
};

export const LongContentMobile: Story = {
  args: { displayedPeopleCount: 12, failedRowCount: 12, longContent: true },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
