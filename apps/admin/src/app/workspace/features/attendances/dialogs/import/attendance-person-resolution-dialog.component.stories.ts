import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AttendancePersonResolutionDialogComponent } from './attendance-person-resolution-dialog.component';
import { attendanceResolutionStoryAmbiguousValues } from './attendance-person-story-fixtures';

type ResolutionDialogStoryArgs = {
  longContent: boolean;
  multipleValues: boolean;
};

const dialogRefMock = {
  close: () => undefined,
};

@Component({
  selector: 'app-storybook-attendance-person-resolution-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class AttendancePersonResolutionDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = AttendancePersonResolutionDialogComponent;
  readonly longContent = input(false);
  readonly multipleValues = input(false);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: this.longContent() ? 'Resolver dados ambíguos encontrados no CSV de presença' : undefined,
            description:
              'Alguns dados do CSV podem ser CPF ou telefone de pessoas diferentes. Selecione a pessoa correta para continuar.',
            confirmLabel: 'Continuar importação',
            ambiguousValues: this.multipleValues()
              ? attendanceResolutionStoryAmbiguousValues
              : attendanceResolutionStoryAmbiguousValues.slice(0, 1),
          },
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<ResolutionDialogStoryArgs> = {
  component: AttendancePersonResolutionDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Attendance Person Resolution Dialog',
  tags: ['autodocs'],
  args: {
    longContent: false,
    multipleValues: false,
  },
  argTypes: {
    longContent: { control: 'boolean' },
    multipleValues: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<ResolutionDialogStoryArgs>;

export const SingleValue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Escolher pessoa correta')).toBeVisible();
    await expect(await canvas.findByRole('button', { name: /continuar importação/i })).toBeDisabled();
    await userEvent.click(await canvas.findByText(attendanceResolutionStoryAmbiguousValues[0].candidates[1].name));
    await expect(await canvas.findByRole('button', { name: /continuar importação/i })).toBeEnabled();
  },
};

export const MultipleValues: Story = {
  args: {
    multipleValues: true,
    longContent: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Resolver dados ambíguos encontrados no CSV de presença')).toBeVisible();
    await expect(await canvas.findByText('Carolina Mariana de Albuquerque Vasconcelos')).toBeVisible();
  },
};
