import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

type DialogData = { error: string };

@Component({
  selector: 'lib-update-error-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title class="dialog-title">
      <mat-icon aria-hidden="true">sync_problem</mat-icon>
      <span>Não foi possível atualizar</span>
    </h2>
    <mat-dialog-content>
      <p>Verifique a conexão e tente novamente.</p>
      <p>Ao recarregar, alterações não enviadas podem ser perdidas.</p>
      <details>
        <summary>Detalhes do erro</summary>
        <p class="error-detail">{{ data.error }}</p>
      </details>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button (click)="close('reload')">Recarregar</button>
    </mat-dialog-actions>
  `,
  styleUrl: './update-dialog.css',
})
export class UpdateErrorDialogComponent {
  readonly data: DialogData = inject(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<UpdateErrorDialogComponent, 'reload'>>(MatDialogRef);

  close(result: 'reload'): void {
    this.dialogRef.close(result);
  }
}
