import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';

export interface DuplicatePersonWarningDialogData {
  message: string;
}

@Component({
  selector: 'lib-duplicate-person-warning-dialog',
  imports: [MatButtonModule, MatDialogModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Registro duplicado</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (!canClose()) {
        <mat-progress-bar mode="indeterminate" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="!canClose()" (click)="close()">Entendi</button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DuplicatePersonWarningDialogComponent {
  readonly data = inject<DuplicatePersonWarningDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<DuplicatePersonWarningDialogComponent>);
  readonly canClose = signal(false);

  constructor() {
    globalThis.setTimeout(() => this.canClose.set(true), 3000);
  }

  close(): void {
    if (this.canClose()) {
      this.dialogRef.close();
    }
  }
}
