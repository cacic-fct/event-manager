import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { AztecScannerComponent } from './aztec-scanner.component';

export type AztecScannerDialogData = {
  title?: string;
  acceptedPrefixes?: readonly string[];
  pauseAfterScanMs?: number;
  continuousMode?: boolean;
};

@Component({
  selector: 'lib-aztec-scanner-dialog',
  imports: [MatButtonModule, MatDialogModule, AztecScannerComponent],
  template: `
    <h2 mat-dialog-title>{{ data.title ?? 'Escanear código' }}</h2>
    <mat-dialog-content>
      <lib-aztec-scanner
        [title]="data.title ?? 'Escanear código'"
        [acceptedPrefixes]="data.acceptedPrefixes ?? []"
        [pauseAfterScanMs]="data.pauseAfterScanMs ?? 1800"
        (scan)="handleScan($event)" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AztecScannerDialogComponent {
  readonly data: AztecScannerDialogData = inject(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<AztecScannerDialogComponent, string>>(MatDialogRef);

  readonly lastScannedCode = signal<string | null>(null);

  handleScan(code: string): void {
    if (this.data.continuousMode) {
      // In continuous mode, update the signal without closing the dialog
      this.lastScannedCode.set(code);
    } else {
      // In single-scan mode, close the dialog with the code
      this.dialogRef.close(code);
    }
  }
}
