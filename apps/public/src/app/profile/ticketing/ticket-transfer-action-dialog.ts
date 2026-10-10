import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export type TicketTransferAction = 'accept' | 'ignore';

export interface TicketTransferActionDialogData {
  action: TicketTransferAction;
  ticketName: string;
}

@Component({
  selector: 'app-ticket-transfer-action-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    @let receiving = data.action === 'accept';
    <h2 mat-dialog-title>{{ receiving ? 'Receber bilhete?' : 'Ignorar pedido?' }}</h2>
    <mat-dialog-content>
      @if (receiving) {
        <p>O bilhete “{{ data.ticketName }}” será transferido para você. Quem enviou será avisado.</p>
      } @else {
        <p>O pedido de “{{ data.ticketName }}” será ignorado e não poderá ser reaberto.</p>
        <p>Isso não impede que você receba outro pedido no futuro.</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Voltar</button>
      <button mat-flat-button type="button" [mat-dialog-close]="true">
        {{ receiving ? 'Receber bilhete' : 'Ignorar pedido' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class TicketTransferActionDialog {
  readonly data = inject<TicketTransferActionDialogData>(MAT_DIALOG_DATA);
}
