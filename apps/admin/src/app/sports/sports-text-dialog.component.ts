import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface SportsTextDialogData {
  title: string;
  description: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  multiline?: boolean;
  required?: boolean;
}

@Component({
  selector: 'app-sports-text-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <div mat-dialog-content class="content">
      <p>{{ data.description }}</p>
      <mat-form-field>
        <mat-label>{{ data.label }}</mat-label>
        @if (data.multiline) {
          <textarea matInput rows="4" [formControl]="value"></textarea>
        } @else {
          <input matInput [formControl]="value" />
        }
      </mat-form-field>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Cancelar</button>
      <button mat-flat-button type="button" [disabled]="value.invalid" (click)="submit()">
        {{ data.confirmLabel ?? 'Continuar' }}
      </button>
    </div>
  `,
  styles: `
    .content {
      display: grid;
      min-width: min(30rem, calc(100vw - 3rem));
    }
    p {
      color: var(--mat-sys-on-surface-variant);
      margin-top: 0;
    }
  `,
})
export class SportsTextDialogComponent {
  readonly data = inject<SportsTextDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<SportsTextDialogComponent, string>);
  readonly value = new FormControl(this.data.initialValue ?? '', {
    nonNullable: true,
    validators: this.data.required === false ? [] : [Validators.required],
  });

  protected submit(): void {
    if (this.value.valid) {
      this.dialogRef.close(this.value.value.trim());
    }
  }
}
