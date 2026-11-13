import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Service, PLATFORM_ID, computed, inject, isDevMode, signal } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NavigationEnd, Router } from '@angular/router';

import { UpdateModalComponent, type UpdateProgress } from './dialog-components/update.component';
import { UpdateErrorDialogComponent } from './dialog-components/update-error.component';
import { trustedServiceWorkerUrl } from '../security/trusted-types';

type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready' | 'failed' | 'unrecoverable';
const NAVIGATION_CHECK_COOLDOWN_MS = 60_000;
const SLOW_UPDATE_MS = 10_000;
const UPDATE_INACTIVITY_TIMEOUT_MS = 90_000;

@Service()
export class ServiceWorkerService {
  private readonly router = inject(Router, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog: MatDialog = inject(MatDialog);
  private readonly document: Document = inject(DOCUMENT);
  private readonly platformId: object = inject(PLATFORM_ID);

  readonly state = signal<UpdateState>('idle');
  readonly error = signal<string | null>(null);
  private readonly serviceWorkerControlled = signal(false);

  readonly isBrowser = computed(() => isPlatformBrowser(this.platformId));

  readonly hasServiceWorker = computed(() => {
    return this.canUseServiceWorker() && this.serviceWorkerControlled();
  });

  private updateDialogRef: MatDialogRef<UpdateModalComponent> | null = null;
  private registration: ServiceWorkerRegistration | null = null;
  private readonly trackedServiceWorkers = new WeakSet<ServiceWorker>();
  private progressWorker: ServiceWorker | null = null;
  private progress: UpdateProgress | null = null;
  private slowUpdateTimeout: ReturnType<typeof setTimeout> | undefined;
  private updateTimeout: ReturnType<typeof setTimeout> | undefined;
  private errorDialogRef: MatDialogRef<UpdateErrorDialogComponent> | null = null;
  private checking = false;
  private deploymentCheckPending = false;
  private reloading = false;
  private started = false;
  private recoveryAttempted = false;

  start(frontendVersion?: string): void {
    if (this.started || !this.canUseServiceWorker() || isDevMode()) {
      return;
    }

    this.started = true;
    this.serviceWorkerControlled.set(Boolean(navigator.serviceWorker.controller));

    let currentController = navigator.serviceWorker.controller;
    const controllerChanged = () => {
      const previousController = currentController;
      currentController = navigator.serviceWorker.controller;
      this.serviceWorkerControlled.set(Boolean(currentController));
      // Workbox activates automatically, including updates installed by another tab.
      // A first install must not interrupt the user's current visit.
      if (previousController && currentController && previousController !== currentController && !this.reloading) {
        this.reloading = true;
        this.clearUpdateTimeout();
        this.showUpdateProgress('ready');
        this.reload();
      }
    };
    const checkWhenVisible = () => {
      if (this.document.visibilityState === 'visible' && navigator.onLine) {
        void this.checkForUpdate();
      }
    };
    const workerMessage = (event: MessageEvent<unknown>) => this.handleWorkerMessage(event);
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    navigator.serviceWorker.addEventListener('message', workerMessage);
    this.document.addEventListener('visibilitychange', checkWhenVisible);
    window.addEventListener('online', checkWhenVisible);
    window.addEventListener('pageshow', checkWhenVisible);
    let lastNavigationCheck = Date.now();
    const navigationSubscription = this.router?.events.subscribe((event) => {
      if (event instanceof NavigationEnd && Date.now() - lastNavigationCheck >= NAVIGATION_CHECK_COOLDOWN_MS) {
        lastNavigationCheck = Date.now();
        checkWhenVisible();
      }
    });
    this.destroyRef.onDestroy(() => {
      navigationSubscription?.unsubscribe();
      window.removeEventListener('pageshow', checkWhenVisible);
      this.clearUpdateTimeout();
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
      navigator.serviceWorker.removeEventListener('message', workerMessage);
      this.document.removeEventListener('visibilitychange', checkWhenVisible);
      window.removeEventListener('online', checkWhenVisible);
      this.updateDialogRef?.close();
      this.errorDialogRef?.close();
    });

    void this.registerServiceWorker().then(() => {
      if (frontendVersion) this.listenForFrontendDeployments(frontendVersion);
    });
  }

  private listenForFrontendDeployments(frontendVersion: string): void {
    if (this.destroyRef.destroyed || typeof EventSource === 'undefined') return;

    const source = new EventSource(new URL('api/version/events', this.document.baseURI));
    source.addEventListener('frontend-version', (event: MessageEvent<string>) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'version' in payload &&
        typeof payload.version === 'string' &&
        payload.version.trim() &&
        payload.version !== frontendVersion
      ) {
        // A version mismatch is a hint to fetch the worker, never permission to
        // activate an incomplete download or compare against the backend version.
        if (this.checking) {
          this.deploymentCheckPending = true;
        } else {
          void this.checkForUpdate();
        }
      }
    });
    // EventSource reconnects after deployment or connectivity loss. Existing
    // visibility/navigation checks also cover browsers or proxies without SSE.
    this.destroyRef.onDestroy(() => source.close());
  }

  async checkForUpdate(): Promise<boolean> {
    if (!this.canUseServiceWorker() || isDevMode()) {
      return false;
    }

    if (this.checking || this.state() === 'downloading' || this.state() === 'ready' || !navigator.onLine) {
      return false;
    }

    this.checking = true;
    try {
      this.state.set('checking');

      const registration =
        this.registration ?? (await navigator.serviceWorker.getRegistration(this.serviceWorkerScope()));
      if (!registration) {
        this.state.set('idle');
        return false;
      }

      await registration.update();
      this.registration = registration;
      this.handleCurrentRegistration(registration);

      const hasUpdate = Boolean(registration.waiting || registration.installing);

      if (!hasUpdate && this.state() === 'checking') {
        this.error.set(null);
        this.state.set('idle');
      }

      return hasUpdate;
    } catch (error: unknown) {
      // A transient network failure must not remove offline support.
      if (this.state() === 'checking') {
        this.state.set('failed');
        this.error.set(this.stringifyError(error));
      }
      return false;
    } finally {
      this.checking = false;
      if (this.deploymentCheckPending && !this.destroyRef.destroyed) {
        this.deploymentCheckPending = false;
        void this.checkForUpdate();
      }
    }
  }

  async updateServiceWorker(): Promise<void> {
    if (!this.canUseServiceWorker()) {
      return;
    }

    await this.checkForUpdate();
  }

  async unregisterServiceWorker(): Promise<void> {
    if (!this.canUseServiceWorker()) {
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();

    await Promise.all(
      registrations
        .filter((registration) => registration.scope === this.serviceWorkerScope())
        .map((registration) => registration.unregister()),
    );

    this.reload();
  }

  async getDebugState(): Promise<string> {
    if (!this.canUseServiceWorker()) {
      return 'Service Worker indisponível neste navegador.';
    }

    const registration =
      this.registration ?? (await navigator.serviceWorker.getRegistration(this.serviceWorkerScope()));
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
      const registration = await navigator.serviceWorker.register(trustedServiceWorkerUrl(this.serviceWorkerUrl()), {
        scope: this.serviceWorkerScope(),
        updateViaCache: 'none',
      });

      this.registration = registration;
      this.state.set('idle');
      this.error.set(null);
      this.listenForServiceWorkerUpdates(registration);
      this.handleCurrentRegistration(registration);
      this.serviceWorkerControlled.set(Boolean(navigator.serviceWorker.controller));
    } catch (error: unknown) {
      await this.handleServiceWorkerError(error);
    }
  }

  private listenForServiceWorkerUpdates(registration: ServiceWorkerRegistration): void {
    registration.addEventListener('updatefound', () => {
      const serviceWorker = registration.installing;
      if (!serviceWorker) {
        return;
      }

      this.trackInstallingServiceWorker(registration, serviceWorker, Boolean(navigator.serviceWorker.controller));
    });
  }

  private handleCurrentRegistration(registration: ServiceWorkerRegistration): void {
    const isUpdate = Boolean(navigator.serviceWorker.controller);

    if (registration.installing) {
      this.trackInstallingServiceWorker(registration, registration.installing, isUpdate);
      return;
    }

    if (registration.waiting && isUpdate) {
      this.activateWaitingUpdate(registration);
    }
  }

  private trackInstallingServiceWorker(
    registration: ServiceWorkerRegistration,
    serviceWorker: ServiceWorker,
    isUpdate: boolean,
  ): void {
    if (this.trackedServiceWorkers.has(serviceWorker)) {
      return;
    }

    this.trackedServiceWorkers.add(serviceWorker);

    serviceWorker.addEventListener('error', (event) => {
      if (this.reloading || (isUpdate && serviceWorker !== this.progressWorker)) return;
      const message =
        event instanceof ErrorEvent && event.message ? event.message : 'O Service Worker encontrou um erro.';
      void this.handleUpdateFailed(message);
    });

    if (isUpdate) {
      this.progressWorker = serviceWorker;
      this.progress = null;
      this.handleUpdateDetected();
    }

    const handleStateChange = () => {
      if (this.reloading || (isUpdate && serviceWorker !== this.progressWorker)) return;
      switch (serviceWorker.state) {
        case 'installed': {
          if (isUpdate) {
            if (registration.waiting) {
              this.activateWaitingUpdate(registration);
            } else {
              this.finishUpdate();
            }
          } else {
            this.state.set('idle');
          }
          break;
        }

        case 'activating': {
          if (isUpdate) this.finishUpdate();
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
          void this.handleUpdateFailed();
          break;
        }
      }
    };

    serviceWorker.addEventListener('statechange', handleStateChange);
    handleStateChange();
  }

  private handleUpdateDetected(): void {
    this.error.set(null);
    this.showUpdateProgress('downloading');
    this.updateDialogRef?.componentRef?.setInput('progress', null);
    this.updateDialogRef?.componentRef?.setInput('takingLonger', false);
    clearTimeout(this.slowUpdateTimeout);
    this.slowUpdateTimeout = setTimeout(() => {
      this.updateDialogRef?.componentRef?.setInput('takingLonger', true);
    }, SLOW_UPDATE_MS);
    this.restartUpdateTimeout();
  }

  private handleWorkerMessage(event: MessageEvent<unknown>): void {
    if (!this.progressWorker || event.source !== this.progressWorker || this.state() !== 'downloading') return;

    const data = event.data;
    if (typeof data !== 'object' || data === null || !('type' in data) || data.type !== 'PRECACHE_PROGRESS') return;
    if (!('completed' in data) || !('total' in data)) return;

    const { completed, total } = data;
    if (
      typeof completed !== 'number' ||
      !Number.isSafeInteger(completed) ||
      completed < 1 ||
      typeof total !== 'number' ||
      !Number.isSafeInteger(total) ||
      completed > total ||
      (this.progress && (total !== this.progress.total || completed <= this.progress.completed))
    ) {
      return;
    }

    this.progress = { completed, total };
    this.updateDialogRef?.componentRef?.setInput('progress', this.progress);
    this.restartUpdateTimeout();
  }

  private restartUpdateTimeout(): void {
    clearTimeout(this.updateTimeout);
    this.updateTimeout = setTimeout(() => {
      void this.handleUpdateFailed('A atualização ficou sem progresso por muito tempo.');
    }, UPDATE_INACTIVITY_TIMEOUT_MS);
  }

  private showUpdateProgress(phase: 'downloading' | 'ready'): void {
    this.state.set(phase);
    this.errorDialogRef?.close();
    this.errorDialogRef = null;
    this.updateDialogRef ??= this.dialog.open(UpdateModalComponent, {
      disableClose: true,
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'first-heading',
    });
    this.updateDialogRef.componentRef?.setInput('phase', phase);
  }

  private clearUpdateTimeout(): void {
    clearTimeout(this.updateTimeout);
    this.updateTimeout = undefined;
    clearTimeout(this.slowUpdateTimeout);
    this.slowUpdateTimeout = undefined;
  }

  private finishUpdate(): void {
    if (this.state() === 'ready' || this.reloading) return;

    this.clearUpdateTimeout();
    this.showUpdateProgress('ready');
    this.restartUpdateTimeout();
  }

  private activateWaitingUpdate(registration: ServiceWorkerRegistration): void {
    const waitingServiceWorker = registration.waiting;
    if (waitingServiceWorker) {
      this.finishUpdate();
      waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }

  private async handleUpdateFailed(message = 'Falha ao instalar a nova versão do aplicativo.'): Promise<void> {
    this.updateDialogRef?.close();
    this.updateDialogRef = null;

    this.clearUpdateTimeout();
    this.state.set('failed');
    this.error.set(message);
    this.openUpdateErrorDialog(message);
  }

  private async handleServiceWorkerError(error: unknown): Promise<void> {
    const message = this.stringifyError(error);

    this.state.set('failed');
    this.error.set(message);

    if (this.recoveryAttempted) {
      this.openUpdateErrorDialog(message);
      return;
    }

    this.recoveryAttempted = true;
    this.updateDialogRef?.close();
    this.updateDialogRef = null;

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => registration.scope === this.serviceWorkerScope())
          .map((registration) => registration.unregister()),
      );
    } catch {
      // Attempt a fresh registration even when querying or removing the old worker fails.
    }

    this.registration = null;
    this.serviceWorkerControlled.set(false);
    await this.registerServiceWorker();
  }

  private openUpdateErrorDialog(error: string): void {
    this.clearUpdateTimeout();
    this.updateDialogRef?.close();
    this.updateDialogRef = null;
    if (this.errorDialogRef) return;
    const dialogRef = this.dialog.open(UpdateErrorDialogComponent, {
      disableClose: true,
      data: { error },
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'first-heading',
    });

    this.errorDialogRef = dialogRef;
    dialogRef.afterClosed().subscribe((result: 'reload' | undefined) => {
      this.errorDialogRef = null;

      if (result === 'reload') {
        this.reload();
      }
    });
  }

  private canUseServiceWorker(): boolean {
    return this.isBrowser() && 'serviceWorker' in navigator;
  }

  private serviceWorkerUrl(): string {
    return new URL('cacic-public-worker.js', this.document.baseURI).toString();
  }

  private serviceWorkerScope(): string {
    return new URL('.', this.document.baseURI).toString();
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
