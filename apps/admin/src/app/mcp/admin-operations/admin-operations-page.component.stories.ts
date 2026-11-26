import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { HttpResponse, http } from 'msw';
import { EMPTY } from 'rxjs';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { RealtimeApiService } from '../../graphql/realtime-api.service';
import { AdminOperationsPageComponent } from './admin-operations-page.component';
import { operationSettings, sportsCommand, sportsOperation } from './admin-operations.fixtures';
import type { AdminMcpCommand, AdminMcpCommandReview } from '@cacic-fct/event-manager-mcp-contracts';

const meta: Meta<AdminOperationsPageComponent> = {
  title: 'Admin/Operações administrativas MCP',
  component: AdminOperationsPageComponent,
  decorators: [
    applicationConfig({
      providers: [provideRouter([]), { provide: RealtimeApiService, useValue: { watchMcpReviews: () => EMPTY } }],
    }),
  ],
};
export default meta;
type Story = StoryObj<AdminOperationsPageComponent>;
function handlers(command: AdminMcpCommand | null = sportsCommand(), readOnly = false, delegation = false) {
  return {
    msw: {
      handlers: [
        http.get('/api/admin/mcp/settings', () =>
          HttpResponse.json({ ...operationSettings, proposalsEnabled: !readOnly }),
        ),
        http.get('/api/admin/mcp/operations/catalog', () => HttpResponse.json([sportsOperation])),
        http.get('/api/admin/mcp/operations/delegations', () =>
          HttpResponse.json(
            delegation
              ? [
                  {
                    id: 'demo-access',
                    clientId: 'demo-client',
                    scope: { mode: 'ALL_AUTHORIZED' },
                    operations: [sportsOperation.field],
                    personalData: false,
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 3600000).toISOString(),
                    maxProposals: 5,
                    revokedAt: null,
                  },
                ]
              : [],
          ),
        ),
        http.get('/api/admin/mcp/operations/proposals', () =>
          HttpResponse.json({ items: command ? [command] : [], hasMore: false }),
        ),
        http.post('/api/admin/mcp/operations/proposals/:id/review', async ({ request }) => {
          const input = (await request.json()) as AdminMcpCommandReview;
          return HttpResponse.json({
            ...input,
            proposalId: command?.id,
            operation: command?.operation,
            effects: 'Atualiza o resultado da partida de demonstração.',
            token: 'demo-review-token',
          });
        }),
        http.post('/api/admin/mcp/operations/proposals/:id/decision', () =>
          HttpResponse.json({ success: true, state: 'APPLIED' }),
        ),
        http.post('/api/admin/mcp/operations/delegations/:id/revoke', () => HttpResponse.json({ success: true })),
      ],
    },
  };
}
export const SportsCommand: Story = { parameters: handlers() };
export const Uncertain: Story = { parameters: handlers({ ...sportsCommand(), state: 'UNCERTAIN', canApprove: false }) };
export const ReadOnly: Story = { parameters: handlers(null, true) };
export const ActiveDelegation: Story = { parameters: handlers(null, false, true) };
export const PermissionDenied: Story = {
  parameters: handlers({
    ...sportsCommand(),
    canApprove: false,
    unavailableReason: 'Você não tem permissão para atualizar esta partida.',
  }),
};
export const ManualEdit: Story = {
  parameters: handlers(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Aplicar esta operação' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Editar Pontuação' }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
    const score = dialog.getByRole('spinbutton', { name: 'Pontuação' });
    await userEvent.clear(score);
    await userEvent.type(score, '3');
    await userEvent.click(dialog.getByRole('button', { name: 'Salvar revisão' }));
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Incluir Observações' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Conferir selecionadas (1)' }));
    await expect(await canvas.findByRole('button', { name: 'Aprovar e executar selecionadas' })).toBeEnabled();
    await expect(canvas.getAllByText('Validado para execução').length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Voltar à revisão' }));
    await expect(canvas.getByRole('checkbox', { name: 'Incluir Observações' })).not.toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: 'Editar Pontuação' }));
    const editor = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
    await expect(editor.getByRole('spinbutton', { name: 'Pontuação' })).toHaveValue(3);
    await userEvent.click(editor.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Conferir selecionadas (1)' }));
    await expect(await canvas.findByRole('button', { name: 'Aprovar e executar selecionadas' })).toBeEnabled();
  },
};

export const SearchableDestinations: Story = {
  parameters: handlers({
    ...sportsCommand(),
    arguments: { teamIds: ['equipe-demo', 'equipe-verde'], score: 2 },
    inputSchema: {
      type: 'object',
      properties: { teamIds: { type: 'array', title: 'Equipes' }, score: { type: 'number', title: 'Pontuação' } },
    },
    targets: [
      { kind: 'SportsTeam', id: 'equipe-demo', label: 'Equipe Azul (demonstração)' },
      { kind: 'SportsTeam', id: 'equipe-verde', label: 'Equipe Verde (demonstração)' },
    ],
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Editar Equipes' }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
    await userEvent.type(dialog.getByRole('searchbox', { name: 'Buscar Equipes' }), 'azul');
    await expect(dialog.getByRole('checkbox', { name: 'Equipe Azul (demonstração)' })).toBeChecked();
    await expect(dialog.queryByRole('checkbox', { name: 'Equipe Verde (demonstração)' })).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Equipe Azul (demonstração)' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Salvar revisão' }));
    await expect(canvas.getByText('Sua revisão', { exact: true })).toBeVisible();
  },
};

export const Expired: Story = {
  parameters: handlers({ ...sportsCommand(), expiresAt: new Date(Date.now() - 60000).toISOString() }),
};
export const StaleRevision: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/admin/mcp/operations/proposals/:id/review', () =>
          HttpResponse.json({ message: 'Os dados administrativos mudaram. Crie uma nova proposta.' }, { status: 409 }),
        ),
        ...handlers().msw.handlers,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Aplicar esta operação' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Conferir selecionadas (1)' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Os dados administrativos mudaram');
    await expect(canvas.queryByRole('button', { name: 'Aprovar e executar selecionadas' })).not.toBeInTheDocument();
  },
};
export const LostExecutionResponse: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/admin/mcp/operations/proposals/:id/decision', () => HttpResponse.error()),
        ...handlers().msw.handlers,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Aplicar esta operação' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Conferir selecionadas (1)' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Aprovar e executar selecionadas' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('interrompida');
    await expect(canvas.getByRole('checkbox', { name: 'Aplicar esta operação' })).toBeDisabled();
  },
};

export const SearchableCatalog: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/admin/mcp/operations/catalog', () =>
          HttpResponse.json([
            { ...sportsOperation, domain: 'sports' },
            {
              ...sportsOperation,
              field: 'listAccounts',
              domain: 'users',
              kind: 'query',
              label: 'Consultar contas',
              description: 'Consulta contas com autorização atual.',
              personalData: true,
              requiresAllAuthorized: true,
            },
          ]),
        ),
        ...handlers(null).msw.handlers,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Autorizar aplicativo'));
    await userEvent.type(await canvas.findByRole('searchbox', { name: 'Buscar operações' }), 'contas');
    await expect(canvas.getByText('1 operação encontrada.')).toBeVisible();
    await userEvent.click(canvas.getByText('Contas', { exact: true }));
    await expect(canvas.getByRole('checkbox', { name: 'Consultar contas (consulta)' })).toBeDisabled();
  },
};

export const StagedFileInspection: Story = {
  parameters: handlers({
    ...sportsCommand(),
    id: '00000000-0000-4000-8000-000000000001',
    operation: 'uploadSportsTeamLogo',
    operationLabel: 'Enviar logo da equipe',
    arguments: {
      artifactId: '00000000-0000-4000-8000-000000000002',
      sha256: 'a'.repeat(64),
      fileName: 'equipe-demo.png',
    },
    inputSchema: {
      type: 'object',
      properties: {
        artifactId: { type: 'string' },
        sha256: { type: 'string' },
        fileName: { type: 'string' },
      },
    },
    effects: 'Substitui o logo da equipe após a conferência e aprovação.',
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole('link', { name: 'Baixar arquivo 1' });
    await expect(link).toHaveAttribute(
      'href',
      '/api/admin/mcp/operations/proposals/00000000-0000-4000-8000-000000000001/files/00000000-0000-4000-8000-000000000002',
    );
    await expect(link).toHaveAttribute('rel', 'noopener');
  },
};
