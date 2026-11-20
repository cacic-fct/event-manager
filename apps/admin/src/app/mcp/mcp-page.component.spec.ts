import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import type { McpAdminDelegation, McpAdminProposal } from '@cacic-fct/event-manager-mcp-contracts';
import { of, Subject } from 'rxjs';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { McpApi } from './mcp-api.service';
import { McpPageComponent } from './mcp-page.component';

function proposal(): McpAdminProposal {
  const now = new Date().toISOString();
  return {
    id: 'proposal',
    delegationId: 'access',
    eventId: 'event',
    eventName: 'Oficina',
    clientId: 'client',
    createdAt: now,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    status: 'PENDING',
    descriptionBefore: 'Antes',
    descriptionAfter: '<script>texto</script>',
    baseUpdatedAt: now,
    currentUpdatedAt: now,
    currentDescription: 'Antes',
    publicationState: 'Rascunho',
    approvalEffects: 'Altera o rascunho.',
    canApprove: true,
    unavailableReason: null,
    approvedByName: null,
    decidedAt: null,
  };
}

describe('McpPageComponent', () => {
  async function setup(item = proposal(), events = new Subject<void>()) {
    const api = {
      settings: vi
        .fn()
        .mockResolvedValue({
          enabled: true,
          proposalsEnabled: true,
          resourceUrl: '/mcp',
          clients: [{ id: 'client', name: 'Aplicativo' }],
        }),
      delegations: vi.fn().mockResolvedValue([]),
      proposals: vi.fn().mockResolvedValue({ items: [item], hasMore: false }),
      decide: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({}),
      revoke: vi.fn().mockResolvedValue(undefined),
    };
    const open = vi.fn().mockReturnValue({ afterClosed: () => of(true) });
    TestBed.configureTestingModule({
      imports: [McpPageComponent],
      providers: [
        provideRouter([]),
        { provide: RealtimeApiService, useValue: { watchMcpReviews: () => events } },
        { provide: McpApi, useValue: api },
        { provide: MatDialog, useValue: { open } },
        {
          provide: EventApiService,
          useValue: { getEvent: vi.fn().mockReturnValue(of({ id: 'event', name: 'Oficina' })) },
        },
      ],
    });
    const fixture = TestBed.createComponent(McpPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.settings()).not.toBeNull());
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, api, open, events };
  }

  it('escapes proposal text and confirms the immutable revision before approval, then refreshes', async () => {
    const item = proposal();
    const { fixture, component, api, open } = await setup(item);
    expect(fixture.nativeElement.querySelector('app-review-text-comparison').textContent).toContain(
      '<script>texto</script>',
    );
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    await component.decide(item, 'APPROVE');
    expect(open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          confirmLabel: 'Aprovar proposta',
          message: expect.stringContaining('exatamente'),
        }),
      }),
    );
    expect(api.decide).toHaveBeenCalledWith('proposal', { decision: 'APPROVE', expectedUpdatedAt: item.baseUpdatedAt });
    expect(api.proposals).toHaveBeenCalledTimes(2);
  });

  it('does not mutate or refresh after cancelling approval', async () => {
    const { component, api, open } = await setup();
    open.mockReturnValue({ afterClosed: () => of(false) });
    await component.decide(component.result().items[0], 'APPROVE');
    expect(api.decide).not.toHaveBeenCalled();
    expect(api.proposals).toHaveBeenCalledTimes(1);
    expect(component.busy()).toBe(false);
  });

  it('confirms rejection and sends the same stored revision', async () => {
    const { component, api } = await setup();
    const item = component.result().items[0];
    await component.decide(item, 'REJECT');
    expect(api.decide).toHaveBeenCalledWith(item.id, { decision: 'REJECT', expectedUpdatedAt: item.baseUpdatedAt });
    expect(component.feedback()).toBe('Proposta rejeitada.');
  });

  it('shows the current description and blocks stale or denied approvals', async () => {
    const item = {
      ...proposal(),
      canApprove: false,
      currentUpdatedAt: new Date(Date.now() + 1000).toISOString(),
      currentDescription: 'Texto atual',
      unavailableReason: 'O evento está congelado.',
    };
    const { fixture, component, api, open } = await setup(item);
    expect(fixture.nativeElement.textContent).toContain('Texto atual');
    expect(fixture.nativeElement.textContent).toContain('O evento está congelado.');
    await component.decide(item, 'APPROVE');
    expect(open).not.toHaveBeenCalled();
    expect(api.decide).not.toHaveBeenCalled();
  });

  it('retains the proposal and exposes server denial without optimistic removal', async () => {
    const { component, api } = await setup();
    const item = component.result().items[0];
    api.decide.mockRejectedValue(new Error('A autorização expirou.'));
    await component.decide(item, 'APPROVE');
    expect(component.result().items).toEqual([item]);
    expect(component.actionError()).toBe('A autorização expirou.');
    expect(component.busy()).toBe(false);
    expect(api.proposals).toHaveBeenCalledTimes(1);
  });

  it('creates only a bounded delegation for an allowed client and selected events', async () => {
    const { component, api } = await setup();
    component.form.setValue({ clientId: 'client', capabilities: ['EVENT_READ'], hours: 2, maxProposals: 4 });
    await component.createDelegation();
    expect(api.create).not.toHaveBeenCalled();
    component.selectedEvents.set([{ id: 'event', name: 'Oficina' }]);
    await component.createDelegation();
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client',
        eventIds: ['event'],
        capabilities: ['EVENT_READ'],
        maxProposals: 4,
      }),
    );
    const expiresAt = api.create.mock.calls[0][0].expiresAt;
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(7200000);
    expect(component.selectedEvents()).toEqual([]);
  });

  it('blocks limits and preserves delegation fields when creation fails', async () => {
    const { component, api } = await setup();
    component.selectedEvents.set([{ id: 'event', name: 'Oficina' }]);
    component.form.setValue({ clientId: 'client', capabilities: ['EVENT_READ'], hours: 25, maxProposals: 21 });
    await component.createDelegation();
    expect(api.create).not.toHaveBeenCalled();
    component.form.patchValue({ hours: 1, maxProposals: 2 });
    api.create.mockRejectedValue(new Error('Sem permissão para este evento.'));
    await component.createDelegation();
    expect(component.selectedEvents()).toHaveLength(1);
    expect(component.actionError()).toBe('Sem permissão para este evento.');
  });

  it('confirms revocation and refreshes its consequences only after success', async () => {
    const { component, api, open } = await setup();
    const access: McpAdminDelegation = {
      id: 'access',
      clientId: 'client',
      eventIds: ['event'],
      events: [{ id: 'event', name: 'Oficina' }],
      capabilities: ['EVENT_READ'],
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      maxProposals: 2,
      createdAt: new Date().toISOString(),
      revokedAt: null,
      proposalCount: 0,
    };
    open.mockReturnValueOnce({ afterClosed: () => of(false) });
    await component.revoke(access);
    expect(api.revoke).not.toHaveBeenCalled();
    await component.revoke(access);
    expect(api.revoke).toHaveBeenCalledWith('access');
    expect(api.delegations).toHaveBeenCalledTimes(2);
  });

  it('coalesces live invalidations and displays a new proposal from another own-user client session', async () => {
    const { component, api, events, fixture } = await setup();
    const added = { ...proposal(), id: 'new-proposal', eventName: 'Nova oficina' };
    api.proposals.mockResolvedValue({ items: [added, component.result().items[0]], hasMore: false });
    vi.useFakeTimers();
    try {
      events.next();
      events.next();
      events.next();
      await vi.advanceTimersByTimeAsync(250);
      expect(api.proposals).toHaveBeenCalledTimes(2);
      expect(component.result().items[0]).toEqual(added);
      expect(component.loading()).toBe(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Nova oficina');
      fixture.destroy();
      expect(events.observed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('defers invalidation during confirmation, then refreshes after cancellation', async () => {
    const { component, api, open, events } = await setup();
    const displayed = component.result().items[0];
    const confirmation = new Subject<boolean>();
    open.mockReturnValue({ afterClosed: () => confirmation });
    const deciding = component.decide(displayed, 'APPROVE');
    vi.useFakeTimers();
    try {
      api.proposals.mockResolvedValue({ items: [], hasMore: false });
      events.next();
      await vi.advanceTimersByTimeAsync(250);
      expect(api.proposals).toHaveBeenCalledTimes(1);
      expect(component.result().items).toEqual([displayed]);
      confirmation.next(false);
      await deciding;
      await vi.advanceTimersByTimeAsync(0);
      expect(api.decide).not.toHaveBeenCalled();
      expect(api.proposals).toHaveBeenCalledTimes(2);
      expect(component.result().items).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the displayed revision while a decision runs and refreshes after committing', async () => {
    const { component, api, events } = await setup();
    const displayed = component.result().items[0];
    let finishDecision!: () => void;
    api.decide.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishDecision = resolve;
        }),
    );
    const deciding = component.decide(displayed, 'APPROVE');
    vi.useFakeTimers();
    try {
      await vi.advanceTimersByTimeAsync(0);
      events.next();
      await vi.advanceTimersByTimeAsync(250);
      expect(component.result().items).toEqual([displayed]);
      expect(api.proposals).toHaveBeenCalledTimes(1);
      api.proposals.mockResolvedValue({ items: [], hasMore: false });
      finishDecision();
      await deciding;
      expect(api.decide).toHaveBeenCalledWith(displayed.id, {
        decision: 'APPROVE',
        expectedUpdatedAt: displayed.baseUpdatedAt,
      });
      expect(api.proposals).toHaveBeenCalledTimes(2);
      expect(component.result().items).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not replace displayed content when an earlier live fetch finishes inside a confirmation', async () => {
    const { component, api, open, events } = await setup();
    const displayed = component.result().items[0];
    let finishRefresh!: (page: { items: McpAdminProposal[]; hasMore: boolean }) => void;
    api.proposals.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const confirmation = new Subject<boolean>();
    open.mockReturnValue({ afterClosed: () => confirmation });
    vi.useFakeTimers();
    try {
      events.next();
      await vi.advanceTimersByTimeAsync(250);
      const deciding = component.decide(displayed, 'APPROVE');
      finishRefresh({ items: [], hasMore: false });
      await vi.advanceTimersByTimeAsync(0);
      expect(component.result().items).toEqual([displayed]);
      expect(api.proposals).toHaveBeenCalledTimes(2);
      confirmation.next(false);
      await deciding;
      await vi.advanceTimersByTimeAsync(0);
      expect(api.proposals).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retains invalidations arriving during an existing refresh', async () => {
    const { component, api, events } = await setup();
    let finishRefresh!: (page: { items: McpAdminProposal[]; hasMore: boolean }) => void;
    api.proposals.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
    api.proposals.mockResolvedValue({ items: [], hasMore: false });
    vi.useFakeTimers();
    try {
      events.next();
      await vi.advanceTimersByTimeAsync(250);
      events.next();
      await vi.advanceTimersByTimeAsync(250);
      expect(api.proposals).toHaveBeenCalledTimes(2);
      finishRefresh({ items: component.result().items, hasMore: false });
      await vi.advanceTimersByTimeAsync(0);
      expect(api.proposals).toHaveBeenCalledTimes(3);
      expect(component.result().items).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
