import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface AttendanceIncognitoWarningDialogData {
  step: 1 | 2;
}

@Component({
  selector: 'app-attendance-incognito-warning-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.step === 1 ? 'Navegação privativa detectada' : 'Confirme antes de continuar' }}</h2>
    <div mat-dialog-content>
      <p>
        {{
          data.step === 1
            ? 'O navegador parece estar em modo anônimo ou privativo. Presenças coletadas off-line podem ser apagadas ao fechar esta janela.'
            : 'Se continuar no modo anônimo, presenças ainda não sincronizadas serão perdidas quando a sessão for encerrada.'
        }}
      </p>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close>Entendi</button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttendanceIncognitoWarningDialog {
  readonly data = inject<AttendanceIncognitoWarningDialogData>(MAT_DIALOG_DATA);
}
