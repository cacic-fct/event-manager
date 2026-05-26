import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'lib-novu-push-permission-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Ativar notificações importantes?</h2>
    <mat-dialog-content>
      <p>Enviaremos apenas notificações importantes, como informações sobre o estado da sua inscrição.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dismiss()">Agora não</button>
      <button mat-flat-button type="button" (click)="confirm()">Permitir</button>
    </mat-dialog-actions>
  `,
})
export class NovuPushPermissionDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<NovuPushPermissionDialogComponent, boolean>);

  protected dismiss(): void {
    this.dialogRef.close(false);
  }

  protected confirm(): void {
    this.dialogRef.close(true);
  }
}
