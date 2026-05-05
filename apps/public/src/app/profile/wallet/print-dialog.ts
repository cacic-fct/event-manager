import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-wallet-print-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Tem certeza que deseja imprimir?</h2>
    <mat-dialog-content>
      <p><b>Essa página está disponível off-line.</b></p>
      <p>Economize papel e ajude a preservar o meio ambiente!</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close(true)">Imprimir</button>
      <button
        mat-flat-button
        color="primary"
        mat-button
        type="button"
        (click)="close(false)"
      >
        Não
      </button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrintDialog {
  private readonly dialogRef = inject(MatDialogRef<PrintDialog>);

  close(confirmed: boolean): void {
    this.dialogRef.close(confirmed);
  }
}
