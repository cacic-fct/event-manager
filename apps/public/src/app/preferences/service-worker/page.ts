import { ChangeDetectionStrategy, Component, computed, inject, isDevMode, PLATFORM_ID } from '@angular/core';
import { ExplanationCard } from '../../shared/components/explanation-card/explanation-card';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { ServiceWorkerService } from '@cacic-fct/shared-angular';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NgswState } from './ngsw-state/ngsw-state';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-service-worker-unregister-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Cancelar registro do Service Worker?</h2>
    <mat-dialog-content>
      <p>Tem certeza que deseja cancelar o registro do Service Worker?</p>
      <p>Continuar irá consumir uma grande quantidade de dados.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button type="button" color="warn" [mat-dialog-close]="true">Cancelar registro</button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceWorkerUnregisterConfirmDialog {}

@Component({
  selector: 'app-service-worker',
  imports: [ExplanationCard, MatIconModule, MatToolbarModule, MatListModule, RouterLink, MatButtonModule],
  templateUrl: './page.html',
  styleUrl: './page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceWorker {
  private readonly platformId = inject(PLATFORM_ID);
  protected readonly isBrowser = isPlatformBrowser(this.platformId);

  public readonly serviceWorkerService = inject(ServiceWorkerService);
  private readonly dialog = inject(MatDialog);

  protected readonly serviceWorkerStatus = computed(() => {
    if (!this.isBrowser) {
      return 'Service Worker indisponível durante SSR';
    }

    if (isDevMode()) {
      return 'Service Worker desabilitado em modo de desenvolvimento';
    }

    if (!this.serviceWorkerService.hasServiceWorker()) {
      return 'Service Worker não registrado';
    }

    if (this.serviceWorkerService.state() === 'idle') {
      return 'Service Worker normal';
    }

    return this.serviceWorkerService.error() || this.serviceWorkerService.state();
  });

  protected openNgswDialog(): void {
    if (!this.isBrowser) {
      return;
    }

    this.dialog.open(NgswState);
  }

  protected confirmUnregisterServiceWorker(): void {
    if (!this.isBrowser || !this.serviceWorkerService.hasServiceWorker()) {
      return;
    }

    this.dialog
      .open<ServiceWorkerUnregisterConfirmDialog, void, boolean>(ServiceWorkerUnregisterConfirmDialog, {
        width: '420px',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.serviceWorkerService.unregisterServiceWorker();
        }
      });
  }
}
