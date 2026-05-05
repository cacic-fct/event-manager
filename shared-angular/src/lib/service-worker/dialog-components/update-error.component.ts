import { Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

type DialogData = {
  error: string;
};

@Component({
  standalone: true,
  selector: 'lib-update-error-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Erro ao atualizar o aplicativo</h2>

    <mat-dialog-content>
      <p>{{ data.error }}</p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button color="warn" (click)="close('unregister')">
        Cancelar registro
      </button>

      <button mat-flat-button color="primary" (click)="close('reload')">
        Recarregar
      </button>
    </mat-dialog-actions>
  `,
})
export class UpdateErrorDialogComponent {
  readonly data: DialogData = inject(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<UpdateErrorDialogComponent, 'reload' | 'unregister'>>(
      MatDialogRef,
    );

  close(result: 'reload' | 'unregister'): void {
    this.dialogRef.close(result);
  }
}
