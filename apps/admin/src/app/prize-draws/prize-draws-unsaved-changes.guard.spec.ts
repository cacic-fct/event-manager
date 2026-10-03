import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PrizeDrawWorkspaceService } from './prize-draw-workspace.service';
import { prizeDrawsUnsavedChangesGuard } from './prize-draws-unsaved-changes.guard';

const workspace = { unsavedChanges: signal(false), selected: signal({ id: 'draw-1' }), scopeFilter: signal({ eventId: 'event-1' }) };

@Component({ template: 'Editor', providers: [{ provide: PrizeDrawWorkspaceService, useValue: workspace }] })
class DrawGuardDestination {
  readonly workspace = inject(PrizeDrawWorkspaceService);
}

describe('prizeDrawsUnsavedChangesGuard', () => {
  it('cancels same-route and global navigation until changes are saved or discarded', async () => {
    workspace.unsavedChanges.set(false);
    const snackbar = { open: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      provideRouter([
        { path: 'draws/:drawId', component: DrawGuardDestination, canDeactivate: [prizeDrawsUnsavedChangesGuard], runGuardsAndResolvers: 'paramsOrQueryParamsChange' },
        { path: 'people', component: DrawGuardDestination },
      ]),
      { provide: PrizeDrawWorkspaceService, useValue: { unsavedChanges: signal(false) } },
      { provide: MatSnackBar, useValue: snackbar },
    ] });
    await RouterTestingHarness.create('/draws/draw-1?eventId=event-1');
    const router = TestBed.inject(Router);
    workspace.unsavedChanges.set(true);
    for (const destination of ['/draws/draw-2?eventId=event-1', '/draws/draw-1?eventId=event-2', '/people']) {
      expect(await router.navigateByUrl(destination)).toBe(false);
      expect(router.url).toBe('/draws/draw-1?eventId=event-1');
    }
    expect(snackbar.open).toHaveBeenCalledTimes(3);
    workspace.unsavedChanges.set(false);
    expect(await router.navigateByUrl('/people')).toBe(true);
  });
});
