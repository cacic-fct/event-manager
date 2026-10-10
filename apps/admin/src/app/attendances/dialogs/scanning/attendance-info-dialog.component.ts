import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AttendanceCategory, AttendanceCurrentAssessment } from '@cacic-fct/event-manager-admin-contracts';
import {
  attendanceCategoryLabel,
  attendanceCreationMethodLabel,
  attendanceCurrentAssessmentLabel,
} from '../../attendance-labels';
import { AttendanceLocationMapComponent } from './attendance-location-map.component';

type AttendanceInfoDialogData = {
  eventId: string;
  eventName: string;
  personId: string;
  personName: string;
  attendedAt: string;
  createdAt: string;
  createdById?: string | null;
  committedById?: string | null;
  createdByMethod: string;
  collectedByFullName?: string | null;
  committedByFullName?: string | null;
  collectedLatitude?: number | null;
  collectedLongitude?: number | null;
  collectedAccuracyMeters?: number | null;
  category: AttendanceCategory;
  currentAssessment?: AttendanceCurrentAssessment | null;
  status: 'PRESENT' | 'ABSENT';
};

type AttendanceDetail = {
  label: string;
  value: string | number | null | undefined;
};

@Component({
  selector: 'app-workspace-attendance-info-dialog',
  imports: [AttendanceLocationMapComponent, DecimalPipe, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.status === 'ABSENT' ? 'Detalhes da ausência' : 'Detalhes da presença' }}</h2>

    <mat-dialog-content class="attendance-dialog-content">
      <section class="summary">
        <div>
          <span>Pessoa</span>
          <strong>{{ data.personName }}</strong>
        </div>
        <div>
          <span>Evento</span>
          <strong>{{ data.eventName }}</strong>
        </div>
      </section>

      <dl class="detail-grid" aria-label="Informações da presença">
        @for (detail of details(); track detail.label) {
          <div>
            <dt>{{ detail.label }}</dt>
            <dd>{{ detail.value || '-' }}</dd>
          </div>
        }
      </dl>

      <section class="location-section">
        <div class="section-heading">
          <h3>Local de coleta</h3>
        </div>

        @if (hasLocation()) {
          <app-attendance-location-map
            [latitude]="data.collectedLatitude"
            [longitude]="data.collectedLongitude"
            [accuracyMeters]="data.collectedAccuracyMeters"
            [markerLabel]="data.personName" />
          <p class="location-coordinates">
            {{ data.collectedLatitude | number: '1.6-6' }},
            {{ data.collectedLongitude | number: '1.6-6' }}@if (
              data.collectedAccuracyMeters !== null && data.collectedAccuracyMeters !== undefined
            ) {, precisão de {{ data.collectedAccuracyMeters | number: '1.0-1' }} m}
          </p>
        } @else {
          <div class="empty-location">
            <mat-icon>location_off</mat-icon>
            <span>Este registro não tem coordenadas de coleta.</span>
          </div>
        }
      </section>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Fechar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .attendance-dialog-content {
      display: grid;
      gap: 1rem;
      min-width: min(28rem, 100%);
    }

    .summary,
    .detail-grid {
      display: grid;
      gap: 0.75rem;
    }

    .summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .summary div,
    .detail-grid div,
    .empty-location {
      border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
      border-radius: 8px;
      padding: 0.75rem;
    }

    .summary span,
    .detail-grid dt,
    .location-coordinates {
      color: color-mix(in srgb, currentColor 68%, transparent);
      font-size: 0.85rem;
    }

    .summary strong,
    .detail-grid dd {
      display: block;
      margin: 0.2rem 0 0;
      overflow-wrap: anywhere;
    }

    .detail-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin: 0;
    }

    .section-heading {
      align-items: center;
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }

    .section-heading h3 {
      font-size: 1rem;
      margin: 0;
    }

    .location-coordinates {
      margin: 0.5rem 0 0;
    }

    .empty-location {
      align-items: center;
      display: flex;
      gap: 0.75rem;
    }

    @media (max-width: 640px) {
      .summary,
      .detail-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AttendanceInfoDialogComponent {
  protected readonly data = inject<AttendanceInfoDialogData>(MAT_DIALOG_DATA);

  protected readonly hasLocation = computed(() => this.location() !== null);

  protected readonly details = computed<AttendanceDetail[]>(() => [
    {
      label: 'Situação',
      value: this.data.status === 'ABSENT' ? 'Ausência explícita' : 'Presença',
    },
    { label: 'ID da Pessoa', value: this.data.personId },
    { label: 'ID do Evento', value: this.data.eventId },
    { label: 'Categoria', value: attendanceCategoryLabel(this.data.category) },
    { label: 'Situação atual', value: attendanceCurrentAssessmentLabel(this.data.currentAssessment) },
    { label: 'Presença registrada em', value: this.formatDate(this.data.attendedAt) },
    { label: 'Método', value: attendanceCreationMethodLabel(this.data.createdByMethod) },
    { label: 'Coletado por', value: this.data.collectedByFullName },
    { label: 'Enviado por', value: this.data.committedByFullName },
    { label: 'ID do Coletor', value: this.data.createdById },
    { label: 'ID de Envio', value: this.data.committedById },
  ]);

  private location(): { latitude: number; longitude: number } | null {
    const latitude = this.data.collectedLatitude;
    const longitude = this.data.collectedLongitude;

    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return null;
    }

    return { latitude, longitude };
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  }

}
