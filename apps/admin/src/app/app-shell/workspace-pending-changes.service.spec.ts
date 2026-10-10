import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { WorkspacePendingChangesService } from './workspace-pending-changes.service';

describe('WorkspacePendingChangesService', () => {
  let afterClosedValue: boolean;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let service: WorkspacePendingChangesService;

  beforeEach(() => {
    afterClosedValue = false;
    dialog = {
      open: vi.fn(() => ({ afterClosed: () => of(afterClosedValue) })),
    };
    TestBed.configureTestingModule({
      providers: [
        WorkspacePendingChangesService,
        { provide: MatDialog, useValue: dialog },
      ],
    });
    service = TestBed.inject(WorkspacePendingChangesService);
  });

  it('tracks independent editor registrations', () => {
    const first = service.register();
    const second = service.register();
    first.set(true);
    expect(service.pending()).toBe(true);

    first.destroy();
    expect(service.pending()).toBe(false);

    second.set(true);
    expect(service.pending()).toBe(true);
    second.destroy();
    expect(service.pending()).toBe(false);
  });

  it('cancels navigation when pending edits are retained', async () => {
    const discard = vi.fn();
    const registration = service.register(discard);
    registration.set(true);
    const navigate = vi.fn(() => Promise.resolve(true));

    await expect(service.navigate(navigate)).resolves.toBe(false);

    expect(navigate).not.toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(discard).not.toHaveBeenCalled();
    expect(service.pending()).toBe(true);
  });

  it('bypasses the route guard only during confirmed programmatic navigation', async () => {
    const registration = service.register();
    registration.set(true);
    afterClosedValue = true;

    await expect(service.navigate(async () => {
      await expect(service.canDeactivate()).resolves.toBe(true);
      return true;
    })).resolves.toBe(true);

    registration.set(true);
    afterClosedValue = false;
    await expect(service.canDeactivate()).resolves.toBe(false);
  });

  it('discards only pending editors before programmatic navigation', async () => {
    const discardPending = vi.fn();
    const discardClean = vi.fn();
    service.register(discardPending).set(true);
    service.register(discardClean);
    afterClosedValue = true;

    await service.navigate(async () => {
      expect(discardPending).toHaveBeenCalledOnce();
      expect(service.pending()).toBe(false);
      return true;
    });

    expect(discardClean).not.toHaveBeenCalled();
  });

  it('discards once when the route guards approve leaving an editor', async () => {
    const discard = vi.fn();
    service.register(discard).set(true);
    afterClosedValue = true;

    await expect(service.canDeactivate()).resolves.toBe(true);
    expect(service.canActivate()).toBe(true);
    await expect(service.canDeactivate()).resolves.toBe(true);

    expect(discard).toHaveBeenCalledOnce();
    expect(service.pending()).toBe(false);
    expect(dialog.open).toHaveBeenCalledOnce();
  });

  it('discards when a parameter change reruns the activation guard', async () => {
    const discard = vi.fn();
    service.register(discard).set(true);
    afterClosedValue = true;

    await expect(service.canActivate()).resolves.toBe(true);

    expect(discard).toHaveBeenCalledOnce();
    expect(service.pending()).toBe(false);
  });

  it('reuses a deactivation confirmation for the matching activation phase', async () => {
    const registration = service.register();
    registration.set(true);
    afterClosedValue = true;

    await expect(service.canDeactivate()).resolves.toBe(true);
    expect(service.canActivate()).toBe(true);
    expect(dialog.open).toHaveBeenCalledOnce();
  });
});
