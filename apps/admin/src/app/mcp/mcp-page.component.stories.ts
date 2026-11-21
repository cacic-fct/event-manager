import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import type {
  McpAdminDelegation,
  McpAdminProposal,
  McpAdminSettings,
  McpEventReviewInput,
} from '@cacic-fct/event-manager-mcp-contracts';
import { HttpResponse, delay, http } from 'msw';
import { EMPTY } from 'rxjs';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { McpPageComponent } from './mcp-page.component';

const now = new Date();
const proposedDescription =
  'Conheça os fundamentos da ciência de dados e pratique a análise de dados em uma oficina introdutória.\n\nTraga um computador para acompanhar os exercícios.';
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
  descriptionAfter: proposedDescription,
  baseUpdatedAt: now.toISOString(),
  currentUpdatedAt: now.toISOString(),
  currentDescription: 'Oficina introdutória com exercícios práticos.',
  publicationState: 'Rascunho',
  approvalEffects: 'A aprovação atualiza somente o rascunho do evento. Não publica o evento.',
  canApprove: true,
  reviewFields: [{ field: 'description', label: 'Descrição', proposedValue: proposedDescription }],
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
        http.post('/api/admin/mcp/proposals/:id/review', async ({ request, params }) => {
          const item = queue.find(({ id }) => id === params['id']);
          if (!item) return new HttpResponse(null, { status: 404 });
          const { selections } = (await request.json()) as McpEventReviewInput;
          const original = item.changes ?? [
            {
              field: 'description',
              label: 'Descrição',
              before: item.descriptionBefore,
              after: item.descriptionAfter,
            },
          ];
          const virtual = selections.some(({ field, value }) => field === 'isVirtual' && value !== false);
          const changes = original.flatMap((change) => {
            const selection = selections.find(({ field }) => field === change.field);
            if (!selection) return virtual ? [change] : [];
            const value = selection.value;
            const after = value === undefined ? change.after : typeof value === 'string' ? value.trim() : String(value);
            return [{ ...change, after: value === null ? null : after }];
          });
          return HttpResponse.json({ token: 'story-review-token', changes, approvalEffects: item.approvalEffects });
        }),
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
const newName = 'Oficina prática de ciência de dados (demonstração)';
const contentProposal: McpAdminProposal = {
  ...proposal,
  operation: 'EVENT_CONTENT',
  operationLabel: 'Conteúdo do evento',
  changes: [
    { field: 'name', label: 'Nome', before: proposal.eventName, after: newName },
    { field: 'description', label: 'Descrição', before: proposal.descriptionBefore, after: proposal.descriptionAfter },
  ],
  reviewFields: [
    { field: 'name', label: 'Nome', proposedValue: newName },
    { field: 'description', label: 'Descrição', proposedValue: proposal.descriptionAfter },
  ],
};
export const EventContent: Story = { parameters: handlers([contentProposal]) };
export const Location: Story = {
  parameters: handlers([
    {
      ...proposal,
      operation: 'EVENT_LOCATION',
      operationLabel: 'Local do evento',
      reviewFields: [{ field: 'isVirtual', label: 'Evento virtual', proposedValue: true }],
      changes: [
        { field: 'isVirtual', label: 'Evento virtual', before: 'Não', after: 'Sim' },
        { field: 'locationName', label: 'Nome do local', before: 'Sala de demonstração', after: null },
        { field: 'locationDescription', label: 'Descrição do local', before: 'Primeiro andar', after: null },
        { field: 'latitude', label: 'Latitude', before: '-22.12', after: null },
        { field: 'longitude', label: 'Longitude', before: '-51.4', after: null },
      ],
    },
  ]),
};
export const Preparation: Story = {
  parameters: handlers([
    {
      ...proposal,
      operation: 'EVENT_PREPARATION',
      operationLabel: 'Orientações de preparação',
      reviewFields: [
        {
          field: 'lecturerInformation',
          label: 'Orientações para palestrantes',
          proposedValue: 'Teste o ambiente antes da oficina.\nOrientações privadas de demonstração para palestrantes.',
        },
        {
          field: 'collectorInformation',
          label: 'Orientações para coletores',
          proposedValue: 'Abra a coleta no início da oficina.\nOrientações privadas de demonstração para coletores.',
        },
      ],
      changes: [
        {
          field: 'lecturerInformation',
          label: 'Orientações para palestrantes',
          before: null,
          after: 'Teste o ambiente antes da oficina.\nOrientações privadas de demonstração para palestrantes.',
        },
        {
          field: 'collectorInformation',
          label: 'Orientações para coletores',
          before: 'Chegue antes da oficina.',
          after: 'Abra a coleta no início da oficina.\nOrientações privadas de demonstração para coletores.',
        },
      ],
    },
  ]),
};
export const Livestream: Story = {
  parameters: handlers([
    {
      ...proposal,
      operation: 'EVENT_LIVESTREAM',
      operationLabel: 'Transmissão ao vivo',
      reviewFields: [
        { field: 'youtubeCode', label: 'Vídeo do YouTube', proposedValue: 'M7lc1UVf-VE' },
        { field: 'twitchChannel', label: 'Canal da Twitch', proposedValue: null },
      ],
      changes: [
        { field: 'youtubeCode', label: 'Vídeo do YouTube', before: null, after: 'M7lc1UVf-VE' },
        { field: 'twitchChannel', label: 'Canal da Twitch', before: 'canaldemonstracao', after: null },
      ],
    },
  ]),
};
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
export const FailedDecision: Story = {
  parameters: handlers([proposal], { decisionError: true }),
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Revisar proposta' }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Conferir alterações finais' }));
    await userEvent.click(await dialog.findByRole('button', { name: 'Aprovar proposta' }));
    const alert = await dialog.findByRole('alert');
    await expect(alert).toHaveTextContent('O evento mudou.');
    await waitFor(() => expect(alert).toHaveFocus());
  },
};
export const Empty: Story = { parameters: handlers([]) };
export const Loading: Story = { parameters: handlers([], { slow: true }) };
export const LoadError: Story = { parameters: handlers([], { error: true }) };
export const Disabled: Story = { parameters: handlers([], { disabled: true }) };

export const AuthorizedApplication: Story = { parameters: handlers([proposal], { delegation: true }) };

const revisedText = 'Oficina prática com exercícios em grupo.';

async function previewPartialApproval(canvasElement: HTMLElement) {
  await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Revisar proposta' }));
  const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
  await userEvent.click(dialog.getByRole('checkbox', { name: 'Incluir Nome' }));
  await userEvent.click(dialog.getByRole('button', { name: 'Editar Descrição' }));
  const input = dialog.getByRole('textbox', { name: 'Descrição para aplicar' });
  await userEvent.clear(input);
  await userEvent.type(input, revisedText);
  await userEvent.click(dialog.getByRole('button', { name: 'Conferir alterações finais' }));
  await expect(await dialog.findByText(revisedText)).toBeVisible();
  await expect(dialog.queryByText(newName)).toBeNull();
  await expect(dialog.getByText('Será aplicado')).toBeVisible();
  return dialog;
}

export const FinalReview: Story = {
  parameters: handlers([contentProposal]),
  play: async ({ canvasElement }) => {
    await previewPartialApproval(canvasElement);
  },
};

export const SelectiveApproval: Story = {
  parameters: handlers([contentProposal]),
  play: async ({ canvasElement }) => {
    const dialog = await previewPartialApproval(canvasElement);
    await userEvent.click(dialog.getByRole('button', { name: 'Aprovar proposta' }));
    await expect(await within(canvasElement).findByText('Proposta aprovada e aplicada.')).toBeVisible();
  },
};

export const CancelReview: Story = {
  parameters: handlers([proposal]),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const trigger = await page.findByRole('button', { name: 'Revisar proposta' });
    await userEvent.click(trigger);
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Incluir Descrição' }));
    await expect(dialog.getByRole('button', { name: 'Conferir alterações finais' })).toBeDisabled();
    await userEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(page.getByText(/^Conheça os fundamentos/)).toBeVisible();
  },
};
