import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AttendanceCsvImportResultDialogComponent } from './attendance-csv-import-result-dialog.component';

type ImportResultStoryArgs = {
  failedCount: number;
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
  readonly failedCount = input(1);
  readonly longContent = input(false);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            createdCount: 42,
            duplicateCount: 3,
            failedCount: this.failedCount(),
            failedValues:
              this.failedCount() > 0
                ? [
                    this.longContent()
                      ? 'participante-com-identificador-muito-longo-que-precisa-quebrar-linha@example.com'
                      : 'missing@example.com',
                  ]
                : [],
            inferredMatchType: 'IDENTITY_DOCUMENT',
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
    failedCount: 1,
    longContent: false,
  },
  argTypes: {
    failedCount: { control: { type: 'range', min: 0, max: 5, step: 1 } },
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

export const DefaultDialog: Story = {
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
