import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { of } from 'rxjs';
import type {
  AttendanceCreationMethod,
  OfflineEventAttendanceResolutionIssue,
} from '@cacic-fct/event-manager-admin-contracts';
import { PeopleApiService } from '../../../graphql/people-api.service';
import { attendanceResolutionStoryPeople } from '../import/attendance-person-story-fixtures';
import { OfflineAttendanceSubmissionEditDialogComponent } from './offline-attendance-submission-edit-dialog.component';

type EditDialogStoryArgs = {
  eventName: string;
  personName: string;
  createdByMethod: Extract<AttendanceCreationMethod, 'SCANNER' | 'MANUAL_INPUT'>;
  issueLabel: string;
  resolutionIssue: OfflineEventAttendanceResolutionIssue | null;
  resolutionError: string;
  hasSelectedPerson: boolean;
  hasCandidates: boolean;
  longContent: boolean;
};

const candidatePeople = attendanceResolutionStoryPeople.slice(0, 2);

const defaultArgs: EditDialogStoryArgs = {
  eventName: 'Credenciamento geral',
  personName: 'Pessoa não resolvida',
  createdByMethod: 'MANUAL_INPUT',
  issueLabel: 'Pessoa não encontrada',
  resolutionIssue: 'PERSON_NOT_FOUND',
  resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
  hasSelectedPerson: false,
  hasCandidates: true,
  longContent: false,
};

const dialogRefMock = {
  close: () => undefined,
};

@Component({
  selector: 'app-storybook-offline-attendance-submission-edit-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class OfflineAttendanceSubmissionEditDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = OfflineAttendanceSubmissionEditDialogComponent;
  readonly eventName = input(defaultArgs.eventName);
  readonly personName = input(defaultArgs.personName);
  readonly createdByMethod = input<Extract<AttendanceCreationMethod, 'SCANNER' | 'MANUAL_INPUT'>>(
    defaultArgs.createdByMethod,
  );
  readonly issueLabel = input(defaultArgs.issueLabel);
  readonly resolutionIssue = input<OfflineEventAttendanceResolutionIssue | null>(defaultArgs.resolutionIssue);
  readonly resolutionError = input(defaultArgs.resolutionError);
  readonly hasSelectedPerson = input(defaultArgs.hasSelectedPerson);
  readonly hasCandidates = input(defaultArgs.hasCandidates);
  readonly longContent = input(defaultArgs.longContent);

  readonly storyInjector = computed(() => {
    const selectedPerson = this.hasSelectedPerson() ? candidatePeople[0] : null;
    return Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            issueLabel: this.issueLabel(),
            submission: {
              id: 'offline-submission-edit-story',
              clientId: 'client-edit-story',
              eventId: 'event-story',
              eventName: this.longContent()
                ? 'Credenciamento geral com nome de evento muito longo, caracteres especiais çãé e contexto suficiente para quebrar linha'
                : this.eventName(),
              personId: selectedPerson?.id ?? null,
              person: selectedPerson,
              personName: selectedPerson?.name ?? this.personName(),
              status: 'PENDING',
              createdByMethod: this.createdByMethod(),
              scannerCode: this.createdByMethod() === 'SCANNER' ? 'user:codigo-com-erro-de-digitacao' : null,
              manualValue:
                this.createdByMethod() === 'MANUAL_INPUT'
                  ? 'ana.clara@example.co'
                  : null,
              collectedAt: '2026-06-25T18:45:00.000Z',
              authorUserId: 'collector-story',
              authorName: 'Marina Costa',
              authorEmail: 'marina.costa@example.com',
              submittedById: 'sender-story',
              submittedByFullName: 'João Pereira',
              submittedAt: '2026-06-25T19:12:00.000Z',
              stagedReason: 'Coleta enviada para revisão administrativa.',
              resolutionError: this.resolutionError() || null,
              resolutionIssue: this.resolutionIssue(),
              collectedLatitude: -22.1211,
              collectedLongitude: -51.4086,
              collectedAccuracyMeters: 11,
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
        {
          provide: PeopleApiService,
          useValue: {
            listPeopleSummaries: () => of(this.hasCandidates() ? candidatePeople : []),
          },
        },
      ],
    });
  });
}

const meta: Meta<EditDialogStoryArgs> = {
  component: OfflineAttendanceSubmissionEditDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Workspace Offline Attendance Submission Edit Dialog',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    eventName: { control: 'text' },
    personName: { control: 'text' },
    createdByMethod: { control: 'select', options: ['SCANNER', 'MANUAL_INPUT'] },
    issueLabel: { control: 'text' },
    resolutionIssue: {
      control: 'select',
      options: [null, 'PERSON_NOT_FOUND', 'DUPLICATE_PERSON', 'INVALID_SCANNER_CODE', 'UNKNOWN'],
    },
    resolutionError: { control: 'text' },
    hasSelectedPerson: { control: 'boolean' },
    hasCandidates: { control: 'boolean' },
    longContent: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<EditDialogStoryArgs>;

export const ManualTypo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Corrigir presença off-line')).toBeVisible();
    await expect(await canvas.findByText('Dado original')).toBeVisible();
    await expect(await canvas.findByText('ana.clara@example.co')).toBeVisible();
    await expect(await canvas.findByDisplayValue('ana.clara@example.co')).toBeVisible();
    await expect(await canvas.findByText('E-mail detectado')).toBeVisible();
  },
};

export const ScannerCode: Story = {
  args: {
    createdByMethod: 'SCANNER',
    issueLabel: 'Código inválido',
    resolutionIssue: 'INVALID_SCANNER_CODE',
    resolutionError: 'Código Aztec incompatível.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Código do crachá')).toBeVisible();
    await expect(await canvas.findByDisplayValue('user:codigo-com-erro-de-digitacao')).toBeVisible();
    await expect(await canvas.findByText('Código de usuário detectado')).toBeVisible();
  },
};

export const SelectedPerson: Story = {
  args: {
    hasSelectedPerson: true,
    resolutionError: '',
    resolutionIssue: null,
    issueLabel: 'Revisão manual',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(candidatePeople[0].name)).toBeVisible();
    await expect(await canvas.findByRole('button', { name: 'Salvar correção' })).toBeEnabled();
  },
};

export const CandidateSearch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByLabelText('Buscar pessoa');
    await userEvent.clear(input);
    await userEvent.type(input, 'Ana');
    await userEvent.click(await canvas.findByRole('button', { name: 'Executar busca de pessoa' }));
    await expect(await canvas.findByText(candidatePeople[1].name)).toBeVisible();
  },
};

export const NoCandidates: Story = {
  args: {
    hasCandidates: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByLabelText('Buscar pessoa');
    await userEvent.clear(input);
    await userEvent.type(input, 'Não existe');
    await userEvent.click(await canvas.findByRole('button', { name: 'Executar busca de pessoa' }));
    await expect(await canvas.findByText('Nenhuma pessoa encontrada para a busca informada.')).toBeVisible();
  },
};

export const LongContent: Story = {
  args: {
    longContent: true,
    personName:
      'Participante com nome excepcionalmente longo da Silva Souza Pereira Albuquerque e Caracteres Especiais çãé',
    issueLabel: 'Pessoa duplicada',
    resolutionIssue: 'DUPLICATE_PERSON',
    resolutionError:
      'Pessoa tem registros duplicados no banco de dados com o dado participante-com-texto-muito-longo@example.com.',
  },
};
