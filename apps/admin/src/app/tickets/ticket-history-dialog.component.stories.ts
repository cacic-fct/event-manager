import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { expect, within } from 'storybook/test';
import {
  createAdminEventTicket,
  createAdminTicketHistoryEntry,
  createTicketEventSummary,
  createTicketPersonSummary,
} from '@cacic-fct/shared-ticketing/testing';
import { TicketHistoryDialogComponent } from './ticket-history-dialog.component';

const event = createTicketEventSummary({ id: 'event-1', name: 'Jantar de integração', emoji: '🍽️' });
const originalHolder = createTicketPersonSummary({ personId: 'person-1', fullName: 'Grace Hopper', firstName: 'Grace' });
const currentHolder = createTicketPersonSummary({ personId: 'person-2', fullName: 'Ada Lovelace', firstName: 'Ada' });
const ticket = createAdminEventTicket({
  id: '019af4e8-6830-7000-a000-123456789abc',
  eventId: event.id,
  name: 'Jantar de integração',
  emoji: '🍽️',
  description: 'Acesso ao jantar de integração da semana acadêmica.',
  transferEligibilityDescription: 'Destinado a estudantes da Unesp.',
  transferable: true,
  event,
  holder: currentHolder,
  originalHolder,
  source: 'MAJOR_EVENT_SUBSCRIPTION',
  sourceReference: 'Inscrição subscription-1. Lote: Estudante.',
});
const history = [
  createAdminTicketHistoryEntry({ ticketId: ticket.id, operation: 'ISSUED', newHolder: originalHolder, actorName: 'Sistema', reason: 'Bilhete incluído na inscrição do grande evento.' }),
  createAdminTicketHistoryEntry({ ticketId: ticket.id, id: 'history-transfer', operation: 'TRANSFERRED', previousHolder: originalHolder, newHolder: currentHolder, actorName: 'Equipe de eventos', reason: 'Transferência confirmada por Ada Lovelace.' }),
  createAdminTicketHistoryEntry({ ticketId: ticket.id, id: 'history-consumed', operation: 'CONSUMED', previousHolder: currentHolder, newHolder: currentHolder, actorName: 'Leitor de acesso', reason: 'Entrada confirmada no credenciamento.' }),
  createAdminTicketHistoryEntry({ ticketId: ticket.id, id: 'history-revoked', operation: 'REVOKED', previousHolder: currentHolder, newHolder: null, actorName: 'Equipe de eventos', reason: 'Solicitação do titular.' }),
];

interface TicketHistoryStoryArgs {
  ticketName: string;
  empty: boolean;
  longReason: boolean;
  status: 'ACTIVE' | 'CONSUMED' | 'REVOKED';
}

const meta: Meta<TicketHistoryStoryArgs> = {
  component: TicketHistoryDialogComponent,
  title: 'Admin/Ticketing/History',
  tags: ['autodocs', 'ticketing'],
  args: { ticketName: ticket.name, empty: false, longReason: false, status: 'ACTIVE' },
  argTypes: {
    ticketName: { control: 'text' },
    empty: { control: 'boolean' },
    longReason: { control: 'boolean' },
    status: { control: 'select', options: ['ACTIVE', 'CONSUMED', 'REVOKED'] },
  },
  decorators: [
    withScenarioControls<TicketHistoryStoryArgs>(),
    (story, context) => applicationConfig({ providers: [{
      provide: MAT_DIALOG_DATA,
      useValue: {
        ticket: { ...ticket, name: context.args.ticketName, status: context.args.status },
        history: context.args.empty ? [] : history.filter((entry) =>
          entry.operation !== 'CONSUMED' && entry.operation !== 'REVOKED' || entry.operation === context.args.status,
        ).map((entry) => ({
          ...entry,
          reason: context.args.longReason
            ? 'Ajuste solicitado pelo titular após a conferência dos documentos e da inscrição no grande evento.\nA equipe registrou a justificativa e preservou as movimentações anteriores para auditoria.'
            : entry.reason,
        })),
      },
    }] })(story, context),
  ],
  parameters: { layout: 'centered', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<TicketHistoryStoryArgs>;

export const Playground: Story = {  };

export const OwnershipTrail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Histórico do bilhete' })).toBeVisible();
    await expect(canvas.getByText('Titularidade transferida')).toBeVisible();
    const transfer = canvasElement.querySelectorAll('.history-entry')[1];
    expect(transfer).not.toBeNull();
    await expect(transfer).toHaveTextContent('Grace Hopper');
    await expect(transfer).toHaveTextContent('Ada Lovelace');
  },
};

export const UsedTicket: Story = {
  args: { status: 'CONSUMED' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Bilhete utilizado')).toBeVisible();
  },
};

export const RevokedTicket: Story = {
  args: { status: 'REVOKED' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Bilhete revogado')).toBeVisible();
  },
};

export const NoMovements: Story = {
  args: { empty: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Ainda não há movimentações registradas para este bilhete.')).toBeVisible();
  },
};

export const LongReason: Story = {
  args: { longReason: true },
};
