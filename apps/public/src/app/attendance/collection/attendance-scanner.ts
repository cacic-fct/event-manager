import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AztecScannerComponent,
  DuplicatePersonWarningDialogComponent,
  ScannerFeedbackKind,
  ScannerFeedbackService,
  AuthService,
  AuthenticatedUser,
} from '@cacic-fct/shared-angular';
import { AttendanceOfflineQueueService, OfflineAttendanceQueueItem } from '@cacic-fct/offline-public-data-access';
import { formatUnespRole, getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { firstValueFrom } from 'rxjs';
import {
  AttendanceCollectionApiService,
  AttendanceCollectionEvent,
  AttendanceCollectionLocation,
  AttendanceCategory,
  AttendanceCreationMethod,
  AttendanceScannerFeedItem,
} from './attendance-collection-api.service';
import { AttendanceCollectionAccessService } from './attendance-collection-access.service';
import { AttendanceOfflineSyncService } from './attendance-offline-sync.service';
import { NetworkStatusService } from '../../shared/network-status.service';

@Component({
  selector: 'app-attendance-scanner',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    AztecScannerComponent,
  ],
  templateUrl: './attendance-scanner.html',
  styleUrl: './attendance-scanner.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceScanner implements OnInit {
  private readonly access = inject(AttendanceCollectionAccessService);
  private readonly api = inject(AttendanceCollectionApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly feedback = inject(ScannerFeedbackService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly network = inject(NetworkStatusService);
  private readonly offlineQueue = inject(AttendanceOfflineQueueService);
  private readonly offlineSync = inject(AttendanceOfflineSyncService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  readonly event = signal<AttendanceCollectionEvent | null>(null);
  readonly attendances = signal<AttendanceScannerFeedItem[]>([]);
  readonly queuedAttendances = signal<OfflineAttendanceQueueItem[]>([]);
  readonly locationStatus = signal('Solicitando localização precisa.');
  readonly hasPreciseLocation = signal(false);
  readonly pendingQueueCount = computed(
    () => this.queuedAttendances().filter((item) => item.status === 'PENDING' || item.status === 'FAILED').length,
  );

  readonly manualForm = this.formBuilder.nonNullable.group({
    value: ['', Validators.required],
  });

  ngOnInit(): void {
    void this.ensurePreciseLocation();
    const eventId = this.route.snapshot.paramMap.get('eventId');
    if (!eventId) {
      void this.router.navigate(['/attendance/collect']);
      return;
    }

    this.api.listCollectionEvents().subscribe({
      next: (events) => {
        const selectedEvent = events.find((item) => item.eventId === eventId) ?? null;
        this.event.set(selectedEvent);
        const userId = this.auth.user()?.sub;
        if (userId) {
          void this.offlineQueue.replaceCollectionEvents(userId, events);
        }
        if (!selectedEvent) {
          this.snackbar.open('Evento indisponível para coleta.', 'Fechar', { duration: 3500 });
        }
      },
      error: () => void this.loadCachedEvent(eventId),
    });

    this.offlineQueue
      .watchEventItems(eventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((items) => this.queuedAttendances.set(items));

    this.loadFeed(eventId);
    this.api
      .watchFeed(eventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (attendances) => this.attendances.set(attendances),
      });
  }

  protected async handleScan(code: string): Promise<void> {
    const eventId = this.event()?.eventId;
    if (!eventId) {
      return;
    }

    let location: AttendanceCollectionLocation | null = null;
    try {
      location = await this.getPreciseLocation();
      if (!this.network.isOnline()) {
        await this.queueScannerAttendance(eventId, code, location);
        return;
      }

      const attendance = await firstValueFrom(this.api.registerScannerCode(eventId, code, location));
      this.feedback.show(this.feedbackKindForCategory(attendance.category));
      this.snackbar.open('Presença registrada.', 'Fechar', { duration: 2500 });
      this.loadFeed(eventId);
    } catch (error: unknown) {
      if (await this.queueAfterNetworkFailure(error, eventId, 'SCANNER', { code }, location)) {
        return;
      }

      this.handleRegistrationError(error);
    }
  }

  protected async registerManualAttendance(): Promise<void> {
    const eventId = this.event()?.eventId;
    if (!eventId) {
      return;
    }

    if (this.manualForm.invalid) {
      this.manualForm.markAllAsTouched();
      return;
    }

    let location: AttendanceCollectionLocation | null = null;
    try {
      location = await this.getPreciseLocation();
      if (!this.network.isOnline()) {
        await this.queueManualAttendance(eventId, this.manualForm.controls.value.value, location);
        this.manualForm.reset({ value: '' });
        return;
      }

      const attendance = await firstValueFrom(
        this.api.registerManual(eventId, this.manualForm.controls.value.value, location),
      );
      this.feedback.show(this.feedbackKindForCategory(attendance.category));
      this.manualForm.reset({ value: '' });
      this.snackbar.open('Presença registrada.', 'Fechar', { duration: 2500 });
      this.loadFeed(eventId);
    } catch (error: unknown) {
      if (
        await this.queueAfterNetworkFailure(
          error,
          eventId,
          'MANUAL_INPUT',
          {
            value: this.manualForm.controls.value.value,
          },
          location,
        )
      ) {
        this.manualForm.reset({ value: '' });
        return;
      }

      this.handleRegistrationError(error);
    }
  }

  protected async syncQueuedAttendances(): Promise<void> {
    await this.offlineSync.syncPending();
    const eventId = this.event()?.eventId;
    if (eventId) {
      this.loadFeed(eventId);
    }
  }

  protected async retryQueuedAttendance(item: OfflineAttendanceQueueItem): Promise<void> {
    await this.offlineQueue.retry(item.clientId);
    await this.syncQueuedAttendances();
  }

  protected async removeQueuedAttendance(item: OfflineAttendanceQueueItem): Promise<void> {
    await this.offlineQueue.remove(item.clientId);
    this.snackbar.open('Pendência removida.', 'Fechar', { duration: 2500 });
  }

  protected statusLabel(status: string | null | undefined): string {
    return status ? getSubscriptionStatusLabel(status) : 'Não inscrito';
  }

  protected roleLabel(role: string | null | undefined): string {
    return formatUnespRole(role) || '-';
  }

  protected methodLabel(method: AttendanceCreationMethod | null | undefined): string {
    switch (method) {
      case 'CSV_IMPORT':
        return 'CSV';
      case 'MANUAL_INPUT':
        return 'manual';
      case 'SCANNER':
        return 'scanner';
      case 'ONLINE_CODE':
        return 'código online';
      case 'UNKNOWN':
      case undefined:
      case null:
        return '-';
    }
  }

  protected queueStatusLabel(status: OfflineAttendanceQueueItem['status']): string {
    switch (status) {
      case 'PENDING':
        return 'pendente';
      case 'SYNCING':
        return 'sincronizando';
      case 'DUPLICATE':
        return 'já registrada';
      case 'CONFLICT':
        return 'conflito';
      case 'FORBIDDEN':
        return 'sem permissão';
      case 'FAILED':
        return 'falhou';
    }
  }

  private loadFeed(eventId: string): void {
    this.api.listFeed(eventId).subscribe({
      next: (attendances) => this.attendances.set(attendances),
    });
  }

  private async ensurePreciseLocation(): Promise<void> {
    try {
      await this.getPreciseLocation();
    } catch {
      return;
    }
  }

  private async loadCachedEvent(eventId: string): Promise<void> {
    const userId = this.auth.user()?.sub;
    const selectedEvent = userId ? await this.offlineQueue.getCollectionEvent(userId, eventId) : null;
    this.event.set(selectedEvent);
    if (!selectedEvent) {
      this.snackbar.open('Não foi possível carregar o evento.', 'Fechar', { duration: 3500 });
    }
  }

  private async getPreciseLocation(): Promise<AttendanceCollectionLocation> {
    try {
      const location = await this.access.getPreciseLocation();
      this.hasPreciseLocation.set(true);
      this.locationStatus.set(`Localização precisa ativa (${Math.round(location.accuracyMeters)} m).`);
      return location;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Browser didn't provide location.";
      this.hasPreciseLocation.set(false);
      this.locationStatus.set(message);
      throw new Error(message);
    }
  }

  private handleRegistrationError(error: unknown): void {
    const message =
      error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
        ? error.error.message
        : error instanceof Error
          ? error.message
          : 'Não foi possível registrar a presença.';

    if (message.includes('Presença já registrada')) {
      this.feedback.show('duplicate');
    } else if (message.startsWith('Pessoa tem registros duplicados')) {
      this.feedback.show('duplicate');
      this.dialog.open(DuplicatePersonWarningDialogComponent, {
        width: 'min(32rem, 94vw)',
        disableClose: true,
        data: {
          message,
        },
      });
      return;
    } else {
      this.feedback.show('invalid');
    }

    this.snackbar.open(message, 'Fechar', {
      duration: 5000,
    });
  }

  private async queueAfterNetworkFailure(
    error: unknown,
    eventId: string,
    method: Extract<AttendanceCreationMethod, 'SCANNER' | 'MANUAL_INPUT'>,
    payload: { code?: string; value?: string },
    location: AttendanceCollectionLocation | null,
  ): Promise<boolean> {
    if (!(error instanceof HttpErrorResponse) || error.status !== 0) {
      return false;
    }

    await this.enqueueOfflineAttendance(eventId, method, payload, location ?? (await this.getPreciseLocation()));
    return true;
  }

  private async queueScannerAttendance(
    eventId: string,
    code: string,
    location: AttendanceCollectionLocation,
  ): Promise<void> {
    await this.enqueueOfflineAttendance(eventId, 'SCANNER', { code }, location);
  }

  private async queueManualAttendance(
    eventId: string,
    value: string,
    location: AttendanceCollectionLocation,
  ): Promise<void> {
    await this.enqueueOfflineAttendance(eventId, 'MANUAL_INPUT', { value }, location);
  }

  private async enqueueOfflineAttendance(
    eventId: string,
    method: Extract<AttendanceCreationMethod, 'SCANNER' | 'MANUAL_INPUT'>,
    payload: { code?: string; value?: string },
    location: AttendanceCollectionLocation,
  ): Promise<void> {
    const user = this.auth.user();
    const event = this.event();
    if (!user?.sub || !event) {
      this.snackbar.open('Faça login antes de coletar presença off-line.', 'Fechar', { duration: 4500 });
      return;
    }

    await this.offlineQueue.enqueue({
      clientId: this.createClientId(),
      eventId,
      eventName: event.event.name,
      createdByMethod: method,
      code: payload.code,
      value: payload.value,
      location,
      collectedAt: new Date().toISOString(),
      queuedAt: Date.now(),
      updatedAt: Date.now(),
      authorUserId: user.sub,
      authorName: this.userClaim(user, 'name') ?? user.preferredUsername ?? null,
      authorEmail: user.email ?? this.userClaim(user, 'email'),
      status: 'PENDING',
      attempts: 0,
      lastError: null,
    });
    this.feedback.show('valid');
    this.snackbar.open('Presença salva off-line. Sincronize quando houver conexão.', 'Fechar', { duration: 3500 });
    void this.offlineSync.notifyPendingNow();
  }

  private userClaim(user: AuthenticatedUser | null, key: string): string | null {
    const value = user?.claims?.[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private createClientId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private feedbackKindForCategory(category: AttendanceCategory | null | undefined): ScannerFeedbackKind {
    switch (category) {
      case 'NON_PAYING':
        return 'nonPaying';
      case 'NON_SUBSCRIBED':
        return 'nonSubscribed';
      case 'REGULAR':
      case 'UNKNOWN':
      case undefined:
      case null:
        return 'valid';
    }
  }
}
