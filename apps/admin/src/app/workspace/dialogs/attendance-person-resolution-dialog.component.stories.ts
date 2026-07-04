import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import type { EventAttendanceCsvImportAmbiguousValue } from '@cacic-fct/event-manager-admin-contracts';
import { AttendancePersonResolutionDialogComponent } from './attendance-person-resolution-dialog.component';

type ResolutionDialogStoryArgs = {
  longContent: boolean;
  multipleValues: boolean;
};

const dialogRefMock = {
  close: () => undefined,
};

const ambiguousValues: EventAttendanceCsvImportAmbiguousValue[] = [
  {
    value: '11999999975',
    candidates: [
      {
        id: 'document-person',
        name: 'Ana Clara Silva',
        email: 'ana.clara@example.com',
        phone: null,
        identityDocument: '119.999.999-75',
        academicId: '123456',
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      },
      {
        id: 'phone-person',
        name: 'Bruno Pereira',
        email: 'bruno.pereira@example.com',
        phone: '+55 (11) 99999-9975',
        identityDocument: '529.982.247-25',
        academicId: '654321',
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      },
    ],
  },
  {
    value: '21912345692',
    candidates: [
      {
        id: 'long-document-person',
        name: 'Carolina Mariana de Albuquerque Vasconcelos',
        email: 'carolina.albuquerque.vasconcelos@example.com',
        phone: '+55 (21) 91234-5692',
        identityDocument: '219.123.456-92',
        academicId: '202612345678',
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      },
      {
        id: 'long-phone-person',
        name: 'Daniel Henrique Souza Nascimento',
        email: null,
        phone: '+5521912345692',
        identityDocument: null,
        academicId: null,
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      },
    ],
  },
];

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
            ambiguousValues: this.multipleValues() ? ambiguousValues : ambiguousValues.slice(0, 1),
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
    await userEvent.click(await canvas.findByText('Bruno Pereira'));
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
