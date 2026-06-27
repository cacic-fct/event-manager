import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { delay, mergeMap, of, throwError, timer, type Observable } from 'rxjs';
import { AuditLogApiService, type AuditLogExplorerInput } from '../../../graphql/audit-log-api.service';
import {
  AuditLogActorType,
  AuditLogEntityType,
  AuditLogExplorerEntry,
  AuditLogExplorerResult,
  AuditLogOperation,
} from '../../../graphql/models';
import {
  AUDIT_LOG_ENTITY_TYPE_OPTIONS,
  AUDIT_LOG_OPERATION_OPTIONS,
  auditLogEntityTypeLabel,
  auditLogOperationLabel,
} from './workspace-audit-log-utils';
import { WorkspaceAuditLogsTabComponent } from './workspace-audit-logs-tab.component';

type RequestState = 'success' | 'empty' | 'error';

type AuditLogsStoryArgs = {
  entryCount: number;
  includeReverted: boolean;
  requestState: RequestState;
  responseDelay: number;
  typesenseAvailable: boolean;
};

const defaultArgs: AuditLogsStoryArgs = {
  entryCount: 36,
  includeReverted: false,
  requestState: 'success',
  responseDelay: 100,
  typesenseAvailable: true,
};

const meta: Meta<AuditLogsStoryArgs> = {
  component: WorkspaceAuditLogsTabComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Auditoria',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    entryCount: {
      control: { type: 'range', min: 1, max: 80, step: 1 },
      if: { arg: 'requestState', eq: 'success' },
    },
    includeReverted: {
      control: 'boolean',
      if: { arg: 'requestState', eq: 'success' },
    },
    requestState: {
      control: 'select',
      options: ['success', 'empty', 'error'],
    },
    responseDelay: {
      control: { type: 'range', min: 0, max: 1500, step: 100 },
    },
    typesenseAvailable: {
      control: 'boolean',
      if: { arg: 'requestState', eq: 'success' },
    },
  },
  render: (args) => {
    return {
      props: args,
      applicationConfig: {
        providers: [
          {
            provide: AuditLogApiService,
            useValue: createAuditLogApiService(args),
          },
        ],
      },
    };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<AuditLogsStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Logs de auditoria')).toBeVisible();
    await expect(await canvas.findByText('Evento atualizado pelo painel administrativo.')).toBeVisible();
    await expect(await canvas.findByText('1-25 de 36')).toBeVisible();
  },
};

export const Empty: Story = {
  args: {
    requestState: 'empty',
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum log encontrado')).toBeVisible();
  },
};

export const WithRevertedRows: Story = {
  args: {
    includeReverted: true,
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Desfeito')).toBeVisible();
  },
};

export const AllEntityTypesAndOperations: Story = {
  args: {
    entryCount: 54,
    includeReverted: true,
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Logs de auditoria')).toBeVisible();
    await expect(await canvas.findByText('1-25 de 54')).toBeVisible();
    const reversalRows = await canvas.findAllByText(/reversão no fluxo simulado/i);
    await expect(reversalRows[0]).toBeVisible();
  },
};

export const SqlFallback: Story = {
  args: {
    typesenseAvailable: false,
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText(/Typesense indisponível/)).toBeVisible();
  },
};

export const RequestError: Story = {
  args: {
    requestState: 'error',
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Não foi possível carregar os logs')).toBeVisible();
    await expect(await canvas.findByText('Falha simulada ao consultar auditoria.')).toBeVisible();
  },
};

function createAuditLogApiService(args: AuditLogsStoryArgs): Pick<AuditLogApiService, 'searchExplorer'> {
  return {
    searchExplorer: (input: AuditLogExplorerInput): Observable<AuditLogExplorerResult> => {
      if (args.requestState === 'error') {
        return timer(args.responseDelay).pipe(
          mergeMap(() => throwError(() => new Error('Falha simulada ao consultar auditoria.'))),
        );
      }

      return of(buildExplorerResult(args, input.skip ?? 0, input.take ?? 25)).pipe(delay(args.responseDelay));
    },
  };
}

function buildExplorerResult(args: AuditLogsStoryArgs, skip: number, take: number): AuditLogExplorerResult {
  const entries = args.requestState === 'empty' ? [] : buildEntries(args).slice(skip, skip + take);

  return {
    entries,
    skip,
    take,
    total: args.requestState === 'empty' ? 0 : args.entryCount,
    typesenseAvailable: args.typesenseAvailable,
  };
}

function buildEntries(args: AuditLogsStoryArgs): AuditLogExplorerEntry[] {
  faker.seed(20260625 + args.entryCount);

  return Array.from({ length: args.entryCount }, (_, index) => buildEntry(args, index));
}

function buildEntry(args: AuditLogsStoryArgs, index: number): AuditLogExplorerEntry {
  const entityType = storyEntityTypes[index % storyEntityTypes.length];
  const operation = storyOperations[index % storyOperations.length];
  const recordedAt = faker.date.between({
    from: '2026-05-20T12:00:00.000Z',
    to: '2026-06-25T18:00:00.000Z',
  });
  const actorType = storyActorTypes[index % storyActorTypes.length];
  const actorName = actorNameForType(actorType);
  const reverted = args.includeReverted && index % 4 === 0 && operation !== 'REVERT';
  const label = auditLogEntityTypeLabel(entityType);
  const entityId = `${entityType.toLocaleLowerCase('en-US').replace(/_/g, '-')}-${index + 1}`;
  const entityLabel = index === 0 ? 'Oficina de Angular' : `${label} ${index + 1}`;
  const changes = changesForEntry(entityType, operation, entityLabel, index);
  const before = snapshotForEntry(entityType, operation, entityLabel, changes, 'before');
  const after = snapshotForEntry(entityType, operation, entityLabel, changes, 'after');
  const context = contextForEntity(entityType, entityId);

  return {
    id: `audit-entry-${index + 1}`,
    entityType,
    entityId,
    entityLabel,
    operation,
    summary: index === 0 ? 'Evento atualizado pelo painel administrativo.' : summaryForEntry(entityType, operation),
    actorId: actorType === 'SYSTEM' ? null : `${actorType.toLocaleLowerCase('en-US')}-${index + 1}`,
    actorName,
    actorEmail: actorType === 'USER' ? faker.internet.email({ firstName: actorName.split(' ')[0] }).toLocaleLowerCase('pt-BR') : null,
    actorType,
    permission: permissionForEntry(entityType, operation),
    eventId: context.eventId,
    majorEventId: context.majorEventId,
    eventGroupId: context.eventGroupId,
    changes,
    changedFields: changes.map((change) => change.field),
    groupedCount: index % 7 === 0 ? faker.number.int({ min: 2, max: 5 }) : 1,
    firstRecordedAt: new Date(recordedAt.getTime() - 60_000).toISOString(),
    lastRecordedAt: recordedAt.toISOString(),
    createdAt: recordedAt.toISOString(),
    revertedAt: reverted ? new Date(recordedAt.getTime() + 600_000).toISOString() : null,
    revertedById: reverted ? 'admin-revert' : null,
    revertedByName: reverted ? 'Admin Revisor' : null,
    revertedByEntryId: reverted ? `audit-revert-${index + 1}` : null,
    revertTargetId: null,
    revertMode: null,
    canRevert: !reverted && changes.length > 0 && operation === 'UPDATE',
    beforeJson: JSON.stringify(before, null, 2),
    afterJson: JSON.stringify(after, null, 2),
    metadataJson: JSON.stringify(
      {
        story: true,
        actorType,
        entityType,
        operation,
        requestId: `request-${index + 1}`,
        source: index % 5 === 0 ? 'background-job' : 'admin-panel',
      },
      null,
      2,
    ),
  };
}

const storyEntityTypes = AUDIT_LOG_ENTITY_TYPE_OPTIONS.map((option) => option.value);
const storyOperations = AUDIT_LOG_OPERATION_OPTIONS.map((option) => option.value);
const storyActorTypes: readonly AuditLogActorType[] = ['USER', 'SERVICE', 'SYSTEM'];

function actorNameForType(actorType: AuditLogActorType): string {
  switch (actorType) {
    case 'USER':
      return faker.person.fullName();
    case 'SERVICE':
      return 'Serviço de inscrições';
    case 'SYSTEM':
      return 'Sistema';
  }
}

function changesForEntry(
  entityType: AuditLogEntityType,
  operation: AuditLogOperation,
  entityLabel: string,
  index: number,
): AuditLogExplorerEntry['changes'] {
  if (operation === 'DELETE' || operation === 'SCAN' || operation === 'REVERT') {
    return [];
  }

  const statusAfter = operation === 'REJECT' ? 'Rejeitado' : operation === 'APPROVE' ? 'Aprovado' : 'Confirmado';
  const changesByEntityType: Partial<Record<AuditLogEntityType, AuditLogExplorerEntry['changes']>> = {
    PERSON: [
      { field: 'name', label: 'Nome', beforeValue: faker.person.fullName(), afterValue: entityLabel },
      { field: 'email', label: 'E-mail', beforeValue: faker.internet.email().toLocaleLowerCase('pt-BR'), afterValue: faker.internet.email().toLocaleLowerCase('pt-BR') },
    ],
    EVENT: [
      { field: 'name', label: 'Nome', beforeValue: 'Oficina de TypeScript', afterValue: entityLabel },
      { field: 'publicationState', label: 'Publicação', beforeValue: 'Rascunho', afterValue: 'Publicado' },
      { field: 'locationDescription', label: 'Local', beforeValue: 'Sala B12', afterValue: 'Auditório discente' },
    ],
    EVENT_ATTENDANCE: [
      { field: 'creationMethod', label: 'Método', beforeValue: null, afterValue: 'Leitura por QR Code' },
      { field: 'committedByName', label: 'Registrado por', beforeValue: null, afterValue: faker.person.fullName() },
    ],
    CERTIFICATE: [
      { field: 'issuedAt', label: 'Emitido em', beforeValue: null, afterValue: '26/06/2026 14:30' },
      { field: 'workloadMinutes', label: 'Carga horária', beforeValue: null, afterValue: `${60 + index * 5} minutos` },
    ],
    SYSTEM: [
      { field: 'job', label: 'Rotina', beforeValue: null, afterValue: 'Sincronização de auditoria' },
      { field: 'processedEntries', label: 'Registros processados', beforeValue: '0', afterValue: `${100 + index}` },
    ],
  };

  return changesByEntityType[entityType] ?? [
    { field: 'status', label: 'Situação', beforeValue: 'Pendente', afterValue: statusAfter },
    { field: 'notes', label: 'Observação', beforeValue: null, afterValue: `${auditLogOperationLabel(operation)} registrada.` },
  ];
}

function snapshotForEntry(
  entityType: AuditLogEntityType,
  operation: AuditLogOperation,
  entityLabel: string,
  changes: AuditLogExplorerEntry['changes'],
  side: 'before' | 'after',
): Record<string, unknown> | null {
  if (operation === 'CREATE' && side === 'before') {
    return null;
  }

  if (operation === 'DELETE' && side === 'after') {
    return null;
  }

  return {
    id: `${entityType.toLocaleLowerCase('en-US')}-snapshot`,
    type: entityType,
    label: entityLabel,
    values: Object.fromEntries(changes.map((change) => [change.field, side === 'before' ? change.beforeValue : change.afterValue])),
  };
}

function contextForEntity(entityType: AuditLogEntityType, entityId: string): Pick<AuditLogExplorerEntry, 'eventId' | 'majorEventId' | 'eventGroupId'> {
  if (entityType === 'EVENT') {
    return { eventId: entityId, majorEventId: 'major-event-story', eventGroupId: 'event-group-story' };
  }

  if (entityType === 'MAJOR_EVENT' || entityType === 'MAJOR_EVENT_SUBSCRIPTION') {
    return { eventId: null, majorEventId: entityId, eventGroupId: null };
  }

  if (entityType === 'EVENT_GROUP' || entityType === 'EVENT_GROUP_SUBSCRIPTION') {
    return { eventId: null, majorEventId: 'major-event-story', eventGroupId: entityId };
  }

  if (
    entityType === 'EVENT_SUBSCRIPTION' ||
    entityType === 'EVENT_ATTENDANCE' ||
    entityType === 'EVENT_ATTENDANCE_COLLECTOR' ||
    entityType === 'EVENT_LECTURER' ||
    entityType === 'CERTIFICATE_CONFIG' ||
    entityType === 'CERTIFICATE'
  ) {
    return { eventId: 'event-story', majorEventId: 'major-event-story', eventGroupId: 'event-group-story' };
  }

  return { eventId: null, majorEventId: null, eventGroupId: null };
}

function permissionForEntry(entityType: AuditLogEntityType, operation: AuditLogOperation): string | null {
  if (entityType === 'SYSTEM') {
    return null;
  }

  return `${entityType.toLocaleLowerCase('en-US').replace(/_/g, '-')}#${operation.toLocaleLowerCase('en-US')}`;
}

function summaryForEntry(entityType: AuditLogEntityType, operation: AuditLogOperation): string {
  const entityLabel = auditLogEntityTypeLabel(entityType);
  const operationLabel = auditLogOperationLabel(operation).toLocaleLowerCase('pt-BR');

  return `${entityLabel} ${operationLabel} no fluxo simulado.`;
}
