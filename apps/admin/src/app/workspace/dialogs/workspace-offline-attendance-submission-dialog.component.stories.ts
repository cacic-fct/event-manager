import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import type { AttendanceCreationMethod } from '../../graphql/models';
import { WorkspaceOfflineAttendanceSubmissionDialogComponent } from './workspace-offline-attendance-submission-dialog.component';

type OfflineSubmissionStoryArgs = {
  eventName: string;
  personName: string;
  canReview: boolean;
  createdByMethod: Extract<AttendanceCreationMethod, 'SCANNER' | 'MANUAL_INPUT'>;
  hasResolutionError: boolean;
  hasLocation: boolean;
  stagedReason: string;
};

const defaultArgs: OfflineSubmissionStoryArgs = {
  eventName: 'Credenciamento geral',
  personName: 'Ana Clara Silva',
  canReview: true,
  createdByMethod: 'SCANNER',
  hasResolutionError: false,
  hasLocation: true,
  stagedReason: 'Coleta sincronizada após a janela de autorização.',
};

const dialogRefMock = {
  close: () => undefined,
};

@Component({
  selector: 'app-storybook-offline-attendance-submission-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class OfflineAttendanceSubmissionDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = WorkspaceOfflineAttendanceSubmissionDialogComponent;
  readonly eventName = input(defaultArgs.eventName);
  readonly personName = input(defaultArgs.personName);
  readonly canReview = input(defaultArgs.canReview);
  readonly createdByMethod = input<Extract<AttendanceCreationMethod, 'SCANNER' | 'MANUAL_INPUT'>>(
    defaultArgs.createdByMethod,
  );
  readonly hasResolutionError = input(defaultArgs.hasResolutionError);
  readonly hasLocation = input(defaultArgs.hasLocation);
  readonly stagedReason = input(defaultArgs.stagedReason);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            canReview: this.canReview(),
            submission: {
              id: 'offline-submission-story',
              clientId: 'client-story',
              eventId: 'event-story',
              eventName: this.eventName(),
              personId: 'person-story',
              personName: this.personName(),
              status: 'PENDING',
              createdByMethod: this.createdByMethod(),
              scannerCode: this.createdByMethod() === 'SCANNER' ? `user:${faker.string.uuid()}` : null,
              manualValue:
                this.createdByMethod() === 'MANUAL_INPUT'
                  ? faker.internet.email({ firstName: 'ana', lastName: 'silva' }).toLocaleLowerCase('pt-BR')
                  : null,
              collectedAt: '2026-06-25T18:45:00.000Z',
              authorUserId: 'collector-story',
              authorName: 'Marina Costa',
              authorEmail: 'marina.costa@example.com',
              submittedById: 'sender-story',
              submittedByFullName: 'João Pereira',
              submittedAt: '2026-06-25T19:12:00.000Z',
              stagedReason: this.stagedReason() || null,
              resolutionError: this.hasResolutionError()
                ? 'Não foi possível localizar uma pessoa única para o dado coletado.'
                : null,
              collectedLatitude: this.hasLocation() ? -22.1211 : null,
              collectedLongitude: this.hasLocation() ? -51.4086 : null,
              collectedAccuracyMeters: this.hasLocation() ? 11 : null,
              committedAt: null,
              committedById: null,
              committedByFullName: null,
              rejectedAt: null,
              rejectedById: null,
              rejectedByFullName: null,
              rejectionReason: null,
            },
          },
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<OfflineSubmissionStoryArgs> = {
  component: OfflineAttendanceSubmissionDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Workspace Offline Attendance Submission Dialog',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    eventName: { control: 'text' },
    personName: { control: 'text' },
    canReview: { control: 'boolean' },
    createdByMethod: { control: 'select', options: ['SCANNER', 'MANUAL_INPUT'] },
    hasResolutionError: { control: 'boolean' },
    hasLocation: { control: 'boolean' },
    stagedReason: { control: 'text' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<OfflineSubmissionStoryArgs>;

export const Approvable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Presença off-line em revisão')).toBeVisible();
    await expect(await canvas.findByRole('button', { name: 'Aprovar' })).toBeEnabled();
  },
};

export const ReadOnly: Story = {
  args: {
    canReview: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Presença off-line em revisão')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
  },
};

export const ResolutionError: Story = {
  args: {
    hasResolutionError: true,
    createdByMethod: 'MANUAL_INPUT',
    stagedReason: '',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Erro de identificação')).toBeVisible();
    await expect(await canvas.findByRole('button', { name: 'Aprovar' })).toBeDisabled();
  },
};

export const WithoutLocation: Story = {
  args: {
    hasLocation: false,
    createdByMethod: 'MANUAL_INPUT',
  },
};
