import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import type { McpAdminDelegation, McpAdminProposal, McpAdminSettings } from '@cacic-fct/event-manager-mcp-contracts';
import { HttpResponse, delay, http } from 'msw';
import { EMPTY } from 'rxjs';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { McpPageComponent } from './mcp-page.component';

const now = new Date();
const settings: McpAdminSettings = {
  enabled: true,
  proposalsEnabled: true,
  resourceUrl: 'https://eventos.example.org/api/mcp/admin',
  clients: [{ id: 'demo-client', name: 'Assistente de eventos (demonstração)' }],
};
const proposal: McpAdminProposal = {
  id: 'demo-proposal',
  delegationId: 'demo-access',
  eventId: 'demo-event',
  eventName: 'Oficina de introdução à ciência de dados (demonstração)',
  clientId: 'demo-client',
  createdAt: now.toISOString(),
  expiresAt: new Date(now.getTime() + 3600000).toISOString(),
  status: 'PENDING',
  descriptionBefore: 'Oficina introdutória com exercícios práticos.',
  descriptionAfter:
    'Conheça os fundamentos da ciência de dados e pratique a análise de dados em uma oficina introdutória.\n\nTraga um computador para acompanhar os exercícios.',
  baseUpdatedAt: now.toISOString(),
  currentUpdatedAt: now.toISOString(),
  currentDescription: 'Oficina introdutória com exercícios práticos.',
  publicationState: 'Rascunho',
  approvalEffects: 'A aprovação atualiza somente o rascunho do evento. Não publica o evento.',
  canApprove: true,
  unavailableReason: null,
  approvedByName: null,
  decidedAt: null,
};
const meta: Meta<McpPageComponent> = {
  title: 'Admin/Aplicativos e propostas MCP',
  component: McpPageComponent,
  decorators: [
    applicationConfig({
      providers: [provideRouter([]), { provide: RealtimeApiService, useValue: { watchMcpReviews: () => EMPTY } }],
    }),
  ],
};
export default meta;
type Story = StoryObj<McpPageComponent>;

function handlers(
  items: McpAdminProposal[],
  options: { disabled?: boolean; error?: boolean; slow?: boolean; decisionError?: boolean; delegation?: boolean } = {},
) {
  let queue = items;
  let delegations: McpAdminDelegation[] = options.delegation
    ? [
        {
          id: 'demo-access',
          clientId: 'demo-client',
          eventIds: ['demo-event'],
          events: [{ id: 'demo-event', name: proposal.eventName }],
          capabilities: ['EVENT_READ', 'DESCRIPTION_PROPOSE'],
          expiresAt: proposal.expiresAt,
          maxProposals: 5,
          createdAt: proposal.createdAt,
          revokedAt: null,
          proposalCount: 1,
        },
      ]
    : [];
  return {
    msw: {
      handlers: [
        http.get('/api/admin/mcp/settings', async () => {
          if (options.slow) await delay('infinite');
          if (options.error)
            return HttpResponse.json(
              { message: 'Não foi possível carregar os dados. Tente novamente.' },
              { status: 503 },
            );
          return HttpResponse.json({ ...settings, enabled: !options.disabled });
        }),
        http.get('/api/admin/mcp/delegations', () => HttpResponse.json(delegations)),
        http.post('/api/admin/mcp/delegations/:id/revoke', () => {
          delegations = delegations.map((entry) => ({ ...entry, revokedAt: new Date().toISOString() }));
          return HttpResponse.json({ success: true });
        }),
        http.get('/api/admin/mcp/proposals', () => HttpResponse.json({ items: queue, hasMore: false })),
        http.post('/api/admin/mcp/proposals/:id/decision', () => {
          if (options.decisionError)
            return HttpResponse.json({ message: 'O evento mudou. Atualize a fila antes de revisar.' }, { status: 409 });
          queue = [];
          return HttpResponse.json({ success: true });
        }),
      ],
    },
  };
}
export const Pending: Story = { parameters: handlers([proposal]) };
export const Stale: Story = {
  parameters: handlers([
    {
      ...proposal,
      canApprove: false,
      currentUpdatedAt: new Date(now.getTime() + 1000).toISOString(),
      currentDescription: 'Descrição atualizada por outra pessoa.',
      unavailableReason: 'O evento mudou desde o envio da proposta.',
    },
  ]),
};
export const Frozen: Story = {
  parameters: handlers([{ ...proposal, canApprove: false, unavailableReason: 'O evento está congelado.' }]),
};
export const PermissionDenied: Story = {
  parameters: handlers([
    { ...proposal, canApprove: false, unavailableReason: 'Você não tem permissão para atualizar este evento.' },
  ]),
};
export const FailedDecision: Story = { parameters: handlers([proposal], { decisionError: true }) };
export const Empty: Story = { parameters: handlers([]) };
export const Loading: Story = { parameters: handlers([], { slow: true }) };
export const LoadError: Story = { parameters: handlers([], { error: true }) };
export const Disabled: Story = { parameters: handlers([], { disabled: true }) };

export const AuthorizedApplication: Story = { parameters: handlers([proposal], { delegation: true }) };
