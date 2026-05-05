import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export interface AttendanceCodeDialogData {
  eventName: string;
}

@Component({
  selector: 'app-attendance-code-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>Confirmar presença</h2>
    <mat-dialog-content>
      <p>{{ data.eventName }}</p>
      <mat-form-field appearance="outline">
        <mat-label>Código de presença</mat-label>
        <input matInput [formControl]="codeControl" maxlength="32" />
        @if (codeControl.hasError('required')) {
          <mat-error>Informe o código.</mat-error>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close()">Cancelar</button>
      <button mat-flat-button type="button" (click)="confirm()">
        <mat-icon>how_to_reg</mat-icon>
        Confirmar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-form-field {
      width: 100%;
    }

    p {
      color: var(--mat-sys-on-surface-variant);
      margin: 0 0 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceCodeDialog {
  readonly data = inject<AttendanceCodeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<AttendanceCodeDialog>);

  readonly codeControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  close(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    const code = this.codeControl.value.trim();
    if (!code) {
      this.codeControl.markAsTouched();
      return;
    }

    this.dialogRef.close(code);
  }
}
