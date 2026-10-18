import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { Permission, type Permission as PermissionScope } from '@cacic-fct/shared-permissions';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { NEVER, of, throwError } from 'rxjs';
import { DataTransferApiService } from './data-transfer-api.service';
import { DataTransferPageComponent } from './data-transfer-page.component';
import {
  createTransferPreviewFixture,
  createTransferResultFixture,
  transferDocumentFixture,
} from './data-transfer-page.fixtures';
import { createDataTransferStoryHandlers, resetDataTransferStoryApi } from './data-transfer-page.story-handlers';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';
import { AdminEventContextApiService } from '../graphql/admin-event-context-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import {
  contextStoryEvent,
  contextStoryGroup,
  contextStoryMajor,
  contextStoryPage,
} from '../shared/event-context-story.fixtures';

type DataTransferStoryMode =
  | 'ready'
  | 'blocked'
  | 'loading'
  | 'error'
  | 'completed'
  | 'readonly'
  | 'person-creation'
  | 'person-merge'
  | 'import-only'
  | 'undo-only'
  | 'connected'
  | 'connected-response-lost'
  | 'connected-blocked'
  | 'connected-conflict'
  | 'connected-scoped'
  | 'connected-import-only'
  | 'connected-undo-only';

interface DataTransferStoryArgs {
  mode: DataTransferStoryMode;
}

const defaultArgs: DataTransferStoryArgs = { mode: 'ready' };
let activeMode: DataTransferStoryMode = defaultArgs.mode;
let storyBatchUndone = false;

const dataTransferApi = {
  getSchema: () => of({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' }),
  export: () => of({ document: transferDocumentFixture, issues: [] }),
  preview: (request: { personDecisions?: unknown[] }) => {
    if (activeMode === 'loading') {
      return NEVER;
    }
    if (activeMode === 'error') {
      return throwError(() => new Error('O servidor recusou a revisão. Confira o arquivo e tente novamente.'));
    }
    if (['person-creation', 'person-merge'].includes(activeMode) && !request.personDecisions?.length)
      return of({
        ...createTransferPreviewFixture(),
        canApply: false,
        personPrompts: [
          {
            key: 'a'.repeat(64),
            data:
              activeMode === 'person-merge' ? { name: 'Ana Silva', email: 'new@example.com' } : { name: 'Ana Silva' },
            message: 'Revise os dados antes de importar.',
            canCreate: true,
            canMerge: activeMode === 'person-merge',
            ...(activeMode === 'person-merge'
              ? { candidates: [{ id: 'existing-person', name: 'Ana Silva', email: 'old@example.com' }] }
              : {}),
          },
        ],
      });
    return of(createTransferPreviewFixture(activeMode === 'blocked'));
  },
  apply: () => of(createTransferResultFixture(activeMode === 'blocked')),
  undo: (batchId: string) => {
    storyBatchUndone = true;
    return of({ batchId, auditEntryId: 'story-undo-audit-entry', undone: true as const });
  },
  history: () =>
    of(
      activeMode === 'undo-only'
        ? [
            {
              batchId: 'story-history-batch',
              auditEntryId: 'story-history-audit',
              createdAt: new Date().toISOString(),
              summary: { create: 2, update: 1, unchanged: 0, skip: 0 },
              undone: storyBatchUndone,
              synchronizationPending: false,
            },
          ]
        : [],
    ),
};

function hasStoryPermission(permission: string): boolean {
  if (activeMode === 'undo-only' || activeMode === 'connected-undo-only') {
    return permission === Permission.DataTransfer.Undo;
  }
  if (activeMode === 'import-only' || activeMode === 'connected-import-only') {
    const importOnlyPermissions: readonly PermissionScope[] = [
      Permission.DataTransfer.Import,
      Permission.Event.Read,
      Permission.EventGroup.Read,
      Permission.MajorEvent.Read,
    ];
    return importOnlyPermissions.includes(permission as PermissionScope);
  }
  if (activeMode === 'readonly') {
    const exportOnlyPermissions: readonly PermissionScope[] = [
      Permission.DataTransfer.Export,
      Permission.Event.Read,
      Permission.EventGroup.Read,
      Permission.MajorEvent.Read,
    ];
    return exportOnlyPermissions.includes(permission as PermissionScope);
  }
  return true;
}

const meta: Meta<DataTransferStoryArgs> = {
  component: DataTransferPageComponent,
  title: 'Admin/Event Management/Data Transfer/JSON',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    mode: {
      control: 'select',
      options: [
        'ready',
        'person-creation',
        'person-merge',
        'blocked',
        'loading',
        'error',
        'completed',
        'readonly',
        'undo-only',
      ],
    },
  },
  decorators: [
    withScenarioControls<DataTransferStoryArgs>(),
    (story, context) => {
      activeMode = (context.args as DataTransferStoryArgs).mode;
      storyBatchUndone = false;
      resetDataTransferStoryApi(activeMode);
      return applicationConfig({
        providers: [
          provideRouter([]),
          provideNoopAnimations(),
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: of(
                convertToParamMap(
                  activeMode === 'connected-scoped' ? { kind: 'major-event', targetId: 'storybook-major' } : {},
                ),
              ),
              snapshot: {
                paramMap: convertToParamMap(
                  activeMode === 'connected-scoped' ? { kind: 'major-event', targetId: 'storybook-major' } : {},
                ),
                data: {},
              },
            },
          },
          { provide: ADMIN_SHELL_CONTEXT, useValue: false },
          ...(activeMode.startsWith('connected')
            ? []
            : [{ provide: DataTransferApiService, useValue: dataTransferApi }]),
          {
            provide: PermissionsService,
            useValue: {
              has: hasStoryPermission,
              hasAny: (permissions: string[]) => permissions.some(hasStoryPermission),
              hasAll: (permissions: string[]) => permissions.every(hasStoryPermission),
              canReadTab: () => true,
              evaluateWorkspacePermissions: async () => undefined,
            },
          },
          {
            provide: WorkspacePendingChangesService,
            useValue: {
              register: () => ({ set: () => undefined, destroy: () => undefined }),
              canDeactivate: async () => true,
            },
          },
          {
            provide: AdminEventContextApiService,
            useValue: { listPage: (options: Parameters<typeof contextStoryPage>[0]) => of(contextStoryPage(options)) },
          },
          { provide: EventApiService, useValue: { getEvent: () => of(contextStoryEvent) } },
          { provide: EventGroupApiService, useValue: { getEventGroup: () => of(contextStoryGroup) } },
          { provide: MajorEventApiService, useValue: { getMajorEvent: () => of(contextStoryMajor) } },
        ],
      })(story, context);
    },
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    docs: {
      description: {
        component:
          'Administrative tool for exporting and importing event trees, sports configuration, and authorized subscription and attendance records.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<DataTransferStoryArgs>;

export const ReadyPreview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterJson(canvas);
    await userEvent.click(canvas.getByRole('button', { name: /revisar importação/i }));
    await expect(await canvas.findByRole('heading', { name: 'Revisão do plano' })).toBeVisible();
    const firstRowHeader = canvasElement.querySelector('.review-item mat-expansion-panel-header');
    if (!firstRowHeader) {
      throw new Error('The first transfer review row was not rendered.');
    }
    await userEvent.click(firstRowHeader);
    await expect(canvas.getByText('Valor atual')).toBeVisible();
    await expect(canvas.getByText('Valor proposto')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /aplicar alterações/i })).toBeEnabled();
  },
};

export const PersonCreation: Story = {
  args: { mode: 'person-creation' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterJson(canvas);
    await userEvent.click(canvas.getByRole('button', { name: 'Revisar importação' }));
    await expect(await canvas.findByRole('heading', { name: 'Pessoas que precisam de revisão' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Confirmar criação' })).toBeDisabled();
    await userEvent.type(canvas.getByRole('textbox', { name: 'E-mail' }), 'ana@example.com');
    await userEvent.click(canvas.getByRole('button', { name: 'Confirmar criação' }));
    await expect(canvas.getByText(/Criação confirmada/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Revisar importação' }));
    await expect(await canvas.findByRole('button', { name: 'Aplicar alterações' })).toBeEnabled();
  },
};

export const PersonMergeReview: Story = {
  args: { mode: 'person-merge' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterJson(canvas);
    await userEvent.click(canvas.getByRole('button', { name: 'Revisar importação' }));
    await userEvent.click(await canvas.findByRole('combobox', { name: 'Pessoa existente' }));
    await userEvent.click(within(document.body).getByRole('option', { name: /old@example.com/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Confirmar mesclagem' }));
    await expect(canvas.getByText(/Mesclagem confirmada/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Revisar importação' }));
    await expect(await canvas.findByRole('button', { name: 'Aplicar alterações' })).toBeEnabled();
  },
};

export const BlockedRows: Story = {
  args: { mode: 'blocked' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterJson(canvas);
    await userEvent.click(canvas.getByRole('button', { name: /revisar importação/i }));
    const partialConsent = canvas.getByRole('checkbox', { name: /ignorar registros bloqueados/i });
    await expect(partialConsent).not.toBeChecked();
    await expect(canvas.getByText(/Ignorar registros bloqueados/)).toBeVisible();
    const reviewHeaders = canvasElement.querySelectorAll('.review-item mat-expansion-panel-header');
    const blockedRowHeader = reviewHeaders.item(reviewHeaders.length - 1);
    if (!blockedRowHeader) {
      throw new Error('The blocked transfer row was not rendered.');
    }
    await userEvent.click(blockedRowHeader);
    await expect(
      canvas.getByText('Não foi encontrada uma pessoa correspondente única.', { exact: true }),
    ).toBeVisible();
  },
};

export const LoadingPreview: Story = {
  args: { mode: 'loading' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterJson(canvas);
    await userEvent.click(canvas.getByRole('button', { name: /revisar importação/i }));
    await expect(await canvas.findByLabelText('Revisando importação')).toBeVisible();
  },
};

export const PreviewError: Story = {
  args: { mode: 'error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterJson(canvas);
    await userEvent.click(canvas.getByRole('button', { name: /revisar importação/i }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('O servidor recusou a revisão.');
  },
};

export const CompletedImport: Story = {
  args: { mode: 'completed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterJson(canvas);
    await userEvent.click(canvas.getByRole('button', { name: /revisar importação/i }));
    await userEvent.click(await canvas.findByRole('button', { name: /aplicar alterações/i }));
    await expect(await canvas.findByText(/importação concluída/i)).toBeVisible();
    await expect(canvas.getByRole('button', { name: /baixar relatório da importação/i })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /baixar json com ids gerados/i })).toBeVisible();
  },
};

export const ExportOnly: Story = {
  args: { mode: 'readonly' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Exportar JSON' })).toBeVisible();
    await expect(canvas.getByText(/sua conta não tem permissão para importar arquivos/i)).toBeVisible();
    await expect(canvas.queryByRole('textbox', { name: 'Conteúdo JSON' })).toBeNull();
  },
};

export const UndoConfirmation: Story = {
  args: { mode: 'completed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterJson(canvas);
    await userEvent.click(canvas.getByRole('button', { name: /revisar importação/i }));
    await userEvent.click(await canvas.findByRole('button', { name: /aplicar alterações/i }));
    await userEvent.click(await canvas.findByRole('button', { name: /desfazer esta importação/i }));
    await expect(await canvas.findByRole('group', { name: /reverter todas as alterações/i })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /confirmar reversão/i }));
    await expect(await canvas.findByText(/importação revertida/i)).toBeVisible();
    await expect(canvas.getByText('story-undo-audit-entry')).toBeVisible();
  },
};

export const UndoOnlyHistory: Story = {
  args: { mode: 'undo-only' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Importações recentes' })).toBeVisible();
    await expect(canvas.getByText('story-history-batch')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /desfazer este lote/i }));
    await expect(await canvas.findByRole('group', { name: /reverter todas as alterações/i })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: /confirmar reversão/i }));
    await expect(await canvas.findByText(/importação revertida/i)).toBeVisible();
  },
};

function connectedApiParameters() {
  return {
    msw: {
      handlers: {
        rest: createDataTransferStoryHandlers(() => activeMode),
      },
    },
  };
}

export const ConnectedApi: Story = {
  args: { mode: 'connected' },
  parameters: connectedApiParameters(),
};

export const ConnectedApiResponseLost: Story = {
  args: { mode: 'connected-response-lost' },
  parameters: connectedApiParameters(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await enterJson(canvas);
    await userEvent.click(canvas.getByRole('button', { name: 'Revisar importação' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Aplicar alterações' }));
    const retry = await canvas.findByRole('button', { name: 'Verificar resultado / tentar novamente' });
    await waitFor(() => expect(retry).toBeEnabled());
    await expect(canvas.getByRole('textbox', { name: 'Conteúdo JSON' })).toBeDisabled();
  },
};

export const Playground: Story = ConnectedApi;

export const ConnectedApiBlocked: Story = {
  args: { mode: 'connected-blocked' },
  parameters: connectedApiParameters(),
};

export const ConnectedApiUndoConflict: Story = {
  args: { mode: 'connected-conflict' },
  parameters: connectedApiParameters(),
};

export const ConnectedApiScoped: Story = {
  args: { mode: 'connected-scoped' },
  parameters: connectedApiParameters(),
};

export const ConnectedApiImportOnly: Story = {
  args: { mode: 'connected-import-only' },
  parameters: connectedApiParameters(),
};

export const ConnectedApiUndoOnly: Story = {
  args: { mode: 'connected-undo-only' },
  parameters: connectedApiParameters(),
};

async function enterJson(canvas: ReturnType<typeof within>): Promise<void> {
  const editor = canvas.getByRole('textbox', { name: 'Conteúdo JSON' });
  await userEvent.click(editor);
  await userEvent.paste(JSON.stringify(transferDocumentFixture));
}

export const TicketExport: StoryObj<DataTransferStoryArgs> = {
  args: { mode: 'ready' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('checkbox', { name: /^Incluir bilhetes$/ })).not.toBeChecked();
    await expect(canvas.getByText(/Inclui bilhetes ativos, consumidos e revogados/)).toBeVisible();
  },
};
