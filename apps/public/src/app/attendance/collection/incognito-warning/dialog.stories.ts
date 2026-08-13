import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { AttendanceIncognitoWarningDialog, type AttendanceIncognitoWarningDialogData } from './dialog';

interface IncognitoWarningStoryArgs {
  step: AttendanceIncognitoWarningDialogData['step'];
}

@Component({
  selector: 'app-storybook-incognito-warning-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class IncognitoWarningStoryHost {
  private readonly injector = inject(Injector);

  readonly component = AttendanceIncognitoWarningDialog;
  readonly step = input<AttendanceIncognitoWarningDialogData['step']>(1);
  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { step: this.step() } satisfies AttendanceIncognitoWarningDialogData,
        },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    }),
  );
}

const meta: Meta<IncognitoWarningStoryArgs> = {
  component: IncognitoWarningStoryHost,
  title: 'CACiC Eventos/Attendance/Collection/Incognito Warning Dialog',
  tags: ['autodocs'],
  args: { step: 1 },
  argTypes: {
    step: {
      control: 'inline-radio',
      options: [1, 2],
      description: 'Etapa do aviso progressivo exibido antes da coleta off-line.',
    },
  },
  parameters: {
    docs: {
      description: {
        component: 'Aviso em duas etapas para explicar o risco de perder presenças off-line em uma janela anônima.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<IncognitoWarningStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Navegação privativa detectada')).toBeVisible();
  },
};

export const FinalConfirmation: Story = {
  args: { step: 2 },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Confirme antes de continuar')).toBeVisible();
  },
};

export const MobileFirstWarning: Story = {
  args: { step: 1 },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Navegação privativa detectada')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Entendi' })).toBeVisible();
  },
};
