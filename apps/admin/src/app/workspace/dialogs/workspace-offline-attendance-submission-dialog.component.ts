import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { OfflineEventAttendanceSubmission } from '@cacic-fct/event-manager-admin-contracts';
import { AttendanceLocationMapComponent } from './attendance-location-map.component';

export interface WorkspaceOfflineAttendanceSubmissionDialogData {
  submission: OfflineEventAttendanceSubmission & {
    eventName: string;
    personName: string;
  };
  canReview: boolean;
}

@Component({
  selector: 'app-workspace-offline-attendance-submission-dialog',
  imports: [AttendanceLocationMapComponent, DatePipe, DecimalPipe, MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Presença off-line em revisão</h2>
    <div mat-dialog-content class="offline-submission-content">
      <dl>
        <div>
          <dt>Evento</dt>
          <dd>{{ data.submission.eventName }}</dd>
        </div>
        <div>
          <dt>Pessoa</dt>
          <dd>{{ data.submission.personName }}</dd>
        </div>
        <div>
          <dt>Coletada em</dt>
          <dd>{{ data.submission.collectedAt | date: 'short' }}</dd>
        </div>
        <div>
          <dt>Autor da coleta</dt>
          <dd>{{ data.submission.authorName || data.submission.authorEmail || data.submission.authorUserId || '-' }}</dd>
        </div>
        <div>
          <dt>Enviada por</dt>
          <dd>{{ data.submission.submittedByFullName || data.submission.submittedById }}</dd>
        </div>
        <div>
          <dt>Motivo da revisão</dt>
          <dd>{{ data.submission.stagedReason || 'Enviada para revisão administrativa.' }}</dd>
        </div>
        @if (data.submission.resolutionError) {
          <div>
            <dt>Erro de identificação</dt>
            <dd>{{ data.submission.resolutionError }}</dd>
          </div>
        }
        <div>
          <dt>Dado coletado</dt>
          <dd>{{ data.submission.manualValue || data.submission.scannerCode || '-' }}</dd>
        </div>
        <div>
          <dt>Localização</dt>
          <dd>
            @if (hasLocation()) {
              {{ data.submission.collectedLatitude | number: '1.6-6' }},
              {{ data.submission.collectedLongitude | number: '1.6-6' }}
              @if (data.submission.collectedAccuracyMeters !== null && data.submission.collectedAccuracyMeters !== undefined) {
                · precisão de {{ data.submission.collectedAccuracyMeters | number: '1.0-1' }} m
              }
            } @else {
              -
            }
          </dd>
        </div>
      </dl>

      @if (hasLocation()) {
        <app-attendance-location-map
          [latitude]="data.submission.collectedLatitude"
          [longitude]="data.submission.collectedLongitude"
          [accuracyMeters]="data.submission.collectedAccuracyMeters"
          [markerLabel]="data.submission.personName"
          ariaLabel="Mapa do local onde a presença off-line foi coletada"
        />
      }
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Fechar</button>
      @if (data.canReview) {
        <button mat-stroked-button type="button" [mat-dialog-close]="'reject'">Dispensar</button>
        <button mat-flat-button type="button" [disabled]="!!data.submission.resolutionError" [mat-dialog-close]="'approve'">
          Aprovar
        </button>
      }
    </div>
  `,
  styles: `
    .offline-submission-content {
      display: grid;
      gap: 1rem;
      min-width: min(28rem, 100%);
    }

    dl {
      display: grid;
      gap: 0.75rem;
      margin: 0;
    }

    dt {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.78rem;
      font-weight: 600;
      margin-bottom: 0.15rem;
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceOfflineAttendanceSubmissionDialogComponent {
  readonly data = inject<WorkspaceOfflineAttendanceSubmissionDialogData>(MAT_DIALOG_DATA);

  protected readonly hasLocation = computed(
    () =>
      this.data.submission.collectedLatitude !== null &&
      this.data.submission.collectedLatitude !== undefined &&
      this.data.submission.collectedLongitude !== null &&
      this.data.submission.collectedLongitude !== undefined,
  );
}
