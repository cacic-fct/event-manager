import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ApplicationRef, DestroyRef, Injectable, PLATFORM_ID, computed, inject, isDevMode, signal } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { first } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { UpdateModalComponent } from './dialog-components/update.component';
import { UpdateErrorDialogComponent } from './dialog-components/update-error.component';

type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'failed' | 'unrecoverable';
const SERVICE_WORKER_RELOAD_KEY = 'cacic-eventos:service-worker-reload';
const SERVICE_WORKER_RELOAD_COOLDOWN_MS = 60000;

@Injectable({ providedIn: 'root' })
export class ServiceWorkerService {
  private readonly appRef: ApplicationRef = inject(ApplicationRef);
  private readonly dialog: MatDialog = inject(MatDialog);
  private readonly document: Document = inject(DOCUMENT);
  private readonly platformId: object = inject(PLATFORM_ID);
  private readonly destroyRef: DestroyRef = inject(DestroyRef);

  readonly state = signal<UpdateState>('idle');
  readonly error = signal<string | null>(null);
  private readonly serviceWorkerControlled = signal(false);

  readonly isBrowser = computed(() => isPlatformBrowser(this.platformId));

  readonly hasServiceWorker = computed(() => {
    return this.canUseServiceWorker() && this.serviceWorkerControlled();
  });

  private updateDialogRef: MatDialogRef<UpdateModalComponent> | null = null;
  private registration: ServiceWorkerRegistration | null = null;
  private reloadWhenControlling = false;
  private started = false;

  start(): void {
    if (this.started || !this.canUseServiceWorker() || isDevMode()) {
      return;
    }

    this.started = true;
    this.serviceWorkerControlled.set(Boolean(navigator.serviceWorker.controller));

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      this.serviceWorkerControlled.set(Boolean(navigator.serviceWorker.controller));
      if (!this.reloadWhenControlling) {
        return;
      }

      this.reloadWhenControlling = false;
      this.reload();
    });

    void this.registerServiceWorker();
    this.appRef.isStable
      .pipe(first(Boolean), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.checkForUpdate());
  }

  async checkForUpdate(): Promise<boolean> {
    if (!this.canUseServiceWorker() || isDevMode()) {
      return false;
    }

    try {
      this.state.set('checking');

      const registration = this.registration ?? (await navigator.serviceWorker.getRegistration(this.serviceWorkerScope()));
      if (!registration) {
        this.state.set('idle');
        return false;
      }

      await registration.update();
      const hasUpdate = Boolean(registration.waiting || registration.installing);

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

    console.info('Updating service worker registrations:', registrations);

    await Promise.all(registrations.map((registration) => registration.update()));
  }

  async unregisterServiceWorker(): Promise<void> {
    if (!this.canUseServiceWorker()) {
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();

    await Promise.all(registrations.map((registration) => registration.unregister()));

    this.reload();
  }

  async getDebugState(): Promise<string> {
    if (!this.canUseServiceWorker()) {
      return 'Service Worker indisponível neste navegador.';
    }

    const registration = this.registration ?? (await navigator.serviceWorker.getRegistration(this.serviceWorkerScope()));
    if (!registration) {
      return 'Service Worker não registrado.';
    }

    const cacheNames = 'caches' in window ? await caches.keys() : [];

    return [
      `Escopo: ${registration.scope}`,
      `Controlando esta página: ${navigator.serviceWorker.controller ? 'sim' : 'não'}`,
      `Instalando: ${registration.installing?.scriptURL ?? 'não'}`,
      `Aguardando ativação: ${registration.waiting?.scriptURL ?? 'não'}`,
      `Ativo: ${registration.active?.scriptURL ?? 'não'}`,
      `Caches: ${cacheNames.length ? cacheNames.join(', ') : 'nenhum'}`,
    ].join('\n');
  }

  private async registerServiceWorker(): Promise<void> {
    try {
      const registration = await navigator.serviceWorker.register(this.serviceWorkerUrl(), {
        scope: this.serviceWorkerScope(),
        updateViaCache: 'none',
      });

      this.registration = registration;
      this.listenForServiceWorkerUpdates(registration);
      this.activateWaitingUpdate(registration, false);
      this.serviceWorkerControlled.set(Boolean(navigator.serviceWorker.controller));
    } catch (error: unknown) {
      this.state.set('failed');
      this.error.set(this.stringifyError(error));
      this.openUpdateErrorDialog(this.stringifyError(error));
    }
  }

  private listenForServiceWorkerUpdates(registration: ServiceWorkerRegistration): void {
    registration.addEventListener('updatefound', () => {
      const serviceWorker = registration.installing;
      if (!serviceWorker) {
        return;
      }

      const isUpdate = Boolean(navigator.serviceWorker.controller);
      if (isUpdate) {
        this.handleUpdateDetected();
      }

      serviceWorker.addEventListener('statechange', () => {
        switch (serviceWorker.state) {
          case 'installed': {
            if (isUpdate) {
              this.activateWaitingUpdate(registration, true);
            }
            break;
          }

          case 'activated': {
            this.serviceWorkerControlled.set(Boolean(navigator.serviceWorker.controller));
            if (!isUpdate) {
              this.state.set('idle');
            }
            break;
          }

          case 'redundant': {
            this.handleUpdateFailed();
            break;
          }
        }
      });
    });
  }

  private handleUpdateDetected(): void {
    this.state.set('downloading');
    this.error.set(null);

    this.updateDialogRef ??= this.dialog.open(UpdateModalComponent, {
      disableClose: true,
    });
  }

  private activateWaitingUpdate(registration: ServiceWorkerRegistration, shouldReload: boolean): void {
    const waitingServiceWorker = registration.waiting;
    if (!waitingServiceWorker) {
      return;
    }

    if (shouldReload) {
      this.state.set('ready');

      this.updateDialogRef?.close();
      this.updateDialogRef = null;

      this.reloadWhenControlling = this.shouldReloadForUpdate(waitingServiceWorker.scriptURL);
    }

    waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
  }

  private handleUpdateFailed(): void {
    const message = 'Falha ao instalar a nova versão do Service Worker.';

    this.state.set('failed');
    this.error.set(message);

    this.updateDialogRef?.close();
    this.updateDialogRef = null;

    this.openUpdateErrorDialog(message);
  }

  private openUpdateErrorDialog(error: string): void {
    const dialogRef = this.dialog.open(UpdateErrorDialogComponent, {
      disableClose: true,
      data: { error },
    });

    dialogRef.afterClosed().subscribe((result: 'reload' | 'unregister' | undefined) => {
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

  private serviceWorkerUrl(): string {
    return new URL('novu-ngsw-worker.js', this.document.baseURI).toString();
  }

  private serviceWorkerScope(): string {
    return new URL('.', this.document.baseURI).toString();
  }

  private shouldReloadForUpdate(scriptUrl: string | null): boolean {
    if (!scriptUrl || !this.isBrowser()) {
      return true;
    }

    try {
      const now = Date.now();
      const lastReload = JSON.parse(sessionStorage.getItem(SERVICE_WORKER_RELOAD_KEY) ?? 'null') as {
        scriptUrl?: string;
        timestamp?: number;
      } | null;

      if (
        lastReload?.scriptUrl === scriptUrl &&
        typeof lastReload.timestamp === 'number' &&
        now - lastReload.timestamp < SERVICE_WORKER_RELOAD_COOLDOWN_MS
      ) {
        return false;
      }

      sessionStorage.setItem(SERVICE_WORKER_RELOAD_KEY, JSON.stringify({ scriptUrl, timestamp: now }));
      return true;
    } catch {
      return true;
    }
  }

  private reload(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
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
