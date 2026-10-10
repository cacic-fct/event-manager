import { Service, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { CanActivateFn, CanDeactivateFn, NavigationCancel, NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { ConfirmationDialogComponent } from './dialogs/confirmation-dialog.component';

export interface WorkspacePendingChangesRegistration {
  set(pending: boolean): void;
  destroy(): void;
}

@Service()
export class WorkspacePendingChangesService {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router, { optional: true });
  private readonly registrations = signal(new Map<symbol, boolean>());
  private bypassRouteGuard = false;
  private routeTransitionApproved = false;

  readonly pending = computed(() => [...this.registrations().values()].some(Boolean));

  constructor() {
    const routerEvents = this.router?.events;
    if (routerEvents) {
      routerEvents
        .pipe(filter((event) => event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError))
        .subscribe(() => {
          this.routeTransitionApproved = false;
        });
    }
  }

  register(): WorkspacePendingChangesRegistration {
    const id = Symbol('workspace-pending-changes');
    this.update(id, false);
    return {
      set: (pending) => this.update(id, pending),
      destroy: () => this.remove(id),
    };
  }

  async navigate(navigate: () => Promise<boolean>): Promise<boolean> {
    if (!(await this.confirmDiscardChanges())) {
      return false;
    }

    this.bypassRouteGuard = true;
    try {
      return await navigate();
    } finally {
      this.bypassRouteGuard = false;
    }
  }

  async canDeactivate(): Promise<boolean> {
    if (this.bypassRouteGuard || this.routeTransitionApproved) {
      return true;
    }
    const confirmed = await this.confirmDiscardChanges();
    this.routeTransitionApproved = confirmed && this.pending();
    return confirmed;
  }

  canActivate(): boolean | Promise<boolean> {
    return this.bypassRouteGuard || this.routeTransitionApproved ? true : this.confirmDiscardChanges();
  }

  private async confirmDiscardChanges(): Promise<boolean> {
    if (!this.pending()) {
      return true;
    }

    return (
      (await firstValueFrom(
        this.dialog
          .open(ConfirmationDialogComponent, {
            data: {
              title: 'Descartar alterações?',
              message: 'Há alterações que ainda não foram salvas.',
              details: ['Ao continuar, essas alterações serão perdidas.'],
              confirmLabel: 'Descartar alterações',
              tone: 'danger',
            },
            width: '420px',
          })
          .afterClosed(),
      )) === true
    );
  }

  private update(id: symbol, pending: boolean): void {
    this.registrations.update((registrations) => {
      if (registrations.get(id) === pending) {
        return registrations;
      }
      const updated = new Map(registrations);
      updated.set(id, pending);
      return updated;
    });
  }

  private remove(id: symbol): void {
    this.registrations.update((registrations) => {
      if (!registrations.has(id)) {
        return registrations;
      }
      const updated = new Map(registrations);
      updated.delete(id);
      return updated;
    });
  }
}

export const workspacePendingChangesGuard: CanDeactivateFn<unknown> = () =>
  inject(WorkspacePendingChangesService).canDeactivate();

export const workspacePendingChangesActivateGuard: CanActivateFn = () =>
  inject(WorkspacePendingChangesService).canActivate();
