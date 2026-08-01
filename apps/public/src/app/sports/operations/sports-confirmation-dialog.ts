import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface SportsConfirmationDialogData {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

@Component({
  selector: 'app-sports-confirmation-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close(false)">
        {{ data.cancelLabel || 'Não' }}
      </button>
      <button
        mat-flat-button
        type="button"
        [class.destructive-action]="data.destructive"
        (click)="close(true)">
        @if (data.destructive) {
          <mat-icon>warning</mat-icon>
        }
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      max-width: 52ch;
    }

    mat-dialog-content p {
      color: var(--mat-sys-on-surface-variant);
      line-height: 1.5;
      margin: 0;
    }

    .destructive-action {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsConfirmationDialog {
  readonly data = inject<SportsConfirmationDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<SportsConfirmationDialog, boolean>);

  close(confirmed: boolean): void {
    this.dialogRef.close(confirmed);
  }
}
