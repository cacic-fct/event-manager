import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface InterestConversionDialogData {
  personName: string;
  targetName: string;
  requiresImageLicenseAgreement: boolean;
}

export interface InterestConversionDialogResult {
  imageLicenseAgreementAccepted: boolean;
}

@Component({
  selector: 'app-interest-conversion-dialog',
  imports: [MatButtonModule, MatCheckboxModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Converter interesse em inscrição?</h2>
    <div mat-dialog-content>
      <p>A pessoa {{ data.personName }} será inscrita em {{ data.targetName }}.</p>
      <p>A manifestação de interesse permanecerá no histórico.</p>
      @if (data.requiresImageLicenseAgreement) {
        <p>Registre a concordância apenas se a pessoa já aceitou o contrato.</p>
        <mat-checkbox [checked]="accepted()" (change)="accepted.set($event.checked)">
          A pessoa concordou com o contrato de licença de uso de imagem do CACiC.
        </mat-checkbox>
        <p>
          <a href="https://cacic.com.br/kb/CACiC/Legal/Licen%C3%A7a%20de%20uso%20de%20imagem"
            target="_blank" rel="noopener noreferrer">Consultar contrato (abre em nova aba)</a>
        </p>
      }
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button"
        [disabled]="data.requiresImageLicenseAgreement && !accepted()" (click)="confirm()">
        Converter em inscrição
      </button>
    </div>
  `,
})
export class InterestConversionDialogComponent {
  readonly data = inject<InterestConversionDialogData>(MAT_DIALOG_DATA);
  readonly accepted = signal(false);
  private readonly dialogRef = inject(MatDialogRef<InterestConversionDialogComponent, InterestConversionDialogResult>);

  confirm(): void {
    if (this.data.requiresImageLicenseAgreement && !this.accepted()) {
      return;
    }
    this.dialogRef.close({ imageLicenseAgreementAccepted: this.accepted() });
  }
}
