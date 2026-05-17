import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
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
} from '@cacic-fct/shared-angular';
import { getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly feedback = inject(ScannerFeedbackService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);

  readonly event = signal<AttendanceCollectionEvent | null>(null);
  readonly attendances = signal<AttendanceScannerFeedItem[]>([]);
  readonly locationStatus = signal('Solicitando localização precisa.');
  readonly hasPreciseLocation = signal(false);

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
        if (!selectedEvent) {
          this.snackbar.open('Evento indisponível para coleta.', 'Fechar', { duration: 3500 });
        }
      },
      error: () => this.snackbar.open('Não foi possível carregar o evento.', 'Fechar', { duration: 3500 }),
    });

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

    try {
      const location = await this.getPreciseLocation();
      const attendance = await firstValueFrom(this.api.registerScannerCode(eventId, code, location));
      this.feedback.show(this.feedbackKindForCategory(attendance.category));
      this.snackbar.open('Presença registrada.', 'Fechar', { duration: 2500 });
      this.loadFeed(eventId);
    } catch (error: unknown) {
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

    try {
      const location = await this.getPreciseLocation();
      const attendance = await firstValueFrom(
        this.api.registerManual(eventId, this.manualForm.controls.value.value, location),
      );
      this.feedback.show(this.feedbackKindForCategory(attendance.category));
      this.manualForm.reset({ value: '' });
      this.snackbar.open('Presença registrada.', 'Fechar', { duration: 2500 });
      this.loadFeed(eventId);
    } catch (error: unknown) {
      this.handleRegistrationError(error);
    }
  }

  protected statusLabel(status: string | null | undefined): string {
    return status ? getSubscriptionStatusLabel(status) : 'Não inscrito';
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
