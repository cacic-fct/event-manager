import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { HttpResponse, http } from 'msw';
import { EMPTY } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
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
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Revisar operação' }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
    const score = dialog.getByRole('textbox', { name: 'Pontuação para aplicar' });
    await userEvent.clear(score);
    await userEvent.type(score, '3');
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Incluir Observações' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Conferir argumentos finais' }));
    await expect(await dialog.findByRole('button', { name: 'Aprovar e executar' })).toBeEnabled();
    await expect(dialog.getByText('Argumentos finais validados')).toBeVisible();
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
