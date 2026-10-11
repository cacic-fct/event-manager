import { NgComponentOutlet } from '@angular/common';
import { Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { AttendanceIncognitoWarningDialog, type AttendanceIncognitoWarningDialogData } from './dialog';

interface IncognitoWarningStoryArgs {
  step: AttendanceIncognitoWarningDialogData['step'];
}

@Component({
  selector: 'app-storybook-incognito-warning-host',
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
  title: 'Public/Attendance/Collection/Incognito Warning',
  tags: ['autodocs'],
  args: { step: 1 },
  argTypes: {
    step: {
      control: 'inline-radio',
      options: [1, 2],
      name: 'Warning Step',
      description: 'Selects which step of the offline collection warning to show.',
    },
  },
  parameters: {
    docs: {
      description: {
        component: 'Two-step warning that explains the risk of losing offline attendance in a private browsing window.',
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
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Confirme antes de continuar')).toBeVisible();
  },
};
