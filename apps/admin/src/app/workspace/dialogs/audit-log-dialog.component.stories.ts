import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { AuditLogEntry, AuditLogOperation } from '../../graphql/models';
import { AuditLogDialogComponent } from './audit-log-dialog.component';

type RequestState = 'success' | 'empty' | 'error';

type AuditLogDialogStoryArgs = {
  entityLabel: string;
  entryCount: number;
  groupedChanges: boolean;
  includeReverted: boolean;
  allowRevert: boolean;
  requestState: RequestState;
  responseDelay: number;
};

type GraphqlBody = {
  query?: string;
};

const defaultArgs: AuditLogDialogStoryArgs = {
  entityLabel: 'Ana Clara Silva',
  entryCount: 4,
  groupedChanges: true,
  includeReverted: false,
  allowRevert: true,
  requestState: 'success',
  responseDelay: 100,
};

let activeArgs = defaultArgs;
let revertedEntryId: string | null = null;

@Component({
  selector: 'app-storybook-audit-log-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class AuditLogDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = AuditLogDialogComponent;
  readonly entityLabel = input(defaultArgs.entityLabel);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            entityType: 'PERSON',
            entityId: 'person-story',
            entityLabel: this.entityLabel(),
          },
        },
      ],
    }),
  );
}

const meta: Meta<AuditLogDialogStoryArgs> = {
  component: AuditLogDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Audit Log Dialog',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    entityLabel: {
      control: 'text',
      description: 'Nome do registro auditado.',
    },
    entryCount: {
      control: { type: 'range', min: 1, max: 10, step: 1 },
      description: 'Quantidade de registros gerados no histórico.',
      if: { arg: 'requestState', eq: 'success' },
    },
    groupedChanges: {
      control: 'boolean',
      description: 'Agrupa alterações recentes no primeiro registro.',
      if: { arg: 'requestState', eq: 'success' },
    },
    includeReverted: {
      control: 'boolean',
      description: 'Marca o primeiro registro como já desfeito.',
      if: { arg: 'requestState', eq: 'success' },
    },
    allowRevert: {
      control: 'boolean',
      description: 'Exibe as ações para desfazer alterações elegíveis.',
      if: { arg: 'requestState', eq: 'success' },
    },
    requestState: {
      control: 'select',
      options: ['success', 'empty', 'error'],
      description: 'Resposta simulada pela API GraphQL.',
    },
    responseDelay: {
      control: { type: 'range', min: 0, max: 1500, step: 100 },
      description: 'Latência simulada pela API em milissegundos.',
    },
  },
  render: (args) => {
    activeArgs = args;
    revertedEntryId = null;
    return { props: args };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const body = (await request.json()) as GraphqlBody;
          await delay(activeArgs.responseDelay);

          if (body.query?.includes('RevertAuditLogEntry')) {
            revertedEntryId = 'audit-entry-1';
            return HttpResponse.json({ data: { revertAuditLogEntry: buildRevertEntry(activeArgs) } });
          }

          if (!body.query?.includes('AuditLogEntries')) {
            return HttpResponse.json({ data: {} });
          }

          if (activeArgs.requestState === 'error') {
            return HttpResponse.json({ errors: [{ message: 'Não foi possível consultar o histórico simulado.' }] });
          }

          return HttpResponse.json({
            data: {
              auditLogEntries: activeArgs.requestState === 'empty' ? [] : buildEntries(activeArgs),
            },
          });
        }),
      ],
    },
  },
};

export default meta;

type Story = StoryObj<AuditLogDialogStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Histórico')).toBeVisible();
    await expect(await canvas.findByText('Dados cadastrais alterados.')).toBeVisible();
  },
};

export const EmptyHistory: Story = {
  args: {
    requestState: 'empty',
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum histórico encontrado')).toBeVisible();
  },
};

export const WithRevertedEntry: Story = {
  args: {
    includeReverted: true,
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Desfeito por/)).toBeVisible();
  },
};

export const RequestError: Story = {
  args: {
    requestState: 'error',
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Não foi possível carregar o histórico')).toBeVisible();
    await expect(await canvas.findByText('Não foi possível consultar o histórico simulado.')).toBeVisible();
  },
};

function buildEntries(args: AuditLogDialogStoryArgs): AuditLogEntry[] {
  faker.seed(20260621 + args.entryCount);

  return Array.from({ length: args.entryCount }, (_, index) => buildEntry(args, index));
}

function buildEntry(args: AuditLogDialogStoryArgs, index: number): AuditLogEntry {
  const operation =
    index === 0 ? 'UPDATE' : faker.helpers.arrayElement<AuditLogOperation>(['UPDATE', 'CREATE', 'IMPORT', 'APPROVE']);
  const recordedAt = faker.date.between({
    from: '2026-05-01T12:00:00.000Z',
    to: '2026-06-21T18:00:00.000Z',
  });
  const groupedCount = index === 0 && args.groupedChanges ? faker.number.int({ min: 2, max: 5 }) : 1;
  const reverted = index === 0 && (args.includeReverted || revertedEntryId === `audit-entry-${index + 1}`);
  const actorName = faker.person.fullName();
  const changes = [
    {
      field: 'name',
      label: 'Nome',
      beforeValue: faker.person.fullName(),
      afterValue: index === 0 ? args.entityLabel : faker.person.fullName(),
    },
    {
      field: 'email',
      label: 'E-mail principal',
      beforeValue: faker.internet.email().toLocaleLowerCase('pt-BR'),
      afterValue: faker.internet.email().toLocaleLowerCase('pt-BR'),
    },
  ];

  return {
    id: `audit-entry-${index + 1}`,
    entityType: 'PERSON',
    entityId: 'person-story',
    entityLabel: args.entityLabel,
    operation,
    summary: index === 0 ? 'Dados cadastrais alterados.' : faker.helpers.arrayElement([
      'Cadastro atualizado no painel administrativo.',
      'Dados importados e conciliados.',
      'Alteração aprovada pela equipe responsável.',
    ]),
    actorId: `user-${index + 1}`,
    actorName,
    actorEmail: faker.internet.email({ firstName: actorName.split(' ')[0] }).toLocaleLowerCase('pt-BR'),
    actorType: 'USER',
    permission: 'person#update',
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    changes,
    changedFields: changes.map((change) => change.field),
    groupedCount,
    firstRecordedAt: new Date(recordedAt.getTime() - (groupedCount - 1) * 60_000).toISOString(),
    lastRecordedAt: recordedAt.toISOString(),
    createdAt: recordedAt.toISOString(),
    revertedAt: reverted ? new Date(recordedAt.getTime() + 3_600_000).toISOString() : null,
    revertedById: reverted ? 'storybook-admin' : null,
    revertedByName: reverted ? faker.person.fullName() : null,
    revertedByEntryId: reverted ? 'audit-revert-1' : null,
    revertTargetId: null,
    revertMode: null,
    canRevert: args.allowRevert && operation === 'UPDATE' && !reverted,
  };
}

function buildRevertEntry(args: AuditLogDialogStoryArgs): AuditLogEntry {
  const entry = buildEntry({ ...args, groupedChanges: false, includeReverted: false }, 0);

  return {
    ...entry,
    id: 'audit-revert-1',
    operation: 'REVERT',
    summary: 'Alteração desfeita no painel administrativo.',
    canRevert: false,
    changes: [],
    changedFields: [],
    revertTargetId: 'audit-entry-1',
    revertMode: 'ENTRY_ONLY',
  };
}
