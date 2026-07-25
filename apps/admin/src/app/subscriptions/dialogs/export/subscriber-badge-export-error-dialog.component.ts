import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface SubscriberBadgeExportErrorDialogData {
  message: string;
}

@Component({
  selector: 'app-subscriber-badge-export-error-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Não foi possível gerar o arquivo</h2>
    <div mat-dialog-content>
      <p>{{ data.message }}</p>
      <p>Revise as opções e tente novamente.</p>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>Fechar</button>
    </div>
  `,
})
export class SubscriberBadgeExportErrorDialogComponent {
  readonly data = inject<SubscriberBadgeExportErrorDialogData>(MAT_DIALOG_DATA);
}
