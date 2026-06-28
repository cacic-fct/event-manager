import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface DeleteEventFormDialogData {
  name: string;
  responseCount: number;
}

@Component({
  selector: 'app-delete-event-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Excluir formulário?</h2>
    <mat-dialog-content>
      <p>
        <strong>{{ data.name }}</strong> já possui
        {{ data.responseCount }} resposta{{ data.responseCount === 1 ? '' : 's' }}.
      </p>
      <p>As respostas ficam inacessíveis junto com o formulário excluído.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button type="button" color="warn" [mat-dialog-close]="true">
        <mat-icon>delete</mat-icon>
        Excluir
      </button>
    </mat-dialog-actions>
  `,
})
export class DeleteEventFormDialogComponent {
  readonly data = inject<DeleteEventFormDialogData>(MAT_DIALOG_DATA);
}
