import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AztecScannerComponent,
  DuplicatePersonWarningDialogComponent,
  ScannerFeedbackKind,
  ScannerFeedbackService,
} from '@cacic-fct/shared-angular';
import { getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { firstValueFrom } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import {
  AttendanceCategory,
  AttendanceCreationMethod,
  EventAttendanceScannerFeedItem,
  SubscriptionStatus,
} from '../../graphql/models';

export interface WorkspaceAttendanceScannerDialogData {
  eventId: string;
}

@Component({
  selector: 'app-workspace-attendance-scanner-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatTooltipModule,
    AztecScannerComponent,
  ],
  template: `
    <h2 mat-dialog-title>Escanear presenças</h2>

    <mat-dialog-content>
      <section class="scanner-layout">
        <lib-aztec-scanner title="Escanear presença" [acceptedPrefixes]="['user:']" (scan)="handleScan($event)" />

        <form class="manual-form" [formGroup]="manualForm" (ngSubmit)="registerManualAttendance()">
          <mat-form-field>
            <mat-label>E-mail, telefone ou documento</mat-label>
            <input matInput formControlName="value" autocomplete="off" />
          </mat-form-field>
          <button mat-stroked-button type="submit" [disabled]="manualForm.invalid">
            <mat-icon>person_add</mat-icon>
            Registrar manualmente
          </button>
        </form>

        <section class="feed-panel" aria-live="polite">
          <div class="feed-heading">
            <div>
              <h3>Presenças registradas</h3>
              <p>{{ attendances().length }} registros recentes</p>
            </div>
            <button matIconButton type="button" matTooltip="Atualizar lista" (click)="loadInitialFeed()">
              <mat-icon>refresh</mat-icon>
            </button>
          </div>

          <mat-list class="attendance-feed">
            @for (attendance of attendances(); track attendance.personId + attendance.eventId + attendance.attendedAt) {
              <mat-list-item>
                <span matListItemTitle class="attendance-title">
                  {{ attendance.fullName || attendance.personId }}
                </span>
                <span matListItemLine class="attendance-line">
                  {{ attendance.unespRole || '-' }} · {{ statusLabel(attendance.subscriptionStatus) }}
                </span>
                <span matListItemLine class="attendance-line">
                  @if (attendance.attendedAt) {
                    {{ attendance.attendedAt | date: 'shortTime' }}
                  } @else {
                    -
                  }
                  · {{ methodLabel(attendance.createdByMethod) }}
                  @if (attendance.collectedByFirstName) {
                    · por {{ attendance.collectedByFirstName }}
                  }
                </span>
              </mat-list-item>
            } @empty {
              <mat-list-item>
                <span matListItemTitle>Nenhuma presença registrada</span>
                <span matListItemLine>A lista será atualizada automaticamente.</span>
              </mat-list-item>
            }
          </mat-list>
        </section>
      </section>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Fechar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .scanner-layout {
      display: grid;
      gap: 1rem;
    }

    .feed-panel {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: 0.875rem;
    }

    .manual-form {
      align-items: start;
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(12rem, 1fr) auto;
    }

    .feed-heading {
      align-items: flex-start;
      display: flex;
      gap: 1rem;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }

    .feed-heading h3,
    .feed-heading p {
      margin: 0;
    }

    .feed-heading p,
    .attendance-line {
      color: var(--mat-sys-on-surface-variant);
    }

    .attendance-feed {
      max-height: 18rem;
      overflow: auto;
    }

    .attendance-feed mat-list-item {
      --mdc-list-list-item-one-line-container-height: auto;
      --mdc-list-list-item-two-line-container-height: auto;
      --mdc-list-list-item-three-line-container-height: auto;
      min-height: 4.75rem;
    }

    .attendance-title,
    .attendance-line {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (max-width: 620px) {
      .manual-form {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class WorkspaceAttendanceScannerDialogComponent implements OnInit {
  private readonly api = inject(AttendanceApiService);
  private readonly data = inject<WorkspaceAttendanceScannerDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly feedback = inject(ScannerFeedbackService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly snackbar = inject(MatSnackBar);

  readonly attendances = signal<EventAttendanceScannerFeedItem[]>([]);
  readonly manualForm = this.formBuilder.nonNullable.group({
    value: ['', Validators.required],
  });

  ngOnInit(): void {
    this.loadInitialFeed();
    this.api
      .watchEventAttendanceScannerFeed(this.data.eventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (attendances) => this.attendances.set(attendances),
      });
  }

  protected async handleScan(code: string): Promise<void> {
    try {
      const attendance = await firstValueFrom(
        this.api.createEventAttendanceFromScannerCode({
          eventId: this.data.eventId,
          code,
        }),
      );
      this.feedback.show(this.feedbackKindForCategory(attendance.category));
      this.snackbar.open('Presença registrada pelo scanner.', 'Fechar', {
        duration: 2500,
      });
      this.loadInitialFeed();
    } catch (error: unknown) {
      this.handleRegistrationError(error);
    }
  }

  protected async registerManualAttendance(): Promise<void> {
    if (this.manualForm.invalid) {
      this.manualForm.markAllAsTouched();
      return;
    }

    try {
      const attendance = await firstValueFrom(
        this.api.createEventAttendanceFromManualInput({
          eventId: this.data.eventId,
          value: this.manualForm.controls.value.value,
        }),
      );
      this.feedback.show(this.feedbackKindForCategory(attendance.category));
      this.manualForm.reset({ value: '' });
      this.snackbar.open('Presença registrada manualmente.', 'Fechar', {
        duration: 2500,
      });
      this.loadInitialFeed();
    } catch (error: unknown) {
      this.handleRegistrationError(error);
    }
  }

  protected loadInitialFeed(): void {
    this.api.listEventAttendanceScannerFeed(this.data.eventId).subscribe({
      next: (attendances) => this.attendances.set(attendances),
    });
  }

  protected statusLabel(status: SubscriptionStatus | null | undefined): string {
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
