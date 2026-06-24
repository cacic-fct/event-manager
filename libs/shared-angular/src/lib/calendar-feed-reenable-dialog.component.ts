import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export type CalendarFeedReenableChoice = 'rotate' | 'keep';

export interface CalendarFeedReenableDialogData {
  feedName: string;
}

@Component({
  selector: 'lib-calendar-feed-reenable-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Reativar {{ data.feedName }}</h2>
    <div mat-dialog-content>
      <p>
        Recomendamos gerar um novo link antes de reativar, por segurança. O link antigo funciona como uma chave:
        se alguém guardou esse endereço, viu em um registro de proxy, recebeu antes ou está com um app de calendário
        comprometido, essa pessoa volta a acessar o feed assim que ele for reativado.
      </p>
      <p>Ao gerar um novo link, o endereço antigo deixa de funcionar e só quem receber o novo link poderá usar o feed.</p>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancelar</button>
      <button mat-button type="button" [mat-dialog-close]="'keep'">Manter link atual</button>
      <button mat-flat-button type="button" [mat-dialog-close]="'rotate'">
        <mat-icon>sync</mat-icon>
        Gerar novo link
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarFeedReenableDialogComponent {
  readonly data = inject<CalendarFeedReenableDialogData>(MAT_DIALOG_DATA);
}
