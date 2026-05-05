import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { EventAttendanceCsvImportResult } from '../../graphql/models';

const MATCH_TYPE_LABELS: Record<string, string> = {
  IDENTITY_DOCUMENT: 'documento de identidade',
  EMAIL: 'e-mail',
  FULL_NAME: 'nome completo',
};

@Component({
  selector: 'app-attendance-csv-import-result-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatListModule],
  template: `
    <h2 mat-dialog-title>Importação concluída</h2>
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
        <p>Faça o registro manualmente.</p>
      }

      <p>
        {{ data.createdCount }} novas presenças,
        {{ data.duplicateCount }} duplicadas, {{ data.failedCount }} falhas.
      </p>
      <p>Tipo inferido: {{ matchTypeLabel }}.</p>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>OK</button>
    </div>
  `,
})
export class AttendanceCsvImportResultDialogComponent {
  readonly data = inject<EventAttendanceCsvImportResult>(MAT_DIALOG_DATA);

  get matchTypeLabel(): string {
    return (
      MATCH_TYPE_LABELS[this.data.inferredMatchType] ??
      this.data.inferredMatchType
    );
  }
}
