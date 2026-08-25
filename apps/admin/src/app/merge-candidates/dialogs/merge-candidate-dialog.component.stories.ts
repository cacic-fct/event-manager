import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { MergeCandidate, Person } from '@cacic-fct/event-manager-admin-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { adminFixtureDate, createAdminPerson } from '../../testing/admin-entity-fixtures';
import { MergeCandidateDialogComponent } from './merge-candidate-dialog.component';

interface MergeCandidateDialogStoryArgs {
  personAName: string;
  personAEmail: string;
  personAIdentityDocument: string;
  personAAcademicId: string;
  personAUserId: string;
  personAExternalRef: string;
  personBName: string;
  personBEmail: string;
  personBIdentityDocument: string;
  personBAcademicId: string;
  personBUserId: string;
  personBExternalRef: string;
}

const defaultArgs: MergeCandidateDialogStoryArgs = {
  personAName: 'Ada Lovelace',
  personAEmail: 'ada@example.edu',
  personAIdentityDocument: '',
  personAAcademicId: 'RA-A',
  personAUserId: '',
  personAExternalRef: 'external-a',
  personBName: 'Ada Byron',
  personBEmail: '',
  personBIdentityDocument: '22222222222',
  personBAcademicId: '',
  personBUserId: 'user-b',
  personBExternalRef: '',
};

const closeDialog = fn((result: unknown) => result);
const nullable = (value: string) => value.trim() || null;

function buildPerson(prefix: 'A' | 'B', args: MergeCandidateDialogStoryArgs): Person {
  const isA = prefix === 'A';
  return createAdminPerson({
    id: `person-${prefix.toLocaleLowerCase('pt-BR')}`,
    name: isA ? args.personAName : args.personBName,
    email: nullable(isA ? args.personAEmail : args.personBEmail),
    identityDocument: nullable(isA ? args.personAIdentityDocument : args.personBIdentityDocument),
    academicId: nullable(isA ? args.personAAcademicId : args.personBAcademicId),
    userId: nullable(isA ? args.personAUserId : args.personBUserId),
    externalRef: nullable(isA ? args.personAExternalRef : args.personBExternalRef),
  }) as Person;
}

function buildCandidate(args: MergeCandidateDialogStoryArgs): MergeCandidate {
  const personA = buildPerson('A', args);
  const personB = buildPerson('B', args);
  return {
    id: 'candidate-story',
    personAId: personA.id,
    personBId: personB.id,
    pairKey: `${personA.id}:${personB.id}`,
    score: 0.95,
    matchMethod: 'EMAIL',
    matchValue: personA.email,
    status: 'PENDING',
    resolvedById: null,
    createdAt: adminFixtureDate,
    updatedAt: adminFixtureDate,
    personA,
    personB,
  } as MergeCandidate;
}

@Component({
  selector: 'app-storybook-merge-candidate-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class MergeCandidateDialogStoryHost {
  private readonly injector = inject(Injector);
  readonly component = MergeCandidateDialogComponent;

  readonly personAName = input(defaultArgs.personAName);
  readonly personAEmail = input(defaultArgs.personAEmail);
  readonly personAIdentityDocument = input(defaultArgs.personAIdentityDocument);
  readonly personAAcademicId = input(defaultArgs.personAAcademicId);
  readonly personAUserId = input(defaultArgs.personAUserId);
  readonly personAExternalRef = input(defaultArgs.personAExternalRef);
  readonly personBName = input(defaultArgs.personBName);
  readonly personBEmail = input(defaultArgs.personBEmail);
  readonly personBIdentityDocument = input(defaultArgs.personBIdentityDocument);
  readonly personBAcademicId = input(defaultArgs.personBAcademicId);
  readonly personBUserId = input(defaultArgs.personBUserId);
  readonly personBExternalRef = input(defaultArgs.personBExternalRef);

  readonly storyInjector = computed(() => {
    const args: MergeCandidateDialogStoryArgs = {
      personAName: this.personAName(),
      personAEmail: this.personAEmail(),
      personAIdentityDocument: this.personAIdentityDocument(),
      personAAcademicId: this.personAAcademicId(),
      personAUserId: this.personAUserId(),
      personAExternalRef: this.personAExternalRef(),
      personBName: this.personBName(),
      personBEmail: this.personBEmail(),
      personBIdentityDocument: this.personBIdentityDocument(),
      personBAcademicId: this.personBAcademicId(),
      personBUserId: this.personBUserId(),
      personBExternalRef: this.personBExternalRef(),
    };
    return Injector.create({
      parent: this.injector,
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { candidate: buildCandidate(args) } },
        { provide: MatDialogRef, useValue: { close: closeDialog } },
      ],
    });
  });
}

const personControl = { control: 'text' } as const;

const meta: Meta<MergeCandidateDialogStoryArgs> = {
  component: MergeCandidateDialogStoryHost,
  title: 'CACiC Eventos/Workspace/Dialogs/Merge Candidate Dialog',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    personAName: personControl,
    personAEmail: personControl,
    personAIdentityDocument: personControl,
    personAAcademicId: personControl,
    personAUserId: personControl,
    personAExternalRef: personControl,
    personBName: personControl,
    personBEmail: personControl,
    personBIdentityDocument: personControl,
    personBAcademicId: personControl,
    personBUserId: personControl,
    personBExternalRef: personControl,
  },
  beforeEach: () => {
    closeDialog.mockClear();
  },
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<MergeCandidateDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findAllByRole('checkbox')).toHaveLength(6);
    await userEvent.click(canvas.getByRole('button', { name: 'Unificar' }));
    await expect(closeDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        targetPersonId: 'person-a',
        migrateFields: expect.arrayContaining(['IDENTITY_DOCUMENT', 'USER_ID']),
      }),
    );
  },
};

export const KeepSecondPerson: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: /Manter Ada Byron/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Unificar' }));
    await expect(closeDialog).toHaveBeenCalledWith(expect.objectContaining({ targetPersonId: 'person-b' }));
  },
};

export const CompleteRecords: Story = {
  args: {
    personAIdentityDocument: '11111111111',
    personAUserId: 'user-a',
    personBEmail: 'ada.byron@example.edu',
    personBAcademicId: 'RA-B',
    personBExternalRef: 'external-b',
  },
};

export const SparseRecords: Story = {
  args: {
    personAEmail: '',
    personAAcademicId: '',
    personAExternalRef: '',
    personBIdentityDocument: '',
    personBUserId: '',
  },
};

export const LongContentMobile: Story = {
  args: {
    personAName: 'Maria Aparecida de Souza Albuquerque dos Santos e Oliveira',
    personAEmail: 'maria.aparecida.souza.albuquerque@instituicao.example.br',
    personBName: 'Maria Aparecida Souza Albuquerque de Oliveira Santos',
    personBExternalRef: 'sistema-legado-interdisciplinar-de-eventos-universitarios-2026',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
