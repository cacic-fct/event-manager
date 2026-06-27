import { ChangeDetectionStrategy, Component, computed, inject, isDevMode, PLATFORM_ID } from '@angular/core';
import { ExplanationCard } from '../../shared/components/explanation-card/explanation-card';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { ServiceWorkerService } from '@cacic-fct/shared-angular';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { NgswState } from './ngsw-state/ngsw-state';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-service-worker',
  imports: [ExplanationCard, MatIconModule, MatToolbarModule, MatListModule, RouterLink, MatButtonModule],
  templateUrl: './service-worker.html',
  styleUrl: './service-worker.css',
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
}
