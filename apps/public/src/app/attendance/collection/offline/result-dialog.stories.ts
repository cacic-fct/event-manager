import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { AttendanceOfflineSyncResultDialog, type AttendanceOfflineSyncResultDialogData } from './result-dialog';

interface OfflineResultStoryArgs {
  createdCount: number;
  stagedCount: number;
  failedCount: number;
  failureNamePrefix: string;
  failureMessage: string;
}

function failureMessages(count: number, namePrefix: string, message: string) {
  faker.seed(20260724 + count);
  return Array.from({ length: Math.max(0, Math.min(30, Math.round(count))) }, (_, index) => ({
    eventName: `${namePrefix.trim() ? `${namePrefix.trim()} ` : ''}${faker.helpers.arrayElement([
      'Arquitetura Angular com Signals',
      'Acessibilidade na prática',
      'APIs GraphQL seguras',
      'Deploy observável',
    ])}`,
    message: message.trim() || (index % 2 === 0 ? 'Participante não encontrado.' : 'Presença já registrada.'),
  }));
}

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
  readonly failureNamePrefix = input('');
  readonly failureMessage = input('');
  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            createdCount: this.createdCount(),
            stagedCount: this.stagedCount(),
            failedItems: failureMessages(this.failedCount(), this.failureNamePrefix(), this.failureMessage()),
          } satisfies AttendanceOfflineSyncResultDialogData,
        },
        { provide: MatDialogRef, useValue: { close: () => undefined } },
      ],
    }),
  );
}

const meta: Meta<OfflineResultStoryArgs> = {
  component: OfflineResultStoryHost,
  title: 'CACiC Eventos/Attendance/Collection/Offline Sync Result Dialog',
  tags: ['autodocs'],
  args: {
    createdCount: 3,
    stagedCount: 1,
    failedCount: 0,
    failureNamePrefix: '',
    failureMessage: '',
  },
  argTypes: {
    createdCount: { control: { type: 'range', min: 0, max: 1_000, step: 1 } },
    stagedCount: { control: { type: 'range', min: 0, max: 1_000, step: 1 } },
    failedCount: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    failureNamePrefix: { control: 'text' },
    failureMessage: { control: 'text' },
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

export const Playground: Story = {
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
  args: { createdCount: 0, stagedCount: 0, failedCount: 12 },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const SuccessOnly: Story = {
  args: { createdCount: 200, stagedCount: 0, failedCount: 0 },
};

export const ReviewOnly: Story = {
  args: { createdCount: 0, stagedCount: 75, failedCount: 0 },
};

export const EmptyResult: Story = {
  args: { createdCount: 0, stagedCount: 0, failedCount: 0 },
};

export const DenseFailures: Story = {
  args: { createdCount: 120, stagedCount: 35, failedCount: 30 },
};

export const LongFailureContentMobile: Story = {
  args: {
    createdCount: 1,
    stagedCount: 1,
    failedCount: 8,
    failureNamePrefix: 'Atividade interdisciplinar de tecnologia, ciência e acessibilidade',
    failureMessage: 'A presença não pôde ser conciliada automaticamente e precisa de revisão administrativa detalhada.',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
