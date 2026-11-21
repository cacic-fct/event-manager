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
      decide: vi.fn().mockResolvedValue({}),
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
      await component.review(command);
    }
    expect(open).not.toHaveBeenCalled();
  });
});
