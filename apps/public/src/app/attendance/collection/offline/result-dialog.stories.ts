import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import {
  AttendanceOfflineSyncResultDialog,
  type AttendanceOfflineSyncResultDialogData,
} from './result-dialog';

interface OfflineResultStoryArgs {
  createdCount: number;
  stagedCount: number;
  failedCount: number;
}

faker.seed(20260724);
const failureMessages = Array.from({ length: 5 }, (_, index) => ({
  eventName: faker.helpers.arrayElement([
    'Arquitetura Angular com Signals',
    'Acessibilidade na prática',
    'APIs GraphQL seguras',
    'Deploy observável',
  ]),
  message: index % 2 === 0 ? 'Participante não encontrado.' : 'Presença já registrada.',
}));

@Component({
  selector: 'app-storybook-offline-result-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class OfflineResultStoryHost {
  private readonly injector = inject(Injector);

  readonly component = AttendanceOfflineSyncResultDialog;
  readonly createdCount = input(3);
  readonly stagedCount = input(1);
  readonly failedCount = input(0);
  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            createdCount: this.createdCount(),
            stagedCount: this.stagedCount(),
            failedItems: failureMessages.slice(0, this.failedCount()),
          } satisfies AttendanceOfflineSyncResultDialogData,
        },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    }),
  );
}

const meta: Meta<OfflineResultStoryArgs> = {
  component: OfflineResultStoryHost,
  title: 'Public/Attendance/Dialogs/Offline Sync Result',
  tags: ['autodocs'],
  args: {
    createdCount: 3,
    stagedCount: 1,
    failedCount: 0,
  },
  argTypes: {
    createdCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    stagedCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    failedCount: { control: { type: 'range', min: 0, max: failureMessages.length, step: 1 } },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Resumo da sincronização off-line, incluindo registros aceitos, itens enviados para revisão e falhas finais.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<OfflineResultStoryArgs>;

export const SuccessfulAndStaged: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('3 presença(s) registrada(s) no servidor.')).toBeVisible();
    await expect(canvas.getByText('1 presença(s) enviada(s) para revisão administrativa.')).toBeVisible();
  },
};

export const PartialFailure: Story = {
  args: { createdCount: 2, stagedCount: 1, failedCount: 3 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Algumas presenças não foram enviadas/)).toBeVisible();
  },
};

export const FailuresOnly: Story = {
  args: { createdCount: 0, stagedCount: 0, failedCount: 5 },
};
