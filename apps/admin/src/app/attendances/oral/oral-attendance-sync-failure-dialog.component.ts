import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface OralAttendanceSyncFailureDialogData {
  failedCount: number;
}

@Component({
  selector: 'app-oral-attendance-sync-failure-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Falha ao sincronizar a chamada</h2>
    <mat-dialog-content>
      <div class="message">
        <mat-icon aria-hidden="true">error</mat-icon>
        <p>
          {{ data.failedCount }}
          {{ data.failedCount === 1 ? 'decisão não pôde' : 'decisões não puderam' }} ser registrada após três
          tentativas.
        </p>
      </div>
      <p>
        Tire uma captura desta mensagem e envie à equipe responsável pelo sistema para que o problema seja
        investigado.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close type="button">Entendi</button>
    </mat-dialog-actions>
  `,
  styles: `
    .message {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      gap: 0.75rem;
    }

    .message mat-icon {
      color: var(--mat-sys-error);
    }

    p {
      margin-block: 0 1rem;
    }
  `,
})
export class OralAttendanceSyncFailureDialogComponent {
  protected readonly data = inject<OralAttendanceSyncFailureDialogData>(MAT_DIALOG_DATA);
}
