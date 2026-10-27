import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import {
  createAdminEventTicket,
  createAdminTicketHistoryEntry,
  createTicketEventSummary,
  createTicketPersonSummary,
} from '@cacic-fct/shared-ticketing/testing';
import { TicketHistoryDialogComponent, type TicketHistoryDialogData } from './ticket-history-dialog.component';

describe('TicketHistoryDialogComponent', () => {
  it('renders issuance, holder changes, transfer, consumption, revocation, and restoration in order', () => {
    const event = createTicketEventSummary({ id: 'event-1', name: 'Jantar de integração' });
    const originalHolder = createTicketPersonSummary({ personId: 'person-original', fullName: 'Marina da Silva' });
    const currentHolder = createTicketPersonSummary({ personId: 'person-current', fullName: 'João Pedro Oliveira' });
    const mergedHolder = createTicketPersonSummary({ personId: 'person-merged', fullName: 'Ana Costa' });
    const ticket = createAdminEventTicket({
      id: 'ticket-1',
      eventId: event.id,
      event,
      holder: currentHolder,
      originalHolder,
    });
    const history: TicketHistoryDialogData['history'] = [
      createAdminTicketHistoryEntry({
        ticketId: ticket.id,
        operation: 'ISSUED',
        newHolder: originalHolder,
        actorName: 'Sistema',
      }),
      createAdminTicketHistoryEntry({
        ticketId: ticket.id,
        id: 'history-holder-change',
        operation: 'HOLDER_CHANGED',
        previousHolder: originalHolder,
        newHolder: mergedHolder,
        actorName: 'Unificação de pessoas',
        reason: 'Titularidade ajustada durante a unificação de pessoas.',
      }),
      createAdminTicketHistoryEntry({
        ticketId: ticket.id,
        id: 'history-transfer',
        operation: 'TRANSFERRED',
        previousHolder: mergedHolder,
        newHolder: currentHolder,
        reason: 'Transferência confirmada.',
      }),
      createAdminTicketHistoryEntry({
        ticketId: ticket.id,
        id: 'history-consumed',
        operation: 'CONSUMED',
        previousHolder: currentHolder,
        newHolder: currentHolder,
        reason: 'Leitura validada no acesso.',
      }),
      createAdminTicketHistoryEntry({
        ticketId: ticket.id,
        id: 'history-revoked',
        operation: 'REVOKED',
        previousHolder: currentHolder,
        newHolder: null,
        actorName: 'Equipe de eventos',
        reason: 'Revogação solicitada pelo titular.',
      }),
      createAdminTicketHistoryEntry({
        ticketId: ticket.id,
        id: 'history-restored',
        operation: 'RESTORED',
        actorName: 'Unificação de pessoas desfeita',
        reason: 'Bilhete duplicado restaurado ao desfazer a unificação de pessoas.',
      }),
    ];
    const data: TicketHistoryDialogData = { ticket, history };
    TestBed.configureTestingModule({
      imports: [TicketHistoryDialogComponent],
      providers: [{ provide: MAT_DIALOG_DATA, useValue: data }],
    });
    const fixture = TestBed.createComponent(TicketHistoryDialogComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Titular anterior Marina da Silva');
    expect(text).toContain('Novo titular João Pedro Oliveira');
    expect(text).toContain('Titularidade ajustada');
    expect(text).toContain('Titularidade ajustada durante a unificação de pessoas.');
    expect(text).toContain('Transferência confirmada.');
    expect(text).toContain('Bilhete utilizado');
    expect(text).toContain('Leitura validada no acesso.');
    expect(text).toContain('Bilhete revogado');
    expect(text).toContain('Revogação solicitada pelo titular.');
    expect(text).toContain('Bilhete restaurado');
    expect(text).toContain('Bilhete duplicado restaurado ao desfazer a unificação de pessoas.');
    const entries = [...fixture.nativeElement.querySelectorAll('.history-entry')];
    expect(entries).toHaveLength(6);
    expect(entries.map((entry) => entry.textContent)).toEqual([
      expect.stringContaining('Bilhete emitido'),
      expect.stringContaining('Titularidade ajustada'),
      expect.stringContaining('Titularidade transferida'),
      expect.stringContaining('Bilhete utilizado'),
      expect.stringContaining('Bilhete revogado'),
      expect.stringContaining('Bilhete restaurado'),
    ]);
  });
});
