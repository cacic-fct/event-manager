import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Routes, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { FormsPageComponent } from './forms-page.component';
import { formsUnsavedChangesGuard } from './forms-unsaved-changes.guard';
import { FormsService } from './forms.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { EventWorkspaceContextService } from '../event-workspace/event-workspace-context.service';

@Component({
  selector: 'app-forms-guard-test-destination',
  template: 'Destino',
})
class FormsGuardTestDestinationComponent {}

describe('formsUnsavedChangesGuard', () => {
  let confirmDiscardChanges: ReturnType<typeof vi.fn>;
  let setTargetFilter: ReturnType<typeof vi.fn>;
  let initialize: ReturnType<typeof vi.fn>;
  let closeResultsStream: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    confirmDiscardChanges = vi.fn(() => Promise.resolve(false));
    setTargetFilter = vi.fn(() => Promise.resolve(true));
    initialize = vi.fn(() => Promise.resolve());
    closeResultsStream = vi.fn();
  });

  async function createHarness() {
    const workspace = {
      unsavedChanges: signal(true),
      scopeSwitchBlocked: signal(false),
      confirmDiscardChanges,
      setTargetFilter,
      initialize,
      closeResultsStream,
      cancelPendingSelection: vi.fn(),
      currentScopeRoute: vi.fn(() => ['/forms', 'event', 'event-old']),
      selectedForm: signal({ id: 'selected-form' }),
      targetFilter: signal({ eventId: 'event-old' }),
      selectFormById: vi.fn(async () => true),
      createForm: vi.fn(async () => undefined),
    };
    const routes: Routes = [
      {
        path: 'forms/event/:eventId',
        component: FormsPageComponent,
        canDeactivate: [formsUnsavedChangesGuard],
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
      },
      {
        path: 'forms/:formId', component: FormsPageComponent,
        canDeactivate: [formsUnsavedChangesGuard], runGuardsAndResolvers: 'paramsOrQueryParamsChange',
      },
      { path: 'destination', component: FormsGuardTestDestinationComponent },
    ];

    await TestBed.configureTestingModule({
      imports: [FormsPageComponent, FormsGuardTestDestinationComponent],
      providers: [
        provideRouter(routes),
        { provide: FormsService, useValue: workspace },
        { provide: PermissionsService, useValue: {} },
        { provide: AuditLogService, useValue: {} },
        { provide: EventWorkspaceContextService, useValue: { scopeSwitchBlocked: workspace.scopeSwitchBlocked } },
      ],
    })
      .overrideComponent(FormsPageComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/forms/event/event-old');
    return { harness, workspace };
  }

  it('keeps the current URL and draft when leaving is cancelled', async () => {
    const { workspace } = await createHarness();
    const router = TestBed.inject(Router);

    expect(workspace.scopeSwitchBlocked()).toBe(true);

    await router.navigateByUrl('/forms/event/event-new?view=editor');

    expect(router.url).toBe('/forms/event/event-old');
    expect(confirmDiscardChanges).toHaveBeenCalledOnce();
    expect(workspace.setTargetFilter).toHaveBeenCalledWith({ eventId: 'event-old' });
    expect(workspace.scopeSwitchBlocked()).toBe(true);
  });

  it('keeps edits when selection finishes synchronizing the same form bookmark', async () => {
    const { harness, workspace } = await createHarness();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/forms/selected-form?eventId=event-old');
    await harness.fixture.whenStable();
    expect(router.url).toBe('/forms/selected-form?eventId=event-old');
    expect(confirmDiscardChanges).not.toHaveBeenCalled();
    expect(workspace.unsavedChanges()).toBe(true);
  });

  it('discards before allowing a same-route scope or query navigation', async () => {
    const { harness, workspace } = await createHarness();
    confirmDiscardChanges.mockImplementationOnce(async () => {
      workspace.unsavedChanges.set(false);
      return true;
    });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/forms/event/event-new?view=editor');
    await harness.fixture.whenStable();

    expect(router.url).toBe('/forms/event/event-new?view=editor');
    expect(confirmDiscardChanges).toHaveBeenCalledOnce();
    expect(setTargetFilter).toHaveBeenCalledWith({ eventId: 'event-new' });
    expect(workspace.scopeSwitchBlocked()).toBe(false);
  });
});
