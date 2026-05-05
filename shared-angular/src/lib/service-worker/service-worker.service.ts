import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ApplicationRef,
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  SwUpdate,
  UnrecoverableStateEvent,
  VersionEvent,
} from '@angular/service-worker';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { first } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UpdateModalComponent } from './dialog-components/update.component';
import { UpdateErrorDialogComponent } from './dialog-components/update-error.component';
import { TooOldDialogComponent } from './dialog-components/too-old.component';

type UpdateState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'failed'
  | 'unrecoverable';

@Injectable({ providedIn: 'root' })
export class ServiceWorkerService {
  private readonly appRef: ApplicationRef = inject(ApplicationRef);
  private readonly swUpdate: SwUpdate = inject(SwUpdate);
  private readonly dialog: MatDialog = inject(MatDialog);
  private readonly document: Document = inject(DOCUMENT);
  private readonly platformId: object = inject(PLATFORM_ID);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);

  readonly state = signal<UpdateState>('idle');
  readonly error = signal<string | null>(null);

  readonly isBrowser = computed(() => isPlatformBrowser(this.platformId));

  readonly hasServiceWorker = computed(() => {
    return (
      this.canUseServiceWorker() && Boolean(navigator.serviceWorker.controller)
    );
  });

  private updateDialogRef: MatDialogRef<UpdateModalComponent> | null = null;

  constructor() {
    if (!this.isBrowser() || !this.swUpdate.isEnabled) {
      return;
    }

    this.appRef.isStable
      .pipe(first(Boolean), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.listenForServiceWorkerUpdates());
  }

  async checkForUpdate(): Promise<boolean> {
    if (!this.swUpdate.isEnabled) {
      return false;
    }

    try {
      this.state.set('checking');

      const hasUpdate = await this.swUpdate.checkForUpdate();

      if (!hasUpdate) {
        this.state.set('idle');
      }

      return hasUpdate;
    } catch (error: unknown) {
      this.state.set('failed');
      this.error.set(this.stringifyError(error));
      return false;
    }
  }

  async updateServiceWorker(): Promise<void> {
    if (!this.canUseServiceWorker()) {
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();

    await Promise.all(
      registrations.map((registration) => registration.update()),
    );
  }

  async unregisterServiceWorker(): Promise<void> {
    if (!this.canUseServiceWorker()) {
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();

    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
  }

  private listenForServiceWorkerUpdates(): void {
    this.swUpdate.versionUpdates
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event: VersionEvent) => {
        void this.handleVersionEvent(event);
      });

    this.swUpdate.unrecoverable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event: UnrecoverableStateEvent) => {
        this.handleUnrecoverableEvent(event);
      });
  }

  private async handleVersionEvent(event: VersionEvent): Promise<void> {
    switch (event.type) {
      case 'VERSION_DETECTED': {
        this.state.set('downloading');

        this.updateDialogRef ??= this.dialog.open(UpdateModalComponent, {
          disableClose: true,
        });

        break;
      }

      case 'VERSION_READY': {
        this.state.set('ready');

        this.updateDialogRef?.close();
        this.updateDialogRef = null;

        await this.swUpdate.activateUpdate();
        this.reload();

        break;
      }

      case 'VERSION_INSTALLATION_FAILED': {
        this.state.set('failed');
        this.error.set(event.error);

        this.updateDialogRef?.close();
        this.updateDialogRef = null;

        this.openUpdateErrorDialog(event.error);

        break;
      }

      case 'NO_NEW_VERSION_DETECTED': {
        this.state.set('idle');
        break;
      }
    }
  }

  private handleUnrecoverableEvent(event: UnrecoverableStateEvent): void {
    this.state.set('unrecoverable');
    this.error.set(event.reason);

    this.dialog.open(TooOldDialogComponent, {
      disableClose: true,
    });
  }

  private openUpdateErrorDialog(error: string): void {
    const dialogRef = this.dialog.open(UpdateErrorDialogComponent, {
      disableClose: true,
      data: { error },
    });

    dialogRef
      .afterClosed()
      .subscribe((result: 'reload' | 'unregister' | undefined) => {
        if (result === 'unregister') {
          void this.unregisterServiceWorker().finally(() => this.reload());
          return;
        }

        if (result === 'reload') {
          this.reload();
        }
      });
  }

  private canUseServiceWorker(): boolean {
    return this.isBrowser() && 'serviceWorker' in navigator;
  }

  private reload(): void {
    this.document.location.reload();
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'Erro desconhecido ao atualizar o aplicativo.';
  }
}
