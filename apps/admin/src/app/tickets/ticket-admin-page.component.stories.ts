import { RealtimeApiService } from '../graphql/realtime-api.service';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EMPTY, NEVER, of, throwError } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import type { Event, MajorEventPriceTier } from '@cacic-fct/event-manager-admin-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  createAdminEventTicket,
  createAdminTicketConfig,
  createAdminTicketHistoryEntry,
  createTicketEventSummary,
  createTicketPersonSummary,
  createTicketTransfer,
} from '@cacic-fct/shared-ticketing/testing';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { TicketAdminApiService } from '../graphql/ticket-admin-api.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { PermissionsService } from '../permissions/permissions.service';
import { adminFixtureDateFromNow, createAdminEvent, createAdminMajorEvent } from '../testing/admin-entity-fixtures';
import { TicketAdminPageComponent } from './ticket-admin-page.component';

interface TicketAdminStoryArgs {
  configExists: boolean;
  ticketsCount: number;
  readOnly: boolean;
  scope: 'standalone' | 'group-event' | 'major-event' | 'major-overview';
  apiState: 'ready' | 'loading' | 'load-error' | 'holders-error' | 'save-error';
  enabled: boolean;
  purchaseEnabled: boolean;
  eligibilityProfile: 'open' | 'unesp-student' | 'ra-prefix';
  priceModel: 'SINGLE' | 'PER_TIER';
  expirationMode: 'EVENT_END' | 'CUSTOM';
}

const eventId = 'event-1';
const majorEventId = 'major-event-1';
const tiers: MajorEventPriceTier[] = [
  { id: 'tier-student', name: 'Estudante', value: 12_000, includesSportsRegistration: false },
  { id: 'tier-guest', name: 'Visitante', value: 24_000, includesSportsRegistration: false },
];
const majorEvent = createAdminMajorEvent({
  id: majorEventId,
  name: 'Semana da Computação',
  emoji: '💻',
  majorEventPrices: [{ id: 'price-1', type: 'TIERED', tiers }],
});
const event = createAdminEvent({
  id: eventId,
  name: 'Jantar de integração',
  emoji: '🍽️',
  startDate: adminFixtureDateFromNow(8, 18),
  endDate: adminFixtureDateFromNow(8, 22),
  majorEventId,
  majorEvent,
});
const eventSummary = createTicketEventSummary({
  id: event.id,
  name: event.name,
  emoji: event.emoji,
  startsAt: event.startDate,
  endsAt: event.endDate,
  publicUrl: null,
});
const holder = createTicketPersonSummary({ personId: 'person-1', fullName: 'Ada Lovelace', firstName: 'Ada' });
const config = createAdminTicketConfig({
  eventId: event.id,
  event: eventSummary,
  majorEventId: majorEvent.id,
  enabled: true,
  displayName: null,
  displayEmoji: null,
  description: 'Acesso ao jantar de integração da semana acadêmica.',
  transferEligibilityDescription: 'Destinado a estudantes e colaboradores da Unesp.',
  issueOnEventSubscription: false,
  issueOnMajorEventSubscription: true,
  includedPriceTierIds: ['tier-student'],
  recipientPolicy: {
    subscriptionRequirement: 'REQUIRED',
    requiresUnesp: true,
    requiredAcademicIdPrefixes: [],
    requiredCourseCodes: ['12'],
    requiresAccountManagerVerification: false,
    allowedPriceTierIds: ['tier-student'],
  },
  purchaseEnabled: true,
  purchaseVisibility: {
    subscriptionRequirement: 'REQUIRED',
    requiresUnesp: true,
    requiredAcademicIdPrefixes: [],
    requiredCourseCodes: ['12'],
    requiresAccountManagerVerification: false,
    allowedPriceTierIds: ['tier-student', 'tier-guest'],
    requiresValidatedSubscription: true,
  },
  priceOptions: [
    { id: 'price-student', priceTierId: 'tier-student', label: 'Estudante', amountCents: 8_000 },
    { id: 'price-guest', priceTierId: 'tier-guest', label: 'Visitante', amountCents: 16_000 },
  ],
});
const ticket = createAdminEventTicket({
  id: '018f47a1-3d5b-7abc-8def-0123456789ab',
  eventId: event.id,
  event: eventSummary,
  name: config.displayName || event.name,
  emoji: config.displayEmoji || event.emoji,
  description: config.description,
  transferEligibilityDescription: config.transferEligibilityDescription,
  status: 'ACTIVE',
  transferable: true,
  holder,
  originalHolder: holder,
  effectiveExpiresAt: event.endDate,
  source: 'MAJOR_EVENT_SUBSCRIPTION',
  sourceReference: 'Inscrição subscription-1. Lote: Estudante.',
});
const historyEntries = [
  createAdminTicketHistoryEntry({ ticketId: ticket.id, operation: 'ISSUED', newHolder: holder, actorName: 'Equipe de eventos', reason: 'Incluso no lote Estudante.' }),
  createAdminTicketHistoryEntry({ ticketId: ticket.id, id: 'history-transfer', operation: 'TRANSFERRED', previousHolder: holder, newHolder: createTicketPersonSummary({ personId: 'person-2', fullName: 'Grace Hopper' }), reason: 'Transferência confirmada.' }),
  createAdminTicketHistoryEntry({ ticketId: ticket.id, id: 'history-consumed', operation: 'CONSUMED', previousHolder: holder, newHolder: holder, reason: 'Leitura confirmada no acesso.' }),
  createAdminTicketHistoryEntry({ ticketId: ticket.id, id: 'history-revoked', operation: 'REVOKED', previousHolder: holder, newHolder: null, reason: 'Solicitação do titular.' }),
];
const transfer = createTicketTransfer({
  id: 'transfer-1',
  ticket,
  event: eventSummary,
  sender: holder,
  recipient: null,
  initiatedByAdmin: true,
  initiatingAdmin: { personId: 'admin-1', firstName: 'Equipe', avatarUrl: null },
  canCancel: false,
});

const meta: Meta<TicketAdminStoryArgs> = {
  component: TicketAdminPageComponent,
  title: 'CACiC Eventos/Workspace/Tickets/Event Ticket Admin',
  tags: ['autodocs', 'ticketing'],
  args: {
    configExists: true,
    ticketsCount: 3,
    readOnly: false,
    scope: 'major-event',
    apiState: 'ready',
    enabled: true,
    purchaseEnabled: true,
    eligibilityProfile: 'unesp-student',
    priceModel: 'PER_TIER',
    expirationMode: 'EVENT_END',
  },
  argTypes: {
    configExists: { control: 'boolean' },
    ticketsCount: { control: { type: 'range', min: 0, max: 40, step: 1 } },
    readOnly: { control: 'boolean' },
    scope: { control: 'inline-radio', options: ['standalone', 'group-event', 'major-event', 'major-overview'] },
    apiState: { control: 'select', options: ['ready', 'loading', 'load-error', 'holders-error', 'save-error'] },
    enabled: { control: 'boolean' },
    purchaseEnabled: { control: 'boolean' },
    eligibilityProfile: { control: 'select', options: ['open', 'unesp-student', 'ra-prefix'] },
    priceModel: { control: 'inline-radio', options: ['SINGLE', 'PER_TIER'] },
    expirationMode: { control: 'inline-radio', options: ['EVENT_END', 'CUSTOM'] },
  },
  decorators: [
    (story, context) =>
      applicationConfig({ providers: createProviders(context.args) })(story, context),
  ],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<TicketAdminStoryArgs>;

export const Playground: Story = {};

export const ConfiguredEvent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Disponibilidade e identificação' })).toBeVisible();
    await expect(canvas.getByText('Compra de bilhetes adicionais')).toBeVisible();
    await expect(canvas.getByText(/não substituem o cartão padrão da Carteira/i)).toBeVisible();
  },
};

export const AdvancedCriteriaAndTierPrices: Story = {
  args: { eligibilityProfile: 'ra-prefix', priceModel: 'PER_TIER', purchaseEnabled: true, expirationMode: 'CUSTOM' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const prefixFields = await canvas.findAllByRole('textbox', { name: 'Prefixos adicionais de RA' });
    await expect(prefixFields).toHaveLength(2);
    for (const field of prefixFields) await expect(field).toHaveValue('2024\n2025');
    await expect(canvas.getByRole('combobox', { name: 'Expirar' })).toHaveTextContent('Em uma data personalizada');
    await expect(canvas.getAllByRole('spinbutton', { name: 'Preço (R$)' })).toHaveLength(2);
    await expect(canvas.getByText('Lotes que incluem este bilhete')).toBeVisible();
  },
};

export const FirstConfiguration: Story = {
  args: { configExists: false, ticketsCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('textbox', { name: 'Nome do bilhete' })).toHaveValue(event.name);
  },
};

export const InvalidConfiguration: Story = {
  args: { configExists: true, expirationMode: 'CUSTOM' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByRole('textbox', { name: 'Nome do bilhete' });
    const expiry = canvas.getByLabelText('Data e hora de expiração');
    await userEvent.clear(name);
    await userEvent.type(name, '   ');
    await expect(canvas.getByRole('button', { name: 'Salvar configuração' })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'Acesso ao laboratório');
    await userEvent.clear(expiry);
    await expect(canvas.getByRole('button', { name: 'Salvar configuração' })).toBeDisabled();
  },
};

export const DisabledConfiguration: Story = {
  args: { enabled: false, purchaseEnabled: true, ticketsCount: 2 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Desativado')).toBeVisible();
    await expect(within(canvasElement).getByText('Ative a emissão de bilhetes para disponibilizar esta compra adicional.')).toBeVisible();
  },
};

export const StandaloneEvent: Story = {
  args: { scope: 'standalone', purchaseEnabled: false },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('heading', { name: 'Transferência de titularidade' })).toBeVisible();
    await expect(within(canvasElement).queryByText('Compra de bilhetes adicionais')).toBeNull();
  },
};

export const EventInsideGroup: Story = {
  args: { scope: 'group-event', purchaseEnabled: false },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('textbox', { name: 'Nome do bilhete' })).toHaveValue('Jantar de integração');
  },
};

export const MajorEventOverview: Story = {
  args: { scope: 'major-overview' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Eventos com bilhetes configurados' })).toBeVisible();
    await expect(canvas.getByText('Semana da Computação')).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Gerenciar/ })).toBeVisible();
  },
};

export const IssuedTickets: Story = {
  args: { ticketsCount: 5 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Bilhetes emitidos' }));
    await expect(await canvas.findByText('Ada Lovelace')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Emitir bilhete' })).toBeVisible();
    expect(canvas.getAllByRole('button', { name: 'Histórico' }).length).toBeGreaterThan(0);
  },
};

export const NoIssuedTickets: Story = {
  args: { ticketsCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Bilhetes emitidos' }));
    await expect(await canvas.findByText('Nenhum bilhete corresponde à busca e à situação selecionadas.')).toBeVisible();
  },
};

export const HolderListError: Story = {
  args: { apiState: 'holders-error', ticketsCount: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: 'Bilhetes emitidos' }));
    await expect(await canvas.findByText('Não foi possível carregar os bilhetes.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  },
};

export const Loading: Story = { args: { apiState: 'loading' } };

export const LoadError: Story = {
  args: { apiState: 'load-error' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível carregar os bilhetes', { exact: true })).toBeVisible();
  },
};

export const SaveFailure: Story = {
  args: { configExists: false, apiState: 'save-error' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByRole('textbox', { name: 'Nome do bilhete' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Acesso à cerimônia');
    await userEvent.click(canvas.getByRole('button', { name: 'Salvar configuração' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Não foi possível salvar a configuração dos bilhetes.');
  },
};

export const ReadOnly: Story = {
  args: { readOnly: true, ticketsCount: 2 },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const MobileConfiguration: Story = {
  args: { configExists: true, ticketsCount: 2 },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

function createProviders(args: TicketAdminStoryArgs) {
  const hasMajorEvent = args.scope === 'major-event' || args.scope === 'major-overview';
  const eventForRoute: Event = createAdminEvent({
    ...event,
    eventGroupId: args.scope === 'group-event' ? 'group-1' : null,
    majorEventId: args.scope === 'major-event' ? majorEvent.id : null,
    majorEvent: args.scope === 'major-event' ? majorEvent : null,
  });
  const scopedEventSummary = createTicketEventSummary({
    ...eventSummary,
    startsAt: eventForRoute.startDate,
    endsAt: eventForRoute.endDate,
  });
  const recipientPolicy = args.eligibilityProfile === 'open'
    ? config.recipientPolicy
    : {
        ...config.recipientPolicy,
        subscriptionRequirement: 'REQUIRED' as const,
        requiresUnesp: args.eligibilityProfile === 'unesp-student',
        requiredAcademicIdPrefixes: args.eligibilityProfile === 'ra-prefix' ? ['2024', '2025'] : [],
        requiredCourseCodes: args.eligibilityProfile === 'unesp-student' ? ['12'] : [],
        allowedPriceTierIds: hasMajorEvent ? ['tier-student'] : [],
      };
  const priceOptions = !hasMajorEvent || !args.purchaseEnabled
    ? []
    : args.priceModel === 'PER_TIER'
      ? [
          { id: 'price-student', priceTierId: 'tier-student', label: 'Estudante', amountCents: 8_000 },
          { id: 'price-guest', priceTierId: 'tier-guest', label: 'Visitante', amountCents: 16_000 },
        ]
      : [{ id: 'price-single', priceTierId: null, label: 'Preço único', amountCents: 8_000 }];
  const storyConfig = createAdminTicketConfig({
    ...config,
    event: scopedEventSummary,
    majorEventId: hasMajorEvent ? majorEvent.id : null,
    enabled: args.enabled,
    issueOnMajorEventSubscription: hasMajorEvent,
    includedPriceTierIds: hasMajorEvent ? ['tier-student'] : [],
    recipientPolicy,
    purchaseEnabled: args.purchaseEnabled && hasMajorEvent,
    purchaseVisibility: {
      ...config.purchaseVisibility,
      requiredAcademicIdPrefixes: args.eligibilityProfile === 'ra-prefix' ? ['2024', '2025'] : [],
      requiresUnesp: args.eligibilityProfile === 'unesp-student',
      requiredCourseCodes: args.eligibilityProfile === 'unesp-student' ? ['12'] : [],
      allowedPriceTierIds: hasMajorEvent ? ['tier-student', 'tier-guest'] : [],
    },
    priceOptions,
    expirationMode: args.expirationMode,
    customExpiresAt: args.expirationMode === 'CUSTOM' ? adminFixtureDateFromNow(9, 22) : null,
  });
  const ticketFixture = createAdminEventTicket({
    ...ticket,
    eventId: event.id,
    event: scopedEventSummary,
    effectiveExpiresAt: args.expirationMode === 'CUSTOM' ? storyConfig.customExpiresAt ?? event.endDate : event.endDate,
  });
  const statuses = ['ACTIVE', 'CONSUMED', 'REVOKED', 'EXPIRED'] as const;
  const tickets = Array.from({ length: args.ticketsCount }, (_, index) => createAdminEventTicket({
    ...ticketFixture,
    id: `018f47a1-3d5b-7abc-8def-${String(index + 1).padStart(12, '0')}`,
    holder: createTicketPersonSummary({ personId: `person-${index + 1}`, fullName: index === 0 ? 'Ada Lovelace' : `Participante ${index + 1}` }),
    status: statuses[index % statuses.length],
  }));
  const routeParams = args.scope === 'major-overview' ? { majorEventId: majorEvent.id } : { eventId: event.id };
  const apiState = args.apiState;
  const configForStory = args.configExists ? storyConfig : null;
  const api = {
    getConfigs: () => apiState === 'loading' ? NEVER : apiState === 'load-error'
      ? throwError(() => new Error('Não foi possível carregar os bilhetes deste contexto.'))
      : of(configForStory ? [configForStory] : []),
    saveConfig: () => apiState === 'save-error'
      ? throwError(() => new Error('Não foi possível salvar a configuração dos bilhetes.'))
      : of(storyConfig),
    getEligibilityWarnings: () => of({ eligible: true, warnings: [] }),
    getEventTickets: () => apiState === 'holders-error'
      ? throwError(() => new Error('Não foi possível carregar os bilhetes.'))
      : of({ tickets, nextCursor: null, totalCount: tickets.length }),
    issueTicket: () => of(ticketFixture),
    revokeTicket: () => of({ ...ticketFixture, status: 'REVOKED' as const }),
    startTransfer: () => of(transfer),
    getHistory: () => of(historyEntries),
  } satisfies Partial<TicketAdminApiService>;
  const dialog = { open: () => ({ afterClosed: () => of(undefined) }) };
  const permissions = new Set<string>([
    Permission.TicketConfig.Create,
    Permission.TicketConfig.Read,
    Permission.TicketConfig.Update,
    Permission.Ticket.Read,
    Permission.Ticket.Issue,
    Permission.Ticket.Revoke,
    Permission.TicketTransfer.Manage,
    Permission.TicketTransfer.Read,
    Permission.RelatedPerson.Read,
  ]);
  return [
    provideRouter([]),
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(routeParams) }, paramMap: of(convertToParamMap(routeParams)) } },
    { provide: EventApiService, useValue: { getEvent: () => of(eventForRoute) } },
    { provide: MajorEventApiService, useValue: { getMajorEvent: () => of(majorEvent) } },
    { provide: TicketAdminApiService, useValue: api },
    { provide: RealtimeApiService, useValue: { watchEventTickets: () => EMPTY } },
    { provide: PermissionsService, useValue: { has: (permission: string) => !args.readOnly && permissions.has(permission), hasAny: (requested: string[]) => !args.readOnly && requested.some((permission) => permissions.has(permission)) } },
    { provide: AdminFeedbackService, useValue: { showErrorMessage: () => undefined } },
    { provide: MatSnackBar, useValue: { open: () => ({ onAction: () => of(undefined) }) } },
    { provide: MatDialog, useValue: dialog },
  ];
}
