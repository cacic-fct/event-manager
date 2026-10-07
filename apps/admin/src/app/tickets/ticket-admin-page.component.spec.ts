import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { createAdminEvent, createAdminMajorEvent } from '../testing/admin-entity-fixtures';
import {
  createAdminEventTicket,
  createAdminTicketConfig,
  createTicketEventSummary,
} from '@cacic-fct/shared-ticketing/testing';
import { TicketAdminPageComponent } from './ticket-admin-page.component';
import { TicketAdminApiService } from '../graphql/ticket-admin-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { PermissionsService } from '../permissions/permissions.service';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';

const eventId = 'event-1';
const majorEventId = 'major-event-1';
const eventSummary = createTicketEventSummary({ id: eventId, name: 'Jantar de integração', emoji: '🍽️' });
const event = createAdminEvent({ id: eventId, name: eventSummary.name, emoji: eventSummary.emoji, majorEventId });
const majorEvent = createAdminMajorEvent({
  id: majorEventId,
  name: 'Semana da Computação',
  majorEventPrices: [
    {
      id: 'major-price-1',
      type: 'TIERED',
      tiers: [
        { id: 'tier-student', name: 'Estudante', value: 12_000, includesSportsRegistration: false },
        { id: 'tier-guest', name: 'Visitante', value: 24_000, includesSportsRegistration: false },
      ],
    },
  ],
});
const config = createAdminTicketConfig({ eventId, event: eventSummary, majorEventId });
const activeTicket = createAdminEventTicket({ eventId, event: eventSummary, id: 'ticket-active' });
const defaultPermissions = [
  Permission.TicketConfig.Create,
  Permission.TicketConfig.Read,
  Permission.TicketConfig.Update,
  Permission.Ticket.Read,
  Permission.Ticket.Issue,
  Permission.Ticket.Revoke,
  Permission.TicketTransfer.Manage,
  Permission.TicketTransfer.Read,
  Permission.Person.Read,
];

interface SetupOptions {
  majorScope?: boolean;
  permissions?: readonly string[];
  initialConfig?: typeof config | null;
  tickets?: typeof activeTicket[];
  ticketError?: Error;
  saveError?: Error;
  dialogResult?: unknown;
}

function setup(options: SetupOptions = {}) {
  const params = new BehaviorSubject(convertToParamMap(options.majorScope ? { majorEventId } : { eventId }));
  const changes = new Subject<void>();
  const permissions = new Set(options.permissions ?? defaultPermissions);
  const api = {
    getConfigs: vi.fn().mockReturnValue(of(options.initialConfig ? [options.initialConfig] : [])),
    getEventTickets: vi.fn(() =>
      options.ticketError
        ? throwError(() => options.ticketError)
        : of({ tickets: options.tickets ?? [], totalCount: options.tickets?.length ?? 0, nextCursor: null as string | null }),
    ),
    saveConfig: vi.fn(() =>
      options.saveError ? throwError(() => options.saveError) : of(options.initialConfig ?? config),
    ),
    issueTicket: vi.fn().mockReturnValue(of(activeTicket)),
    revokeTicket: vi.fn().mockReturnValue(of({ ...activeTicket, status: 'REVOKED' as const })),
    startTransfer: vi.fn().mockReturnValue(of({})),
    getEligibilityWarnings: vi.fn().mockReturnValue(of({ eligible: true, warnings: [] })),
    getHistory: vi.fn().mockReturnValue(of([])),
  };
  const events = {
    getEvent: vi.fn((id: string) => of(createAdminEvent({
      ...event,
      id,
      name: id === eventId ? event.name : `Evento ${id}`,
    }))),
  };
  const realtime = { watchEventTickets: vi.fn().mockReturnValue(changes) };
  const dialog = {
    open: vi.fn().mockReturnValue({ afterClosed: () => of(options.dialogResult) }),
  };
  const feedback = { showErrorMessage: vi.fn() };
  const majorEvents = { getMajorEvent: vi.fn(() => of(majorEvent)) };
  TestBed.configureTestingModule({
    imports: [TicketAdminPageComponent],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: params.value }, paramMap: params } },
      { provide: TicketAdminApiService, useValue: api },
      { provide: EventApiService, useValue: events },
      { provide: MajorEventApiService, useValue: majorEvents },
      { provide: RealtimeApiService, useValue: realtime },
      { provide: PermissionsService, useValue: { has: (permission: string) => permissions.has(permission) } },
      { provide: AdminFeedbackService, useValue: feedback },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
      { provide: MatDialog, useValue: dialog },
    ],
  });
  const fixture = TestBed.createComponent(TicketAdminPageComponent);
  return { fixture, api, params, changes, events, realtime, dialog, feedback, majorEvents };
}

async function settle(fixture: ComponentFixture<TicketAdminPageComponent>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.loading-state')).toBeNull();
    expect(fixture.nativeElement.querySelector('.loading-inline')).toBeNull();
  });
  fixture.detectChanges();
}

function getButton(fixture: ComponentFixture<TicketAdminPageComponent>, label: string): HTMLButtonElement | null {
  return [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) =>
    button.textContent?.replace(/\s+/g, ' ').trim().includes(label),
  ) ?? null;
}

async function chooseMatOption(
  fixture: ComponentFixture<TicketAdminPageComponent>,
  select: HTMLElement,
  optionLabel: string,
): Promise<void> {
  select.click();
  fixture.detectChanges();
  await fixture.whenStable();
  const option = [...document.body.querySelectorAll('[role="option"]')].find((candidate) =>
    candidate.textContent?.replace(/\s+/g, ' ').trim() === optionLabel,
  ) as HTMLElement | undefined;
  expect(option).toBeDefined();
  option?.click();
  await settle(fixture);
}

function futureLocalDateTime(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(22, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

describe('TicketAdminPageComponent', () => {
  it('resets pagination when switching event configurations and rejects stale realtime refreshes', async () => {
    const { fixture, api } = setup({ majorScope: true, initialConfig: config });
    await settle(fixture);
    const component = fixture.componentInstance;
    const nextConfig = createAdminTicketConfig({ eventId: 'event-2', majorEventId });
    await Reflect.get(component, 'selectConfig').call(component, config);
    api.getEventTickets.mockReturnValueOnce(of({ tickets: [activeTicket], totalCount: 100, nextCursor: 'event-1-cursor' }));
    await Reflect.get(component, 'resetTicketPage').call(component);
    Reflect.get(component, 'nextTicketPage').call(component);
    await settle(fixture);

    await Reflect.get(component, 'selectConfig').call(component, nextConfig);
    expect(Reflect.get(component, 'cursorHistory')()).toEqual([null]);
    expect(api.getEventTickets).toHaveBeenLastCalledWith(expect.objectContaining({ eventId: 'event-2', cursor: undefined }));
    const reads = api.getEventTickets.mock.calls.length;
    await Reflect.get(component, 'refreshLiveEvent').call(component, eventId);
    Reflect.get(component, 'previousTicketPage').call(component);
    expect(api.getEventTickets.mock.calls.length).toBe(reads);
    fixture.destroy();
  });

  it.each(['save', 'person-action'])('resets pagination after a %s operation reloads the first page', async (operation) => {
    const { fixture, api } = setup({ initialConfig: config, dialogResult: true });
    await settle(fixture);
    const component = fixture.componentInstance;
    api.getEventTickets.mockReturnValueOnce(of({ tickets: [activeTicket], totalCount: 100, nextCursor: 'page-2-cursor' }));
    await Reflect.get(component, 'resetTicketPage').call(component);
    Reflect.get(component, 'nextTicketPage').call(component);
    await settle(fixture);

    if (operation === 'save') {
      const name = fixture.nativeElement.querySelector('input[formControlName="displayName"]') as HTMLInputElement;
      name.value = 'Novo nome';
      name.dispatchEvent(new Event('input'));
      await Reflect.get(component, 'saveConfig').call(component);
      expect(api.saveConfig).toHaveBeenCalledOnce();
    } else {
      await Reflect.get(component, 'openManualIssue').call(component);
    }
    expect(Reflect.get(component, 'cursorHistory')()).toEqual([null]);
    expect(api.getEventTickets).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: undefined }));
    fixture.destroy();
  });

  it('ignores a live config response after switching away and returning to the same event', async () => {
    const { fixture, api } = setup({ majorScope: true, initialConfig: config });
    await settle(fixture);
    const component = fixture.componentInstance;
    await Reflect.get(component, 'selectConfig').call(component, config);
    const delayed = new Subject<typeof config[]>();
    api.getConfigs.mockReturnValueOnce(delayed);
    const previousReads = api.getConfigs.mock.calls.length;
    const refresh = Reflect.get(component, 'refreshLiveEvent').call(component, eventId);
    await vi.waitFor(() => expect(api.getConfigs.mock.calls.length).toBe(previousReads + 1));

    await Reflect.get(component, 'selectConfig').call(component, createAdminTicketConfig({ eventId: 'event-2', majorEventId }));
    const currentConfig = createAdminTicketConfig({ ...config, displayName: 'Configuração atualizada' });
    await Reflect.get(component, 'selectConfig').call(component, currentConfig);
    delayed.next([config]);
    delayed.complete();
    await refresh;
    expect(Reflect.get(component, 'selectedConfig')()).toEqual(currentConfig);
    expect(Reflect.get(component, 'configForm').controls.displayName.value).toBe('Configuração atualizada');
    fixture.destroy();
  });

  it.each(['0', '-1', '0.001'])('rejects prices that cannot produce a positive cent amount: %s', async (price) => {
    const { fixture } = setup();
    await settle(fixture);
    const component = fixture.componentInstance;
    expect(Reflect.get(component, 'priceInCents').call(component, price)).toBeNull();
    const fixedPrice = Reflect.get(component, 'singlePrice');
    fixedPrice.setValue(price);
    expect(fixedPrice.invalid).toBe(true);
    const tier = Reflect.get(component, 'createPriceRow').call(component, majorEvent.majorEventPrices[0].tiers[0], null);
    tier.controls.amount.setValue(price);
    expect(tier.invalid).toBe(true);
  });

  it('refreshes holder state without overwriting unsaved configuration', async () => {
    const { fixture, api, changes } = setup();
    await settle(fixture);
    const name = fixture.nativeElement.querySelector('input[formControlName="displayName"]') as HTMLInputElement;
    expect(name).not.toBeNull();
    name.value = 'Nome ainda não salvo';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(TestBed.inject(WorkspacePendingChangesService).pending()).toBe(true);

    const previousReads = api.getEventTickets.mock.calls.length;
    changes.next();
    await vi.waitFor(() => expect(api.getEventTickets.mock.calls.length).toBeGreaterThan(previousReads));
    await settle(fixture);

    expect(name.value).toBe('Nome ainda não salvo');
    expect(TestBed.inject(WorkspacePendingChangesService).pending()).toBe(true);
    fixture.destroy();
    expect(TestBed.inject(WorkspacePendingChangesService).pending()).toBe(false);
  });

  it('updates event data and realtime scope when the route changes', async () => {
    const { fixture, params, events, realtime } = setup();
    await settle(fixture);
    params.next(convertToParamMap({ eventId: 'event-2' }));
    await settle(fixture);

    expect(events.getEvent).toHaveBeenLastCalledWith('event-2');
    expect(realtime.watchEventTickets).toHaveBeenLastCalledWith('event-2');
    expect(fixture.nativeElement.querySelector('input[formControlName="displayName"]')).not.toBeNull();
    fixture.destroy();
  });

  it('ignores stale config and tier responses after navigation', async () => {
    const { fixture, api, params, majorEvents } = setup({ initialConfig: config });
    const delayed = new Subject<typeof majorEvent>();
    majorEvents.getMajorEvent.mockReturnValueOnce(delayed);
    fixture.detectChanges();
    await vi.waitFor(() => expect(majorEvents.getMajorEvent).toHaveBeenCalledOnce());
    const nextConfig = createAdminTicketConfig({ eventId: 'event-2', displayName: 'Bilhete do segundo evento' });
    api.getConfigs.mockReturnValue(of([nextConfig]));
    params.next(convertToParamMap({ eventId: 'event-2' }));
    await settle(fixture);
    const reads = api.getEventTickets.mock.calls.length;
    delayed.next(createAdminMajorEvent({ ...majorEvent, majorEventPrices: [] }));
    delayed.complete();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('input[formControlName="displayName"]').value).toBe('Bilhete do segundo evento');
    expect(Reflect.get(fixture.componentInstance, 'priceTiers')()).toEqual(majorEvent.majorEventPrices.flatMap((price) => price.tiers));
    expect(api.getEventTickets.mock.calls.length).toBe(reads);
    fixture.destroy();
  });

  it('requires a useful name and a custom expiry before saving', async () => {
    const { fixture, api } = setup();
    await settle(fixture);
    const name = fixture.nativeElement.querySelector('input[formControlName="displayName"]') as HTMLInputElement;
    name.value = '   ';
    name.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(getButton(fixture, 'Salvar configuração')?.disabled).toBe(true);

    name.value = 'Credenciamento especial';
    name.dispatchEvent(new Event('input'));
    const expiryMode = fixture.nativeElement.querySelector('.expiry-settings mat-select') as HTMLElement;
    await chooseMatOption(fixture, expiryMode, 'Em uma data personalizada');
    expect(fixture.nativeElement.querySelector('input[formControlName="customExpiresAt"]')).not.toBeNull();
    expect(getButton(fixture, 'Salvar configuração')?.disabled).toBe(true);

    const expiry = fixture.nativeElement.querySelector('input[formControlName="customExpiresAt"]') as HTMLInputElement;
    expiry.value = futureLocalDateTime(30);
    expiry.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(getButton(fixture, 'Salvar configuração')?.disabled).toBe(false);
    expect(api.saveConfig).not.toHaveBeenCalled();
  });

  it('loads a fixed sales limit, validates integers, and can switch back to unlimited', async () => {
    const limited = createAdminTicketConfig({
      ...config, purchaseEnabled: true, purchaseLimit: 25,
      priceOptions: [{ id: 'price', priceTierId: null, label: 'Preço único', amountCents: 1000 }],
    });
    const { fixture, api } = setup({ initialConfig: limited });
    await settle(fixture);
    const quantity = fixture.nativeElement.querySelector('input[formControlName="purchaseLimit"]') as HTMLInputElement;
    expect(quantity.value).toBe('25');
    for (const invalid of ['', '0', '-1', '1.5']) {
      quantity.value = invalid;
      quantity.dispatchEvent(new Event('input'));
      await settle(fixture);
      expect(getButton(fixture, 'Salvar configuração')?.disabled).toBe(true);
    }
    quantity.value = '30';
    quantity.dispatchEvent(new Event('input'));
    await settle(fixture);
    getButton(fixture, 'Salvar configuração')?.click();
    await vi.waitFor(() => expect(api.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ purchaseLimit: 30 })));
    await settle(fixture);
    const mode = fixture.nativeElement.querySelector('mat-select[formControlName="purchaseUnlimited"]') as HTMLElement;
    await chooseMatOption(fixture, mode, 'Ilimitada');
    expect(fixture.nativeElement.querySelector('input[formControlName="purchaseLimit"]')).toBeNull();
    getButton(fixture, 'Salvar configuração')?.click();
    await vi.waitFor(() => expect(api.saveConfig).toHaveBeenLastCalledWith(expect.objectContaining({ purchaseLimit: null })));
  });

  it('shows save errors and keeps the form available for correction', async () => {
    const { fixture, api, feedback } = setup({ saveError: new Error('Configuração recusada pelo servidor.') });
    await settle(fixture);
    const name = fixture.nativeElement.querySelector('input[formControlName="displayName"]') as HTMLInputElement;
    name.value = 'Acesso ao jantar';
    name.dispatchEvent(new Event('input'));
    await settle(fixture);
    getButton(fixture, 'Salvar configuração')?.click();
    await vi.waitFor(() => expect(api.saveConfig).toHaveBeenCalledOnce());
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Configuração recusada pelo servidor.');
    expect(feedback.showErrorMessage).toHaveBeenCalledWith('Configuração recusada pelo servidor.');
    expect(getButton(fixture, 'Salvar configuração')?.disabled).toBe(false);
  });

  it('hides unauthorized ticket actions and skips unreadable holder lists', async () => {
    const { fixture, api } = setup({
      permissions: [Permission.TicketConfig.Read],
      initialConfig: config,
      tickets: [activeTicket],
    });
    await settle(fixture);
    expect(getButton(fixture, 'Salvar configuração')?.disabled).toBe(true);
    expect(getButton(fixture, 'Emitir bilhete')).toBeNull();
    expect(api.getEventTickets).not.toHaveBeenCalled();

    const tabs = [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLElement[];
    tabs.find((tab) => tab.textContent?.includes('Bilhetes emitidos'))?.click();
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('Você não tem permissão para consultar os bilhetes emitidos.');
  });

  it('loads status and audit controls for each visible holder row', async () => {
    const tickets = [
      activeTicket,
      createAdminEventTicket({ id: 'ticket-used', eventId, event: eventSummary, status: 'CONSUMED' }),
      createAdminEventTicket({ id: 'ticket-revoked', eventId, event: eventSummary, status: 'REVOKED' }),
      createAdminEventTicket({ id: 'ticket-expired', eventId, event: eventSummary, status: 'EXPIRED' }),
    ];
    const { fixture } = setup({ initialConfig: config, tickets });
    await settle(fixture);
    const tabs = [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLElement[];
    tabs.find((tab) => tab.textContent?.includes('Bilhetes emitidos'))?.click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('Marina da Silva');
    expect(fixture.nativeElement.textContent).toContain('•••.982.247-••');
    expect(fixture.nativeElement.textContent).toContain('Ativo');
    expect(fixture.nativeElement.textContent).toContain('Utilizado');
    expect(fixture.nativeElement.textContent).toContain('Revogado');
    expect(fixture.nativeElement.textContent).toContain('Expirado');
    const rows = [...fixture.nativeElement.querySelectorAll('.ticket-row')] as HTMLElement[];
    for (const row of rows) {
      const editable = row.textContent?.includes('Ativo') || row.textContent?.includes('Expirado');
      expect(row.textContent?.includes('Transferir')).toBe(Boolean(editable));
      expect(row.textContent?.includes('Revogar')).toBe(Boolean(editable));
    }
    expect(rows).toHaveLength(4);
  });

  it('shows a holder-list error and offers retry', async () => {
    const { fixture, api } = setup({ initialConfig: config, ticketError: new Error('Fila temporariamente indisponível.') });
    await settle(fixture);
    const tabs = [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLElement[];
    tabs.find((tab) => tab.textContent?.includes('Bilhetes emitidos'))?.click();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('Fila temporariamente indisponível.');
    expect(getButton(fixture, 'Tentar novamente')).not.toBeNull();
    api.getEventTickets.mockReturnValue(of({ tickets: [activeTicket], totalCount: 1, nextCursor: null }));
    const reads = api.getEventTickets.mock.calls.length;
    getButton(fixture, 'Tentar novamente')?.click();
    await settle(fixture);
    expect(api.getEventTickets.mock.calls.length).toBe(reads + 1);
    expect(api.getEventTickets).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: undefined }));
    expect(fixture.nativeElement.textContent).not.toContain('Fila temporariamente indisponível.');
  });

  it('trims the revocation reason and opens the ticket audit trail', async () => {
    const { fixture, api, dialog } = setup({ initialConfig: config, tickets: [activeTicket], dialogResult: '  Solicitação da participante.  ' });
    await settle(fixture);
    const tabs = [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLElement[];
    tabs.find((tab) => tab.textContent?.includes('Bilhetes emitidos'))?.click();
    await settle(fixture);

    getButton(fixture, 'Revogar')?.click();
    await vi.waitFor(() => expect(api.revokeTicket).toHaveBeenCalledOnce());
    expect(api.revokeTicket).toHaveBeenCalledWith({ ticketId: activeTicket.id, reason: 'Solicitação da participante.' });

    getButton(fixture, 'Histórico')?.click();
    await vi.waitFor(() => expect(api.getHistory).toHaveBeenCalledWith(activeTicket.id));
    expect(dialog.open).toHaveBeenCalled();
  });

  it('opens transfer with holder context only for active tickets', async () => {
    const consumed = createAdminEventTicket({ id: 'ticket-consumed', eventId, event: eventSummary, status: 'CONSUMED' });
    const { fixture, dialog } = setup({ initialConfig: config, tickets: [activeTicket, consumed], dialogResult: true });
    await settle(fixture);
    const tabs = [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLElement[];
    tabs.find((tab) => tab.textContent?.includes('Bilhetes emitidos'))?.click();
    await settle(fixture);

    const transferButtons = [...fixture.nativeElement.querySelectorAll('button')].filter((button: HTMLButtonElement) =>
      button.textContent?.includes('Transferir para outra pessoa'),
    );
    expect(transferButtons).toHaveLength(1);
    (transferButtons[0] as HTMLButtonElement).click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(dialog.open.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      data: expect.objectContaining({ action: 'TRANSFER', ticketId: activeTicket.id, holderName: 'Marina da Silva' }),
    }));
  });
});
