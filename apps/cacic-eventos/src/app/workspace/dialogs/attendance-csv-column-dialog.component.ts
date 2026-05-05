import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';

export interface AttendanceCsvColumnDialogData {
  fileName: string;
  headers: string[];
  previewRows: Record<string, string>[];
}

@Component({
  selector: 'app-attendance-csv-column-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatListModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Importar presenças</h2>
    <div mat-dialog-content>
      <p>{{ data.fileName }}</p>
      <form [formGroup]="form">
        <mat-form-field>
          <mat-label>Coluna para localizar pessoas</mat-label>
          <mat-select formControlName="selectedHeader">
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
      <button
        mat-flat-button
        type="button"
        [disabled]="form.invalid"
        (click)="confirm()"
      >
        Importar
      </button>
    </div>
  `,
})
export class AttendanceCsvColumnDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<AttendanceCsvColumnDialogComponent, string | null>,
  );
  private readonly formBuilder = inject(FormBuilder);
  readonly data = inject<AttendanceCsvColumnDialogData>(MAT_DIALOG_DATA);

  readonly form = this.formBuilder.nonNullable.group({
    selectedHeader: [this.data.headers[0] ?? '', [Validators.required]],
  });

  private readonly selectedHeader = toSignal(
    this.form.controls.selectedHeader.valueChanges.pipe(
      startWith(this.form.controls.selectedHeader.value),
    ),
    { initialValue: this.form.controls.selectedHeader.value },
  );

  readonly previewValues = computed(() => {
    const selectedHeader = this.selectedHeader();
    return this.data.previewRows
      .map((row) => row[selectedHeader]?.trim() ?? '')
      .filter((value) => value.length > 0)
      .slice(0, 8);
  });

  confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.dialogRef.close(this.form.controls.selectedHeader.value);
  }
}
