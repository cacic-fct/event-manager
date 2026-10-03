import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { AdminEventTicket, AdminTicketHistoryEntry } from '@cacic-fct/shared-ticketing';

export interface TicketHistoryDialogData {
  ticket: AdminEventTicket;
  history: readonly AdminTicketHistoryEntry[];
}

@Component({
  selector: 'app-ticket-history-dialog',
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Histórico do bilhete</h2>
    <mat-dialog-content>
      <dl class="ticket-context">
        <div><dt>Bilhete</dt><dd>{{ data.ticket.name }}</dd></div>
        <div><dt>Evento</dt><dd>{{ data.ticket.event.name }}</dd></div>
        <div><dt>Titular atual</dt><dd>{{ data.ticket.holder?.fullName || 'Sem titular atual' }}</dd></div>
      </dl>
      @if (data.history.length === 0) {
        <p class="empty-state">Ainda não há movimentações registradas para este bilhete.</p>
      } @else {
        <ol class="history-list" aria-label="Trilha de movimentações">
          @for (entry of data.history; track entry.id) {
            <li class="history-entry">
              <span class="history-icon" aria-hidden="true"><mat-icon>{{ operationIcon(entry.operation) }}</mat-icon></span>
              <div class="history-content">
                <div class="history-heading">
                  <strong>{{ operationLabel(entry.operation) }}</strong>
                  <time [attr.datetime]="entry.createdAt">{{ entry.createdAt | date: 'dd/MM/yyyy HH:mm' }}</time>
                </div>
                <p><strong>Responsável</strong> {{ entry.actorName || 'Sistema' }}</p>
                @if (entry.previousHolder) {
                  <p><strong>Titular anterior</strong> {{ entry.previousHolder.fullName }}</p>
                }
                @if (entry.newHolder) {
                  <p><strong>Novo titular</strong> {{ entry.newHolder.fullName }}</p>
                }
                @if (entry.reason) { <p class="reason">Motivo: {{ entry.reason }}</p> }
              </div>
            </li>
          }
        </ol>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Fechar</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content { max-height:min(70dvh, 42rem); }
    .ticket-context { display:grid; gap:0.5rem; margin:0 0 0.75rem; }
    .ticket-context > div { display:grid; gap:0.15rem; }
    .ticket-context dt { color:var(--mat-sys-on-surface-variant); font:var(--mat-sys-body-small); }
    .ticket-context dd { margin:0; overflow-wrap:anywhere; }
    .empty-state { margin-block:1rem; color:var(--mat-sys-on-surface-variant); }
    .history-list { display:grid; margin:1rem 0 0; padding:0; list-style:none; }
    .history-entry { display:grid; grid-template-columns:2rem minmax(0,1fr); gap:0.75rem; padding:0.85rem 0; border-top:1px solid var(--mat-sys-outline-variant); }
    .history-icon { display:grid; place-items:center; width:2rem; height:2rem; border-radius:50%; background:var(--mat-sys-surface-container); color:var(--mat-sys-on-surface-variant); }
    .history-content { display:grid; min-width:0; gap:0.25rem; }
    .history-heading { display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.25rem 1rem; }
    time, .history-content p { color:var(--mat-sys-on-surface-variant); font:var(--mat-sys-body-small); }
    .history-content p { margin:0; overflow-wrap:anywhere; }
    .history-content p strong { color:var(--mat-sys-on-surface); font-weight:600; }
    .reason { white-space:pre-wrap; }
  `,
})
export class TicketHistoryDialogComponent {
  protected readonly data = inject<TicketHistoryDialogData>(MAT_DIALOG_DATA);

  protected operationLabel(operation: AdminTicketHistoryEntry['operation']): string {
    switch (operation) {
      case 'ISSUED': return 'Bilhete emitido';
      case 'TRANSFER_REQUESTED': return 'Transferência solicitada';
      case 'TRANSFER_ACCEPTED': return 'Transferência aceita';
      case 'TRANSFER_IGNORED': return 'Transferência ignorada';
      case 'TRANSFER_CANCELED': return 'Solicitação cancelada';
      case 'TRANSFERRED': return 'Titularidade transferida';
      case 'CONSUMED': return 'Bilhete utilizado';
      case 'REVOKED': return 'Bilhete revogado';
    }
  }

  protected operationIcon(operation: AdminTicketHistoryEntry['operation']): string {
    switch (operation) {
      case 'ISSUED': return 'add_card';
      case 'TRANSFER_REQUESTED': return 'send';
      case 'TRANSFER_ACCEPTED': return 'check_circle';
      case 'TRANSFER_IGNORED': return 'visibility_off';
      case 'TRANSFER_CANCELED': return 'cancel';
      case 'TRANSFERRED': return 'swap_horiz';
      case 'CONSUMED': return 'task_alt';
      case 'REVOKED': return 'block';
    }
  }
}
