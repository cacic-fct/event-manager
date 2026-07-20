import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { SubscriberCsvExportDialogComponent } from './subscriber-csv-export-dialog.component';

type SubscriberCsvExportStoryArgs = {
  title: string;
  recordCount: number;
};

const dialogRefMock = {
  close: () => undefined,
};

@Component({
  selector: 'app-storybook-subscriber-csv-export-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class SubscriberCsvExportDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = SubscriberCsvExportDialogComponent;
  readonly title = input('Exportar inscritos');
  readonly recordCount = input(128);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: this.title(),
            recordCount: this.recordCount(),
          },
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<SubscriberCsvExportStoryArgs> = {
  component: SubscriberCsvExportDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Subscriber Csv Export Dialog',
  tags: ['autodocs'],
  args: {
    title: 'Exportar inscritos confirmados',
    recordCount: 128,
  },
  argTypes: {
    title: { control: 'text' },
    recordCount: { control: { type: 'range', min: 0, max: 500, step: 1 } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<SubscriberCsvExportStoryArgs>;

async function exerciseStory(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await expect(await canvas.findByText(/registros carregados/i)).toBeVisible();
  await userEvent.click(await canvas.findByLabelText(/documento de identidade/i));
}

export const Playground: Story = {
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const EmptySelection: Story = {
  args: {
    title: 'Exportar lista filtrada',
    recordCount: 0,
  },
  };
