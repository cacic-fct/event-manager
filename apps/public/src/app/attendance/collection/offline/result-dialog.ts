import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface AttendanceOfflineSyncResultDialogData {
  createdCount: number;
  stagedCount: number;
  failedItems: Array<{
    eventName: string;
    message: string;
  }>;
}

@Component({
  selector: 'app-attendance-offline-sync-result-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Sincronização de presenças off-line</h2>
    <div mat-dialog-content>
      @if (data.createdCount > 0) {
        <p>{{ data.createdCount }} presença(s) registrada(s) no servidor.</p>
      }
      @if (data.stagedCount > 0) {
        <p>{{ data.stagedCount }} presença(s) enviada(s) para revisão administrativa.</p>
      }
      @if (data.failedItems.length > 0) {
        <p>Algumas presenças não foram enviadas depois de novas tentativas:</p>
        <ul>
          @for (item of data.failedItems; track item.eventName + item.message) {
            <li>
              <strong>{{ item.eventName }}</strong>
              <span>{{ item.message }}</span>
            </li>
          }
        </ul>
      }
    </div>
    <div mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close>Fechar</button>
    </div>
  `,
  styles: `
    ul {
      display: grid;
      gap: 0.5rem;
      margin: 0;
      padding-inline-start: 1.25rem;
    }

    li span {
      display: block;
      color: color-mix(in srgb, currentColor 72%, transparent);
      margin-top: 0.15rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceOfflineSyncResultDialog {
  readonly data = inject<AttendanceOfflineSyncResultDialogData>(MAT_DIALOG_DATA);
}
