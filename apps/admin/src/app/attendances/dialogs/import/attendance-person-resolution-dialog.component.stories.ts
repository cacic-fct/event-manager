import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { AttendancePersonResolutionDialogComponent } from './attendance-person-resolution-dialog.component';
import { attendanceResolutionStoryAmbiguousValues } from './attendance-person-story-fixtures';

type ResolutionDialogStoryArgs = {
  title: string;
  description: string;
  confirmLabel: string;
  longContent: boolean;
  ambiguousValueCount: number;
  candidateCount: number;
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
  readonly title = input('Escolher pessoa correta');
  readonly description = input('Alguns dados podem identificar mais de uma pessoa. Selecione a pessoa correta.');
  readonly confirmLabel = input('Continuar importação');
  readonly longContent = input(false);
  readonly ambiguousValueCount = input(1);
  readonly candidateCount = input(2);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: this.longContent() ? 'Resolver dados ambíguos encontrados no CSV de presença' : this.title(),
            description: this.description(),
            confirmLabel: this.confirmLabel(),
            ambiguousValues: Array.from({ length: this.ambiguousValueCount() }, (_, index) => {
              const source = attendanceResolutionStoryAmbiguousValues[index % attendanceResolutionStoryAmbiguousValues.length];
              return {
                value: `${source.value}-${index + 1}`,
                candidates: Array.from({ length: this.candidateCount() }, (_candidate, candidateIndex) => {
                  const person = source.candidates[candidateIndex % source.candidates.length];
                  return { ...person, id: `${person.id}-${index + 1}-${candidateIndex + 1}` };
                }),
              };
            }),
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
    title: 'Escolher pessoa correta',
    description: 'Alguns dados podem identificar mais de uma pessoa. Selecione a pessoa correta.',
    confirmLabel: 'Continuar importação',
    longContent: false,
    ambiguousValueCount: 1,
    candidateCount: 2,
  },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    confirmLabel: { control: 'text' },
    longContent: { control: 'boolean' },
    ambiguousValueCount: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    candidateCount: { control: { type: 'range', min: 0, max: 8, step: 1 } },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<ResolutionDialogStoryArgs>;

export const Playground: Story = {
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
    ambiguousValueCount: 2,
    candidateCount: 2,
    longContent: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Resolver dados ambíguos encontrados no CSV de presença')).toBeVisible();
    await expect(await canvas.findByText('Carolina Mariana de Albuquerque Vasconcelos')).toBeVisible();
  },
};

export const DenseResolutionMatrix: Story = {
  args: { ambiguousValueCount: 12, candidateCount: 8 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('radio')).toHaveLength(96);
  },
};

export const NoAmbiguities: Story = {
  args: { ambiguousValueCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: /continuar importação/i })).toBeEnabled();
  },
};

export const NoCandidates: Story = {
  args: { ambiguousValueCount: 2, candidateCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByRole('radio')).toHaveLength(0);
    await expect(within(canvasElement).getByRole('button', { name: /continuar importação/i })).toBeDisabled();
  },
};

export const DarkReducedMotion: Story = {
  ...MultipleValues,
  globals: { theme: 'dark', motion: 'reduced' },
};
