import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, screen, userEvent, within } from 'storybook/test';
import { AuditLogActorType, AuditLogEntry, AuditLogEntityType, AuditLogOperation } from '@cacic-fct/event-manager-admin-contracts';
import { AUDIT_LOG_ENTITY_TYPE_OPTIONS, auditLogEntityTypeLabel } from '../tabs/audit-logs/workspace-audit-log-utils';
import { AuditLogDialogComponent } from './audit-log-dialog.component';

type RequestState = 'success' | 'empty' | 'error';

type AuditLogDialogStoryArgs = {
  entityType: AuditLogEntityType;
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
  entityType: 'EVENT',
  entityLabel: 'Oficina de Angular',
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
  readonly entityType = input<AuditLogEntityType>(defaultArgs.entityType);
  readonly entityLabel = input(defaultArgs.entityLabel);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            entityType: this.entityType(),
            entityId: scenarioForEntity(this.entityType()).entityId,
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
    entityType: {
      control: 'select',
      options: AUDIT_LOG_ENTITY_TYPE_OPTIONS.map((option) => option.value),
      description: 'Tipo do registro auditado.',
    },
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
    a11y: { test: 'error' },
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
    await expect(await canvas.findByText('Programação e publicação alteradas.')).toBeVisible();
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

export const EventSubscriptionHistory: Story = {
  args: {
    entityType: 'EVENT_SUBSCRIPTION',
    entityLabel: 'Inscrição de Renan Yudi em Oficina de Angular',
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Inscrição revisada pela secretaria.')).toBeVisible();
  },
};

export const CertificateHistory: Story = {
  args: {
    entityType: 'CERTIFICATE',
    entityLabel: 'Certificado de Ana Clara Silva',
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Certificado emitido.')).toBeVisible();
  },
};

export const SystemHistory: Story = {
  args: {
    entityType: 'SYSTEM',
    entityLabel: 'Sincronização de auditoria',
    allowRevert: false,
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Rotina do sistema executada.')).toBeVisible();
  },
};

export const RevertConfirmation: Story = {
  args: {
    responseDelay: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const revertButtons = await canvas.findAllByRole('button', { name: 'Desfazer daqui em diante' });
    await userEvent.click(revertButtons[0]);
    await expect(await screen.findByRole('heading', { name: 'Desfazer deste ponto em diante?' })).toBeVisible();
    await expect(await screen.findByText(/alterações posteriores do mesmo item/i)).toBeVisible();
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
  const scenario = scenarioForEntity(args.entityType);
  const operation =
    index === 0
      ? scenario.primaryOperation
      : faker.helpers.arrayElement<AuditLogOperation>(['UPDATE', 'CREATE', 'IMPORT', 'APPROVE', 'REJECT', 'ISSUE', 'SCAN']);
  const recordedAt = faker.date.between({
    from: '2026-05-01T12:00:00.000Z',
    to: '2026-06-21T18:00:00.000Z',
  });
  const groupedCount = index === 0 && args.groupedChanges ? faker.number.int({ min: 2, max: 5 }) : 1;
  const reverted = index === 0 && (args.includeReverted || revertedEntryId === `audit-entry-${index + 1}`);
  const actorType = scenario.actorTypes[index % scenario.actorTypes.length];
  const actorName = actorNameForType(actorType);
  const changes =
    operation === 'DELETE' || operation === 'SCAN' || operation === 'REVERT'
      ? []
      : scenario.changes(args.entityLabel, index);

  return {
    id: `audit-entry-${index + 1}`,
    entityType: args.entityType,
    entityId: scenario.entityId,
    entityLabel: args.entityLabel,
    operation,
    summary: index === 0 ? scenario.summary : summaryForOperation(operation, args.entityType, scenario.label),
    actorId: actorType === 'SYSTEM' ? null : `${actorType.toLocaleLowerCase('en-US')}-${index + 1}`,
    actorName,
    actorEmail: actorType === 'USER' ? faker.internet.email({ firstName: actorName.split(' ')[0] }).toLocaleLowerCase('pt-BR') : null,
    actorType,
    permission: scenario.permission,
    eventId: scenario.eventId,
    majorEventId: scenario.majorEventId,
    eventGroupId: scenario.eventGroupId,
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
    canRevert: args.allowRevert && changes.length > 0 && operation === 'UPDATE' && !reverted,
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

type AuditLogScenario = {
  entityId: string;
  label: string;
  primaryOperation: AuditLogOperation;
  summary: string;
  permission: string | null;
  actorTypes: AuditLogActorType[];
  eventId: string | null;
  majorEventId: string | null;
  eventGroupId: string | null;
  changes: (entityLabel: string, index: number) => AuditLogEntry['changes'];
};

const scenarioByEntityType: Record<AuditLogEntityType, AuditLogScenario> = {
  PERSON: {
    entityId: 'person-story',
    label: 'pessoa',
    primaryOperation: 'UPDATE',
    summary: 'Dados cadastrais alterados.',
    permission: 'person#update',
    actorTypes: ['USER', 'SERVICE'],
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    changes: (entityLabel) => [
      { field: 'name', label: 'Nome', beforeValue: faker.person.fullName(), afterValue: entityLabel },
      { field: 'email', label: 'E-mail principal', beforeValue: faker.internet.email().toLocaleLowerCase('pt-BR'), afterValue: faker.internet.email().toLocaleLowerCase('pt-BR') },
    ],
  },
  LECTURER_PROFILE: {
    entityId: 'lecturer-profile-story',
    label: 'perfil de palestrante',
    primaryOperation: 'UPDATE',
    summary: 'Minibio e contato atualizados.',
    permission: 'lecturer-profile#update',
    actorTypes: ['USER'],
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    changes: () => [
      { field: 'miniBio', label: 'Minibio', beforeValue: 'Palestrante convidado.', afterValue: 'Palestrante convidado com experiência em Angular.' },
      { field: 'linkedin', label: 'LinkedIn', beforeValue: null, afterValue: 'https://linkedin.com/in/palestrante' },
    ],
  },
  EVENT: {
    entityId: 'event-story',
    label: 'evento',
    primaryOperation: 'UPDATE',
    summary: 'Programação e publicação alteradas.',
    permission: 'event#update',
    actorTypes: ['USER', 'SERVICE'],
    eventId: 'event-story',
    majorEventId: 'major-event-story',
    eventGroupId: 'event-group-story',
    changes: (entityLabel) => [
      { field: 'name', label: 'Nome', beforeValue: 'Oficina de TypeScript', afterValue: entityLabel },
      { field: 'publicationState', label: 'Publicação', beforeValue: 'Rascunho', afterValue: 'Publicado' },
      { field: 'locationDescription', label: 'Local', beforeValue: 'Sala B12', afterValue: 'Auditório discente' },
    ],
  },
  MAJOR_EVENT: {
    entityId: 'major-event-story',
    label: 'grande evento',
    primaryOperation: 'UPDATE',
    summary: 'Regras de inscrição do grande evento alteradas.',
    permission: 'major-event#update',
    actorTypes: ['USER'],
    eventId: null,
    majorEventId: 'major-event-story',
    eventGroupId: null,
    changes: () => [
      { field: 'subscriptionEndDate', label: 'Fim das inscrições', beforeValue: '20/06/2026', afterValue: '24/06/2026' },
      { field: 'maxCoursesPerAttendee', label: 'Máximo de minicursos', beforeValue: '2', afterValue: '3' },
    ],
  },
  EVENT_GROUP: {
    entityId: 'event-group-story',
    label: 'grupo de eventos',
    primaryOperation: 'UPDATE',
    summary: 'Grupo reorganizado.',
    permission: 'event-group#update',
    actorTypes: ['USER'],
    eventId: null,
    majorEventId: 'major-event-story',
    eventGroupId: 'event-group-story',
    changes: () => [
      { field: 'name', label: 'Nome', beforeValue: 'Trilha web', afterValue: 'Trilha frontend' },
      { field: 'eventIds', label: 'Eventos vinculados', beforeValue: '2 eventos', afterValue: '4 eventos' },
    ],
  },
  PLACE_PRESET: {
    entityId: 'place-preset-story',
    label: 'local',
    primaryOperation: 'MERGE',
    summary: 'Locais duplicados unificados.',
    permission: 'place-preset#merge',
    actorTypes: ['USER'],
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    changes: () => [
      { field: 'name', label: 'Nome', beforeValue: 'Auditório Central', afterValue: 'Auditório discente' },
      { field: 'mergedSourceId', label: 'Origem unificada', beforeValue: 'place-old', afterValue: 'place-preset-story' },
    ],
  },
  PERMISSION_GRANT: {
    entityId: 'permission-grant-story',
    label: 'permissão',
    primaryOperation: 'CREATE',
    summary: 'Permissão administrativa concedida.',
    permission: 'permission-grant#create',
    actorTypes: ['USER'],
    eventId: 'event-story',
    majorEventId: null,
    eventGroupId: null,
    changes: () => [
      { field: 'permission', label: 'Permissão', beforeValue: null, afterValue: 'event#update' },
      { field: 'scope', label: 'Escopo', beforeValue: null, afterValue: 'Evento' },
    ],
  },
  EVENT_SUBSCRIPTION: {
    entityId: 'event-subscription-story',
    label: 'inscrição em evento',
    primaryOperation: 'APPROVE',
    summary: 'Inscrição revisada pela secretaria.',
    permission: 'event-subscription#update',
    actorTypes: ['USER', 'SERVICE'],
    eventId: 'event-story',
    majorEventId: 'major-event-story',
    eventGroupId: 'event-group-story',
    changes: () => [
      { field: 'status', label: 'Situação', beforeValue: 'Aguardando comprovante', afterValue: 'Confirmada' },
      { field: 'receiptValidatedAt', label: 'Comprovante validado em', beforeValue: null, afterValue: '26/06/2026 09:15' },
    ],
  },
  EVENT_GROUP_SUBSCRIPTION: {
    entityId: 'event-group-subscription-story',
    label: 'inscrição em grupo',
    primaryOperation: 'USER_CREATE',
    summary: 'Inscrição em grupo criada pelo participante.',
    permission: 'event-group-subscription#create',
    actorTypes: ['USER'],
    eventId: null,
    majorEventId: 'major-event-story',
    eventGroupId: 'event-group-story',
    changes: () => [
      { field: 'selectedEventIds', label: 'Eventos escolhidos', beforeValue: null, afterValue: '3 eventos' },
      { field: 'status', label: 'Situação', beforeValue: null, afterValue: 'Aguardando comprovante' },
    ],
  },
  MAJOR_EVENT_SUBSCRIPTION: {
    entityId: 'major-event-subscription-story',
    label: 'inscrição em grande evento',
    primaryOperation: 'REJECT',
    summary: 'Inscrição rejeitada por conflito de agenda.',
    permission: 'major-event-subscription#update',
    actorTypes: ['USER', 'SERVICE'],
    eventId: null,
    majorEventId: 'major-event-story',
    eventGroupId: null,
    changes: () => [
      { field: 'status', label: 'Situação', beforeValue: 'Em análise', afterValue: 'Rejeitada por conflito' },
      { field: 'reviewNote', label: 'Justificativa', beforeValue: null, afterValue: 'Conflito com outra atividade confirmada.' },
    ],
  },
  EVENT_ATTENDANCE: {
    entityId: 'event-attendance-story',
    label: 'presença',
    primaryOperation: 'SCAN',
    summary: 'Presença registrada por QR Code.',
    permission: 'event-attendance#create',
    actorTypes: ['USER', 'SERVICE'],
    eventId: 'event-story',
    majorEventId: 'major-event-story',
    eventGroupId: 'event-group-story',
    changes: () => [],
  },
  EVENT_ATTENDANCE_COLLECTOR: {
    entityId: 'event-attendance-collector-story',
    label: 'coletor de presença',
    primaryOperation: 'UPDATE',
    summary: 'Coletor de presença alterado.',
    permission: 'event-attendance-collector#update',
    actorTypes: ['USER'],
    eventId: 'event-story',
    majorEventId: 'major-event-story',
    eventGroupId: null,
    changes: () => [
      { field: 'enabled', label: 'Ativo', beforeValue: 'Não', afterValue: 'Sim' },
      { field: 'expiresAt', label: 'Expira em', beforeValue: '26/06/2026 10:00', afterValue: '26/06/2026 12:00' },
    ],
  },
  EVENT_LECTURER: {
    entityId: 'event-lecturer-story',
    label: 'palestrante do evento',
    primaryOperation: 'CREATE',
    summary: 'Palestrante vinculado ao evento.',
    permission: 'event-lecturer#create',
    actorTypes: ['USER'],
    eventId: 'event-story',
    majorEventId: 'major-event-story',
    eventGroupId: 'event-group-story',
    changes: () => [
      { field: 'lecturerName', label: 'Palestrante', beforeValue: null, afterValue: faker.person.fullName() },
      { field: 'role', label: 'Papel', beforeValue: null, afterValue: 'Palestrante principal' },
    ],
  },
  CERTIFICATE_CONFIG: {
    entityId: 'certificate-config-story',
    label: 'configuração de certificado',
    primaryOperation: 'UPDATE',
    summary: 'Configuração de certificado atualizada.',
    permission: 'certificate-config#update',
    actorTypes: ['USER'],
    eventId: 'event-story',
    majorEventId: 'major-event-story',
    eventGroupId: null,
    changes: () => [
      { field: 'minimumAttendanceMinutes', label: 'Presença mínima', beforeValue: '60', afterValue: '75' },
      { field: 'issuedTo', label: 'Emitido para', beforeValue: 'Participantes', afterValue: 'Participantes e palestrantes' },
    ],
  },
  CERTIFICATE: {
    entityId: 'certificate-story',
    label: 'certificado',
    primaryOperation: 'ISSUE',
    summary: 'Certificado emitido.',
    permission: 'certificate#issue',
    actorTypes: ['SERVICE', 'USER'],
    eventId: 'event-story',
    majorEventId: 'major-event-story',
    eventGroupId: null,
    changes: () => [
      { field: 'issuedAt', label: 'Emitido em', beforeValue: null, afterValue: '26/06/2026 14:30' },
      { field: 'workloadMinutes', label: 'Carga horária', beforeValue: null, afterValue: '120 minutos' },
    ],
  },
  MERGE_CANDIDATE: {
    entityId: 'merge-candidate-story',
    label: 'pessoa duplicada',
    primaryOperation: 'MERGE',
    summary: 'Candidata de duplicidade unificada.',
    permission: 'person#merge',
    actorTypes: ['USER'],
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    changes: () => [
      { field: 'status', label: 'Situação', beforeValue: 'Pendente', afterValue: 'Unificada' },
      { field: 'matchMethod', label: 'Critério', beforeValue: 'E-mail', afterValue: 'CPF e e-mail' },
    ],
  },
  RECEIPT_VALIDATION: {
    entityId: 'receipt-validation-story',
    label: 'validação de comprovante',
    primaryOperation: 'APPROVE',
    summary: 'Comprovante aprovado.',
    permission: 'receipt-validation#approve',
    actorTypes: ['USER'],
    eventId: null,
    majorEventId: 'major-event-story',
    eventGroupId: null,
    changes: () => [
      { field: 'status', label: 'Situação', beforeValue: 'Em análise', afterValue: 'Aprovado' },
      { field: 'amount', label: 'Valor reconhecido', beforeValue: null, afterValue: 'R$ 25,00' },
    ],
  },
  SYSTEM: {
    entityId: 'system-story',
    label: 'sistema',
    primaryOperation: 'IMPORT',
    summary: 'Rotina do sistema executada.',
    permission: null,
    actorTypes: ['SYSTEM'],
    eventId: null,
    majorEventId: null,
    eventGroupId: null,
    changes: () => [
      { field: 'job', label: 'Rotina', beforeValue: null, afterValue: 'Sincronização de auditoria' },
      { field: 'processedEntries', label: 'Registros processados', beforeValue: '0', afterValue: '124' },
    ],
  },
};

function scenarioForEntity(entityType: AuditLogEntityType): AuditLogScenario {
  return scenarioByEntityType[entityType];
}

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

function summaryForOperation(operation: AuditLogOperation, entityType: AuditLogEntityType, fallbackLabel: string): string {
  const entityLabel = auditLogEntityTypeLabel(entityType);
  switch (operation) {
    case 'CREATE':
      return `${entityLabel} criado.`;
    case 'UPDATE':
      return `${entityLabel} atualizado.`;
    case 'DELETE':
      return `${entityLabel} removido.`;
    case 'MERGE':
      return `${entityLabel} unificado.`;
    case 'IMPORT':
      return `${entityLabel} importado.`;
    case 'APPROVE':
      return `${entityLabel} aprovado.`;
    case 'REJECT':
      return `${entityLabel} rejeitado.`;
    case 'ISSUE':
      return `${entityLabel} emitido.`;
    case 'REISSUE':
      return `${entityLabel} reemitido.`;
    case 'SCAN':
      return `${entityLabel} lido.`;
    case 'UNDO':
      return `Ação em ${fallbackLabel} desfeita.`;
    case 'REVERT':
      return `Histórico de ${fallbackLabel} revertido.`;
    case 'USER_CREATE':
      return `${entityLabel} criado pelo usuário.`;
  }
}
