import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
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
  imports: [AttendanceLocationMapComponent, DatePipe, DecimalPipe, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Revisar presença off-line</h2>
    <div mat-dialog-content class="offline-submission-content">
      <section class="submission-summary" aria-labelledby="offline-submission-title">
        <div class="summary-copy">
          <span>Pessoa</span>
          <h3 id="offline-submission-title">{{ data.submission.personName }}</h3>
          <p>{{ data.submission.eventName }}</p>
        </div>

        <span class="status-chip" [class.status-chip-error]="hasApprovalBlocker()">
          <mat-icon>{{ hasApprovalBlocker() ? 'error' : 'pending_actions' }}</mat-icon>
          {{ statusLabel() }}
        </span>
      </section>

      @if (data.canReview) {
        <p
          class="review-guidance"
          [class.review-guidance-error]="hasApprovalBlocker()"
          [attr.id]="hasApprovalBlocker() ? approvalHintId : null">
          <mat-icon>{{ hasApprovalBlocker() ? 'report_problem' : 'rule' }}</mat-icon>
          <span>{{ approvalHint() }}</span>
        </p>
      }

      <dl class="detail-grid" aria-label="Dados da presença off-line">
        <div class="detail-item">
          <dt>Coletada em</dt>
          <dd>{{ data.submission.collectedAt | date: 'short' }}</dd>
        </div>
        <div class="detail-item">
          <dt>Origem do dado</dt>
          <dd>{{ sourceLabel() }}</dd>
        </div>
        <div class="detail-item">
          <dt>Autor da coleta</dt>
          <dd>{{ collectorLabel() }}</dd>
        </div>
        <div class="detail-item">
          <dt>Enviada por</dt>
          <dd>{{ submitterLabel() }}</dd>
        </div>
        <div class="detail-item detail-item-wide">
          <dt>Motivo da revisão</dt>
          <dd>{{ reviewReason() }}</dd>
        </div>
        @if (data.submission.resolutionError) {
          <div class="detail-item detail-item-wide error-detail">
            <dt>Erro de identificação</dt>
            <dd>{{ data.submission.resolutionError }}</dd>
          </div>
        }
        <div class="detail-item detail-item-wide">
          <dt>Dado coletado</dt>
          <dd>{{ collectedValue() }}</dd>
        </div>
        <div class="detail-item detail-item-wide">
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
        <section class="location-section" aria-labelledby="offline-submission-location-title">
          <div class="section-heading">
            <h3 id="offline-submission-location-title">Local de coleta</h3>
            <p>Use como apoio para validar a presença; a decisão continua baseada nos dados da revisão.</p>
          </div>
          <app-attendance-location-map
            [latitude]="data.submission.collectedLatitude"
            [longitude]="data.submission.collectedLongitude"
            [accuracyMeters]="data.submission.collectedAccuracyMeters"
            [markerLabel]="data.submission.personName"
            [ariaLabel]="locationMapLabel()"
          />
        </section>
      }
    </div>
    <div mat-dialog-actions align="end" class="offline-submission-actions">
      <button mat-button type="button" mat-dialog-close>Fechar</button>
      @if (data.canReview) {
        <button mat-stroked-button type="button" [mat-dialog-close]="'reject'">
          <mat-icon>close</mat-icon>
          Rejeitar
        </button>
        <button mat-stroked-button type="button" [mat-dialog-close]="'edit'">
          <mat-icon>edit_note</mat-icon>
          Corrigir dados
        </button>
        <button
          mat-flat-button
          type="button"
          [disabled]="hasApprovalBlocker()"
          [attr.aria-describedby]="hasApprovalBlocker() ? approvalHintId : null"
          [mat-dialog-close]="'approve'">
          <mat-icon>check</mat-icon>
          Aprovar presença
        </button>
      }
    </div>
  `,
  styles: `
    .offline-submission-content {
      display: grid;
      gap: 1rem;
      min-width: min(34rem, 100%);
    }

    .submission-summary {
      align-items: start;
      background: var(--mat-sys-surface-container-low);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(0, 1fr) auto;
      padding: 0.875rem;
    }

    .summary-copy {
      min-width: 0;
    }

    .summary-copy span,
    dt,
    .section-heading p {
      color: var(--mat-sys-on-surface-variant);
    }

    .summary-copy span,
    dt {
      font-size: 0.78rem;
      font-weight: 600;
    }

    .summary-copy h3,
    .summary-copy p,
    .review-guidance,
    dl,
    .section-heading h3,
    .section-heading p {
      margin: 0;
    }

    .summary-copy h3 {
      font: var(--mat-sys-title-medium);
      margin-top: 0.15rem;
      overflow-wrap: anywhere;
    }

    .summary-copy p {
      margin-top: 0.25rem;
      overflow-wrap: anywhere;
    }

    .status-chip {
      align-items: center;
      align-self: start;
      background: var(--mat-sys-secondary-container);
      border-radius: 999px;
      color: var(--mat-sys-on-secondary-container);
      display: inline-flex;
      font: var(--mat-sys-label-medium);
      gap: 0.35rem;
      min-height: 2rem;
      padding: 0.35rem 0.65rem;
      white-space: nowrap;
    }

    .status-chip-error {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .status-chip mat-icon,
    .review-guidance mat-icon {
      flex: 0 0 auto;
      font-size: 1.15rem;
      height: 1.15rem;
      width: 1.15rem;
    }

    .review-guidance {
      align-items: flex-start;
      background: var(--mat-sys-surface-container-high);
      border-radius: 8px;
      color: var(--mat-sys-on-surface-variant);
      display: flex;
      gap: 0.65rem;
      padding: 0.75rem 0.875rem;
    }

    .review-guidance-error {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .detail-grid {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .detail-item {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      min-width: 0;
      padding: 0.75rem;
    }

    .detail-item-wide {
      grid-column: 1 / -1;
    }

    .error-detail {
      background: var(--mat-sys-error-container);
      border-color: transparent;
      color: var(--mat-sys-on-error-container);
    }

    .error-detail dt {
      color: inherit;
    }

    dt {
      margin-bottom: 0.15rem;
    }

    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    .location-section {
      display: grid;
      gap: 0.5rem;
    }

    .section-heading h3 {
      font: var(--mat-sys-title-small);
    }

    .section-heading p {
      font: var(--mat-sys-body-small);
      margin-top: 0.15rem;
    }

    .offline-submission-actions {
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .offline-submission-actions button {
      min-height: 2.75rem;
    }

    @media (max-width: 640px) {
      .offline-submission-content {
        min-width: 0;
      }

      .submission-summary,
      .detail-grid {
        grid-template-columns: 1fr;
      }

      .status-chip {
        justify-self: start;
        white-space: normal;
      }

      .offline-submission-actions {
        justify-content: stretch;
      }

      .offline-submission-actions button {
        flex: 1 1 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceOfflineAttendanceSubmissionDialogComponent {
  readonly data = inject<WorkspaceOfflineAttendanceSubmissionDialogData>(MAT_DIALOG_DATA);
  protected readonly approvalHintId = 'offline-submission-approval-hint';

  protected readonly hasLocation = computed(
    () =>
      this.data.submission.collectedLatitude !== null &&
      this.data.submission.collectedLatitude !== undefined &&
      this.data.submission.collectedLongitude !== null &&
      this.data.submission.collectedLongitude !== undefined,
  );

  protected readonly hasApprovalBlocker = computed(() => !!this.data.submission.resolutionError);

  protected readonly statusLabel = computed(() => {
    if (!this.data.canReview) {
      return 'Somente leitura';
    }

    return this.hasApprovalBlocker() ? 'Precisa de correção' : 'Pronta para aprovação';
  });

  protected readonly approvalHint = computed(() =>
    this.hasApprovalBlocker()
      ? 'Corrija os dados da pessoa antes de aprovar esta presença off-line.'
      : 'Confira os dados coletados antes de aprovar a presença.',
  );

  protected readonly sourceLabel = computed(() => {
    switch (this.data.submission.createdByMethod) {
      case 'SCANNER':
        return 'Código do crachá';
      case 'MANUAL_INPUT':
        return 'Entrada manual';
      default:
        return 'Registro importado';
    }
  });

  protected readonly collectorLabel = computed(
    () => this.data.submission.authorName || this.data.submission.authorEmail || this.data.submission.authorUserId || '-',
  );

  protected readonly submitterLabel = computed(
    () => this.data.submission.submittedByFullName || this.data.submission.submittedById || '-',
  );

  protected readonly reviewReason = computed(
    () => this.data.submission.stagedReason || this.resolutionIssueLabel() || 'Enviada para revisão administrativa.',
  );

  protected readonly collectedValue = computed(
    () => this.data.submission.manualValue || this.data.submission.scannerCode || '-',
  );

  protected readonly locationMapLabel = computed(() => {
    if (!this.hasLocation()) {
      return 'Mapa indisponível para esta presença off-line';
    }

    return `Mapa do local onde a presença off-line de ${this.data.submission.personName} foi coletada`;
  });

  private resolutionIssueLabel(): string | null {
    switch (this.data.submission.resolutionIssue) {
      case 'COLLECTION_WINDOW_EXPIRED':
        return 'Coleta sincronizada após a janela de autorização.';
      case 'DUPLICATE_PERSON':
        return 'Mais de uma pessoa corresponde ao dado coletado.';
      case 'INVALID_SCANNER_CODE':
        return 'Código de crachá inválido.';
      case 'PERSON_NOT_FOUND':
        return 'Pessoa não encontrada para o dado coletado.';
      case 'EVENT_LOCKED':
        return 'Evento bloqueado para novas presenças.';
      case 'UNKNOWN':
        return 'A presença precisa de revisão administrativa.';
      default:
        return null;
    }
  }
}
