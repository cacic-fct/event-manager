import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { FormsPageComponent } from '../forms/forms-page.component';
import { FormsService } from '../forms/forms.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrizeDrawsPageComponent } from '../prize-draws/prize-draws-page.component';
import { PrizeDrawWorkspaceService } from '../prize-draws/prize-draw-workspace.service';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import { createAdminEventForm } from '../testing/admin-entity-fixtures';
import { flushAsync } from '../testing/async-test-helpers';
import { EventWorkspaceContextService } from './event-workspace-context.service';

describe('resource bookmarks', () => {
  const navigate = vi.fn();
  const params = new BehaviorSubject(convertToParamMap({ formId: 'form-1' }));
  const query = new BehaviorSubject(convertToParamMap({}));
  const selectedForm = signal(createAdminEventForm({ id: 'form-1', ownerEventId: 'owner-event' }));
  const forms = { setTargetFilter: vi.fn(async () => true), initialize: vi.fn(async (): Promise<void> => undefined),
    selectFormById: vi.fn(async () => true), selectedForm, closeResultsStream: vi.fn(), unsavedChanges: signal(false),
    cancelPendingSelection: vi.fn(), createForm: vi.fn(async () => undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    params.next(convertToParamMap({ formId: 'form-1' }));
    query.next(convertToParamMap({}));
    selectedForm.set(createAdminEventForm({ id: 'form-1', ownerEventId: 'owner-event' }));
    TestBed.configureTestingModule({ providers: [
      { provide: Router, useValue: { navigate } },
      { provide: ActivatedRoute, useValue: { paramMap: params, queryParamMap: query } },
      { provide: ADMIN_SHELL_CONTEXT, useValue: true },
      { provide: FormsService, useValue: forms },
      { provide: MatDialog, useValue: {} }, { provide: AuditLogService, useValue: {} },
      { provide: PermissionsService, useValue: {} },
      { provide: EventWorkspaceContextService, useValue: { scopeSwitchBlocked: signal(false) } },
    ] }).overrideComponent(FormsPageComponent, { set: { template: '', imports: [] } });
  });

  it('restores a form owner into the URL without adding a browser-history entry', async () => {
    TestBed.createComponent(FormsPageComponent);
    await flushAsync();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { eventId: 'owner-event' }, replaceUrl: true }));
  });

  it('retains an explicitly selected linked context instead of forcing the form owner', async () => {
    query.next(convertToParamMap({ majorEventId: 'linked-major' }));
    TestBed.createComponent(FormsPageComponent);
    await flushAsync();
    expect(forms.setTargetFilter).toHaveBeenCalledWith({ majorEventId: 'linked-major' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not restore a stale form bookmark after the route changes', async () => {
    let release: (() => void) | undefined;
    forms.initialize.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    TestBed.createComponent(FormsPageComponent);
    await flushAsync();
    params.next(convertToParamMap({ eventId: 'new-context' }));
    release?.();
    await flushAsync();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate back after a loading form page is destroyed', async () => {
    let release: (() => void) | undefined;
    forms.initialize.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const fixture = TestBed.createComponent(FormsPageComponent);
    await flushAsync();
    fixture.destroy();
    release?.();
    await flushAsync();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('restores a draw target and retains the saved draw selection', async () => {
    params.next(convertToParamMap({ drawId: 'draw-1' }));
    const selected = signal({ id: 'draw-1', target: { type: 'MAJOR_EVENT', id: 'major-1' } });
    const draws = { setScopeFromRoute: vi.fn(async () => true), initialize: vi.fn(async (): Promise<void> => undefined), selected, unsavedChanges: signal(false) };
    TestBed.overrideComponent(PrizeDrawsPageComponent, { set: { template: '', imports: [], providers: [{ provide: PrizeDrawWorkspaceService, useValue: draws }] } });
    TestBed.createComponent(PrizeDrawsPageComponent);
    await flushAsync();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { majorEventId: 'major-1' }, replaceUrl: true }));
    expect(selected().id).toBe('draw-1');
  });
});
