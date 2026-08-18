import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AttendanceCsvImportResultDialogComponent } from './attendance-csv-import-result-dialog.component';

type ImportResultStoryArgs = {
  createdCount: number;
  duplicateCount: number;
  failedCount: number;
  failedValueCount: number;
  inferredMatchType: 'IDENTITY_DOCUMENT' | 'EMAIL' | 'FULL_NAME' | 'CUSTOM';
  title: string;
  createdLabel: string;
  duplicateLabel: string;
  longContent: boolean;
};

@Component({
  selector: 'app-storybook-attendance-csv-import-result-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class AttendanceCsvImportResultDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = AttendanceCsvImportResultDialogComponent;
  readonly createdCount = input(42);
  readonly duplicateCount = input(3);
  readonly failedCount = input(1);
  readonly failedValueCount = input(1);
  readonly inferredMatchType = input<ImportResultStoryArgs['inferredMatchType']>('IDENTITY_DOCUMENT');
  readonly title = input('Importação concluída');
  readonly createdLabel = input('novas presenças');
  readonly duplicateLabel = input('duplicadas');
  readonly longContent = input(false);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: this.title(),
            createdCount: this.createdCount(),
            duplicateCount: this.duplicateCount(),
            failedCount: this.failedCount(),
            failedValues: Array.from({ length: this.failedValueCount() }, (_, index) =>
              this.longContent()
                ? `participante-${index + 1}-com-identificador-muito-longo-que-precisa-quebrar-linha@example.com`
                : `missing-${index + 1}@example.com`,
            ),
            inferredMatchType: this.inferredMatchType(),
            createdLabel: this.createdLabel(),
            duplicateLabel: this.duplicateLabel(),
            ambiguousValues: [],
          },
        },
      ],
    }),
  );
}

const meta: Meta<ImportResultStoryArgs> = {
  component: AttendanceCsvImportResultDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Attendance Csv Import Result Dialog',
  tags: ['autodocs'],
  args: {
    createdCount: 42,
    duplicateCount: 3,
    failedCount: 1,
    failedValueCount: 1,
    inferredMatchType: 'IDENTITY_DOCUMENT',
    title: 'Importação concluída',
    createdLabel: 'novas presenças',
    duplicateLabel: 'duplicadas',
    longContent: false,
  },
  argTypes: {
    createdCount: { control: { type: 'range', min: 0, max: 10_000, step: 1 } },
    duplicateCount: { control: { type: 'range', min: 0, max: 10_000, step: 1 } },
    failedCount: { control: { type: 'range', min: 0, max: 10_000, step: 1 } },
    failedValueCount: { control: { type: 'range', min: 0, max: 50, step: 1 } },
    inferredMatchType: { control: 'select', options: ['IDENTITY_DOCUMENT', 'EMAIL', 'FULL_NAME', 'CUSTOM'] },
    title: { control: 'text' },
    createdLabel: { control: 'text' },
    duplicateLabel: { control: 'text' },
    longContent: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<ImportResultStoryArgs>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find(
    (button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true',
  );
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const Playground: Story = {
  args: {},
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const LongContent: Story = {
  args: {
    longContent: true,
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const AllSuccessful: Story = {
  args: { createdCount: 250, duplicateCount: 0, failedCount: 0, failedValueCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/Não foram encontradas pessoas/)).not.toBeInTheDocument();
    await expect(canvas.getByText(/250 novas presenças, 0 duplicadas, 0 falhas/)).toBeVisible();
  },
};

export const ManyFailures: Story = {
  args: { createdCount: 80, duplicateCount: 25, failedCount: 50, failedValueCount: 50 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('listitem')).toHaveLength(50);
  },
};

export const CustomMatchType: Story = {
  args: { inferredMatchType: 'CUSTOM', failedValueCount: 0, failedCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Tipo inferido: CUSTOM.')).toBeVisible();
  },
};

export const DarkReducedMotion: Story = {
  ...LongContent,
  globals: { theme: 'dark', motion: 'reduced' },
};
