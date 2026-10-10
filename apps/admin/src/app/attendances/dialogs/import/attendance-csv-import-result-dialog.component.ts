import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { EventAttendanceCsvImportResult } from '@cacic-fct/event-manager-admin-contracts';
import { attendanceImportMatchTypeLabel } from '../../attendance-labels';

export interface AttendanceCsvImportResultDialogData extends EventAttendanceCsvImportResult {
  title?: string;
  createdLabel?: string;
  duplicateLabel?: string;
  failedInstruction?: string;
}

@Component({
  selector: 'app-attendance-csv-import-result-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatListModule],
  template: `
    <h2 mat-dialog-title>{{ data.title ?? 'Importação concluída' }}</h2>
    <div mat-dialog-content>
      @if (data.failedValues.length > 0) {
        <p>Não foram encontradas pessoas para os seguintes dados:</p>
        <mat-list>
          @for (value of data.failedValues; track value) {
            <mat-list-item>
              <span matListItemTitle>{{ value }}</span>
            </mat-list-item>
          }
        </mat-list>
        <p>{{ data.failedInstruction ?? 'Faça o registro manualmente.' }}</p>
      }

      <p>
        {{ data.createdCount }} {{ data.createdLabel ?? 'novas presenças' }}, {{ data.duplicateCount }}
        {{ data.duplicateLabel ?? 'duplicadas' }}, {{ data.failedCount }} falhas.
      </p>
      <p>Tipo inferido: {{ matchTypeLabel }}.</p>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>OK</button>
    </div>
  `,
})
export class AttendanceCsvImportResultDialogComponent {
  readonly data = inject<AttendanceCsvImportResultDialogData>(MAT_DIALOG_DATA);

  get matchTypeLabel(): string {
    return attendanceImportMatchTypeLabel(this.data.inferredMatchType);
  }
}
