import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { of } from 'rxjs';
import type { AdminTicketEligibility } from '@cacic-fct/shared-ticketing';
import { createAdminEventTicket, createTicketEventSummary, createTicketPersonSummary, createTicketTransfer } from '@cacic-fct/shared-ticketing/testing';
import { PeopleApiService } from '../graphql/people-api.service';
import { TicketAdminApiService } from '../graphql/ticket-admin-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { adminFixtureDateFromNow, createAdminPerson } from '../testing/admin-entity-fixtures';
import { TicketAdminPersonActionDialogComponent, type TicketAdminPersonActionData } from './ticket-admin-person-action-dialog.component';

interface TicketActionStoryArgs {
  action: 'ISSUE' | 'TRANSFER';
  eligible: boolean;
  allowPeopleSearch: boolean;
}

const person = createAdminPerson({ id: 'person-1', name: 'Ana Souza', email: 'ana@example.com' });
const eventSummary = createTicketEventSummary({
  id: 'event-1',
  name: 'Festa de boas-vindas',
  emoji: '🎉',
  startsAt: adminFixtureDateFromNow(8, 18),
  endsAt: adminFixtureDateFromNow(8, 23),
  publicUrl: null,
});
const personSummary = createTicketPersonSummary({
  personId: person.id,
  fullName: person.name,
  firstName: 'Ana',
});
const ticket = createAdminEventTicket({
  id: '019af4e8-6830-7000-a000-123456789abc',
  eventId: eventSummary.id,
  name: eventSummary.name,
  emoji: eventSummary.emoji,
  description: null,
  transferEligibilityDescription: 'Destinado a estudantes da Unesp.',
  status: 'ACTIVE',
  transferable: true,
  effectiveExpiresAt: eventSummary.endsAt,
  event: eventSummary,
  holder: personSummary,
  source: 'ADMIN',
  originalHolder: personSummary,
});
const transfer = createTicketTransfer({
  id: 'transfer-1',
  ticket,
  event: eventSummary,
  sender: personSummary,
  recipient: null,
  submittedDestinationIdentityDocument: null,
  senderStatus: 'PENDING',
  recipientStatus: 'PENDING',
  ignoreReason: null,
  initiatedByAdmin: true,
  initiatingAdmin: { personId: 'admin-1', firstName: 'Equipe', avatarUrl: null },
  canCancel: false,
});

const meta: Meta<TicketActionStoryArgs> = {
  component: TicketAdminPersonActionDialogComponent,
  title: 'CACiC Eventos/Workspace/Tickets/Admin Ticket Action',
  tags: ['autodocs', 'ticketing'],
  args: { action: 'ISSUE', eligible: false, allowPeopleSearch: true },
  argTypes: {
    action: { control: 'inline-radio', options: ['ISSUE', 'TRANSFER'] },
    eligible: { control: 'boolean' },
    allowPeopleSearch: { control: 'boolean' },
  },
  decorators: [
    (story, context) => applicationConfig({ providers: createProviders(context.args) })(story, context),
  ],
  parameters: { layout: 'centered', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<TicketActionStoryArgs>;

export const Playground: Story = {};

export const ManualIssueWithEligibilityWarning: Story = {
  args: { action: 'ISSUE', eligible: false, allowPeopleSearch: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = await canvas.findByRole('searchbox', { name: 'Buscar pessoa destinatária' });
    await userEvent.type(search, 'Ana');
    await userEvent.click(canvas.getByRole('button', { name: 'Buscar' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Selecionar Ana Souza' }));
    await expect(await canvas.findByText('A pessoa não atende a todos os critérios')).toBeVisible();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Motivo para auditoria' }), 'Inclusão especial');
    await expect(canvas.getByRole('button', { name: 'Emitir bilhete' })).toBeEnabled();
  },
};

export const AdminTransferAwaitingReceiver: Story = {
  args: { action: 'TRANSFER', eligible: true, allowPeopleSearch: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/continua com Ada Souza até a pessoa destinatária confirmar/)).toBeVisible();
    const search = await canvas.findByRole('searchbox', { name: 'Buscar pessoa destinatária' });
    await userEvent.type(search, 'Ana');
    await userEvent.click(canvas.getByRole('button', { name: 'Buscar' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Selecionar Ana Souza' }));
    await expect(await canvas.findByText('A pessoa atende aos critérios configurados para este bilhete.')).toBeVisible();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Motivo para auditoria' }), 'Ajuste administrativo');
    await expect(canvas.getByRole('button', { name: 'Enviar para confirmação' })).toBeEnabled();
  },
};

export const PersonSearchPermissionMissing: Story = {
  args: { action: 'ISSUE', eligible: true, allowPeopleSearch: false },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Buscar pessoas exige a permissão de leitura de pessoas.')).toBeVisible();
  },
};

function createProviders(args: TicketActionStoryArgs) {
  const eligibility: AdminTicketEligibility = args.eligible
    ? { eligible: true, warnings: [] }
    : { eligible: false, warnings: [{ code: 'COURSE_REQUIRED', message: 'É necessário estar matriculado em Ciência da Computação.' }] };
  const api = {
    getEligibilityWarnings: () => of(eligibility),
    issueTicket: () => of(ticket),
    startTransfer: () => of(transfer),
  } satisfies Partial<TicketAdminApiService>;
  const data: TicketAdminPersonActionData = {
    action: args.action,
    eventId: eventSummary.id,
    ticketId: args.action === 'TRANSFER' ? ticket.id : undefined,
    eventName: eventSummary.name,
    ticketName: eventSummary.name,
    holderName: 'Ada Souza',
  };
  return [
    { provide: MAT_DIALOG_DATA, useValue: data },
    { provide: MatDialogRef, useValue: { close: () => undefined } },
    { provide: PeopleApiService, useValue: { listRelatedPeople: () => of([person]) } },
    { provide: TicketAdminApiService, useValue: api },
    { provide: PermissionsService, useValue: { has: () => args.allowPeopleSearch } },
  ];
}
