import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of, Subject } from 'rxjs';
import { RealtimeApiService } from '../../graphql/realtime-api.service';
import { AdminOperationsApi } from './admin-operations-api.service';
import { AdminOperationsPageComponent } from './admin-operations-page.component';
import { operationSettings, sportsCommand, sportsOperation } from './admin-operations.fixtures';

describe('AdminOperationsPageComponent', () => {
  async function setup() {
    const events = new Subject<void>();
    const api = {
      settings: vi.fn().mockResolvedValue(operationSettings),
      catalog: vi.fn().mockResolvedValue([sportsOperation]),
      delegations: vi.fn().mockResolvedValue([]),
      proposals: vi.fn().mockResolvedValue({ items: [sportsCommand()], hasMore: false }),
      create: vi.fn().mockResolvedValue({}),
      review: vi.fn().mockImplementation(async (id, input) => ({
        ...input,
        proposalId: id,
        operation: sportsOperation.field,
        effects: 'Efeito validado',
        token: `token-${id}`,
      })),
      decide: vi.fn().mockResolvedValue({ success: true, state: 'APPLIED' }),
      revoke: vi.fn(),
    };
    const open = vi.fn().mockReturnValue({ afterClosed: () => of(false) });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdminOperationsApi, useValue: api },
        { provide: MatDialog, useValue: { open } },
        { provide: RealtimeApiService, useValue: { watchMcpReviews: () => events } },
      ],
    });
    const fixture = TestBed.createComponent(AdminOperationsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture, api, events, open };
  }
  it('requires explicit broad consent and preserves exact operation selection', async () => {
    const { component, api } = await setup();
    component.form.patchValue({ clientId: 'demo-client', scopeMode: 'ALL_AUTHORIZED' });
    component.toggleOperation(sportsOperation.field, true);
    await component.createDelegation();
    expect(api.create).not.toHaveBeenCalled();
    component.form.controls.broadConsent.setValue(true);
    await component.createDelegation();
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { mode: 'ALL_AUTHORIZED' },
        operations: [sportsOperation.field],
        personalData: false,
      }),
    );
  });
  it('defers refresh while editing or confirming and drains it when idle', async () => {
    const { component, api } = await setup();
    component.toggleCreation(true);
    const calls = api.proposals.mock.calls.length;
    await component.load();
    expect(api.proposals).toHaveBeenCalledTimes(calls);
    component.toggleCreation(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(api.proposals).toHaveBeenCalledTimes(calls + 1);
    component.busy.set(true);
    await component.load();
    expect(api.proposals).toHaveBeenCalledTimes(calls + 1);
  });
  it('filters domain labels and operation descriptions without losing the selected operations', async () => {
    const { component } = await setup();
    component.catalog.set([
      { ...sportsOperation, domain: 'sports' },
      {
        ...sportsOperation,
        field: 'readAccounts',
        domain: 'users',
        label: 'Consultar contas',
        description: 'Lista as contas disponíveis.',
      },
    ]);
    component.toggleOperation(sportsOperation.field, true);
    component.search.setValue('esportes');
    expect(component.groups().map((group) => group.domain)).toEqual(['sports']);
    component.search.setValue('disponiveis');
    expect(component.groups().map((group) => group.domain)).toEqual(['users']);
    expect(component.selected()).toEqual([sportsOperation.field]);
  });

  it('excludes global operations from resource grants and domain selection, then clears them when narrowing scope', async () => {
    const { component } = await setup();
    const globalOperation = { ...sportsOperation, field: 'readAccounts', requiresAllAuthorized: true };
    component.catalog.set([sportsOperation, globalOperation]);
    component.toggleDomain(component.catalog(), true);
    expect(component.selected()).toEqual([sportsOperation.field]);
    component.form.controls.scopeMode.setValue('ALL_AUTHORIZED');
    component.toggleDomain(component.catalog(), true);
    expect(component.selected()).toContain(globalOperation.field);
    component.form.controls.scopeMode.setValue('RESOURCE');
    expect(component.selected()).toEqual([sportsOperation.field]);
    expect(component.feedback()).toContain('removidas');
  });

  it('holds SSE invalidation until the delegation editor closes', async () => {
    const { component, api, events } = await setup();
    component.toggleCreation(true);
    const calls = api.proposals.mock.calls.length;
    events.next();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(api.proposals).toHaveBeenCalledTimes(calls);
    component.toggleCreation(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(api.proposals).toHaveBeenCalledTimes(calls + 1);
  });
  it('blocks denied, expired, executing and uncertain operations', async () => {
    const { component, open } = await setup();
    for (const command of [
      { ...sportsCommand(), canApprove: false },
      { ...sportsCommand(), expiresAt: new Date(Date.now() - 1000).toISOString() },
      { ...sportsCommand(), state: 'APPLYING' as const },
      { ...sportsCommand(), state: 'UNCERTAIN' as const },
    ]) {
      component.toggleCommand(command, true);
      expect(component.selectedCommands()).toEqual([]);
    }
    expect(open).not.toHaveBeenCalled();
  });
  it('reviews optional selections inline and executes only the signed normalized arguments', async () => {
    const { component, fixture, api, open } = await setup();
    const command = component.result().items[0];
    component.toggleCommand(command, true);
    const notes = component.drafts()[command.id].find((field) => field.key === 'notes');
    if (!notes) throw new Error('Missing notes');
    component.includeArgument({ field: notes, included: false });
    api.review.mockImplementationOnce(async (id, input) => ({
      ...input,
      proposalId: id,
      arguments: { matchId: 'partida-demo', score: 4 },
      operation: command.operation,
      effects: 'Efeito validado',
      token: 'normalized-token',
    }));
    await component.prepareSelected();
    fixture.detectChanges();
    expect(api.review.mock.calls[0][1].arguments).not.toHaveProperty('notes');
    expect(api.decide).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[aria-label="Confirmação final"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Validado para execução');
    expect(fixture.nativeElement.textContent).toContain('Efeito validado');
    const review = component.previews()[command.id];
    await component.approveSelected();
    expect(api.decide).toHaveBeenCalledWith(command.id, {
      decision: 'APPROVE',
      expectedFingerprint: command.fingerprint,
      review,
    });
    expect(component.selectedCommands()).toEqual([]);
  });
  it('preserves edits and selection when cancelling final confirmation and drains deferred invalidation', async () => {
    const { component, api } = await setup();
    const command = component.result().items[0];
    component.toggleCommand(command, true);
    component.drafts()[command.id][1].value = 7;
    await component.prepareSelected();
    const calls = api.proposals.mock.calls.length;
    await component.load();
    expect(api.proposals).toHaveBeenCalledTimes(calls);
    await component.cancelConfirmation();
    expect(api.proposals).toHaveBeenCalledTimes(calls + 1);
    expect(component.drafts()[command.id][1].value).toBe(7);
    expect(component.selectedCommands()).toEqual([command.id]);
    expect(api.decide).not.toHaveBeenCalled();
  });
  it.each(['UNCERTAIN', 'APPLYING', 'LOST_RESPONSE'])(
    'stops remaining operations after %s and never resends the attempted operation',
    async (state) => {
      const { component, api } = await setup();
      const commands = [sportsCommand(), { ...sportsCommand(), id: 'second' }];
      api.proposals.mockResolvedValue({ items: commands, hasMore: false });
      await component.load();
      component.toggleAllCommands(true);
      await component.prepareSelected();
      if (state === 'LOST_RESPONSE') api.decide.mockRejectedValueOnce(new Error('Resposta perdida'));
      else api.decide.mockResolvedValueOnce({ success: true, state });
      await component.approveSelected();
      expect(api.decide).toHaveBeenCalledTimes(1);
      expect(component.attempted()).toEqual(['demo-command']);
      expect(component.selectedCommands()).toEqual(['second']);
      expect(component.error()).toContain('interrompida');
      component.toggleCommand(commands[0], true);
      expect(component.selectedCommands()).toEqual(['second']);
      await component.approveSelected();
      expect(api.decide).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps successful operations applied when a later operation fails', async () => {
    const { component, api } = await setup();
    api.proposals.mockResolvedValue({
      items: [sportsCommand(), { ...sportsCommand(), id: 'second' }, { ...sportsCommand(), id: 'third' }],
      hasMore: false,
    });
    await component.load();
    component.toggleAllCommands(true);
    await component.prepareSelected();
    api.decide.mockResolvedValueOnce({ state: 'APPLIED', success: true }).mockRejectedValueOnce(new Error('Falhou'));
    await component.approveSelected();
    expect(api.decide).toHaveBeenCalledTimes(2);
    expect(component.error()).toContain('1 operação aplicada');
    expect(component.selectedCommands()).toEqual(['third']);
  });
  it('does not execute any operation if preparation fails and clears drafts on changed fingerprints', async () => {
    const { component, api } = await setup();
    component.toggleAllCommands(true);
    component.drafts()['demo-command'][1].value = 8;
    api.review.mockRejectedValueOnce(new Error('Dados alterados'));
    await component.prepareSelected();
    expect(component.previews()).toEqual({});
    expect(api.decide).not.toHaveBeenCalled();
    api.proposals.mockResolvedValue({ items: [{ ...sportsCommand(), fingerprint: 'new' }], hasMore: false });
    await component.load();
    expect(component.drafts()['demo-command'][1].value).toBe(2);
  });
  it('opens a pencil editor without executing and preserves the draft on cancellation', async () => {
    const { component, open, api } = await setup();
    const command = component.result().items[0];
    const score = component.drafts()[command.id][1];
    open.mockReturnValueOnce({ afterClosed: () => of({ value: 9 }) });
    await component.editArgument(command, score);
    expect(component.drafts()[command.id][1].value).toBe(9);
    open.mockReturnValueOnce({ afterClosed: () => of(undefined) });
    await component.editArgument(command, component.drafts()[command.id][1]);
    expect(component.drafts()[command.id][1].value).toBe(9);
    expect(api.decide).not.toHaveBeenCalled();
  });
});
