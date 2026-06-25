import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { signal } from '@angular/core';
import { FormField, form, required, submit as submitSignalForm } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';

export interface AttendanceCsvColumnDialogData {
  fileName: string;
  headers: string[];
  previewRows: Record<string, string>[];
}

@Component({
  selector: 'app-attendance-csv-column-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, MatButtonModule, MatDialogModule, MatFormFieldModule, MatListModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Importar presenças</h2>
    <div mat-dialog-content>
      <p>{{ data.fileName }}</p>
      <form>
        <mat-form-field>
          <mat-label>Coluna para localizar pessoas</mat-label>
          <mat-select [formField]="form.selectedHeader">
            @for (header of data.headers; track header) {
              <mat-option [value]="header">{{ header }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>

      @if (previewValues().length > 0) {
        <mat-list>
          @for (value of previewValues(); track value) {
            <mat-list-item>
              <span matListItemTitle>{{ value }}</span>
            </mat-list-item>
          }
        </mat-list>
      }
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [disabled]="form().invalid()" (click)="confirm()">Importar</button>
    </div>
  `,
})
export class AttendanceCsvColumnDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AttendanceCsvColumnDialogComponent, string | null>);
  readonly data = inject<AttendanceCsvColumnDialogData>(MAT_DIALOG_DATA);

  readonly model = signal({
    selectedHeader: this.data.headers[0] ?? '',
  });
  readonly form = form(this.model, (path) => {
    required(path.selectedHeader);
  });

  readonly previewValues = computed(() => {
    const selectedHeader = this.model().selectedHeader;
    return this.data.previewRows
      .map((row) => row[selectedHeader]?.trim() ?? '')
      .filter((value) => value.length > 0)
      .slice(0, 8);
  });

  confirm(): void {
    if (this.form().invalid()) {
      void submitSignalForm(this.form, { action: async () => undefined });
      return;
    }

    this.dialogRef.close(this.model().selectedHeader);
  }
}
