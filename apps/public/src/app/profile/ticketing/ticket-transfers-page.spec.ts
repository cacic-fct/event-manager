import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  createTicketPersonSummary,
  createTicketTransfer,
  createTicketTransferLists,
  createWalletTicket,
} from '@cacic-fct/shared-ticketing/testing';
import type { TicketRealtimeInvalidation, TicketTransferLists } from '@cacic-fct/shared-ticketing';
import { Subject, of, throwError } from 'rxjs';
import { TicketingApiService } from './ticketing-api.service';
import { TicketTransfersPage } from './ticket-transfers-page';

describe('TicketTransfersPage', () => {
  let api: { myTicketTransfers: ReturnType<typeof vi.fn> };
  let invalidations: Subject<TicketRealtimeInvalidation>;
  let fixture: ComponentFixture<TicketTransfersPage>;

  beforeEach(async () => {
    invalidations = new Subject<TicketRealtimeInvalidation>();
    api = { myTicketTransfers: vi.fn(() => of(createTicketTransferLists())) };
    await TestBed.configureTestingModule({
      imports: [TicketTransfersPage],
      providers: [
        provideRouter([]),
        { provide: TicketingApiService, useValue: { ...api, watchCurrentUser: () => invalidations } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TicketTransfersPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    invalidations?.complete();
    TestBed.resetTestingModule();
  });

  it('renders pending, ignored, and outgoing groups with separate sender and admin metadata', () => {
    const incomingPending = createTicketTransfer({
      id: 'incoming-admin',
      sender: createTicketPersonSummary({ personId: 'sender-ana', fullName: 'Ana Costa', firstName: 'Ana' }),
      initiatedByAdmin: true,
      initiatingAdmin: { personId: 'admin-1', firstName: 'Alex', avatarUrl: null },
    });
    const incomingIgnored = createTicketTransfer({
      id: 'incoming-duplicate',
      recipientStatus: 'SYSTEM_DUPLICATE',
      ignoreReason: 'ALREADY_HELD',
      canAccept: false,
    });
    const outgoingPending = createTicketTransfer({
      id: 'outgoing-pending',
      recipient: null,
      submittedDestinationIdentityDocument: 'XK7654321',
    });
    const outgoingAutomaticallyIgnored = createTicketTransfer({
      id: 'outgoing-system-ineligible',
      ticket: createWalletTicket({ name: 'Request awaiting recipient response' }),
      recipient: null,
      recipientStatus: 'SYSTEM_INELIGIBLE',
      ignoreReason: 'INELIGIBLE',
      submittedDestinationIdentityDocument: '52998224725',
      canAccept: false,
    });
    const outgoingAccepted = createTicketTransfer({
      id: 'outgoing-accepted',
      ticket: createWalletTicket({ name: 'Accepted request' }),
      senderStatus: 'ACCEPTED',
      recipientStatus: 'ACCEPTED',
      canCancel: false,
      canAccept: false,
    });
    api.myTicketTransfers.mockReturnValue(of(createTicketTransferLists({
      incomingPending: [incomingPending],
      incomingIgnored: [incomingIgnored],
      outgoing: [outgoingPending, outgoingAutomaticallyIgnored, outgoingAccepted],
    })));

    fixture.componentInstance.retry();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('#incoming-heading')?.textContent).toContain('Aguardando sua resposta');
    expect(host.querySelector('#ignored-heading')?.textContent).toContain('Pedidos ignorados');
    expect(host.querySelector('#outgoing-heading')?.textContent).toContain('Pedidos enviados');
    const rows = host.querySelectorAll('app-calendar-list-item');
    expect(rows).toHaveLength(5);
    const incomingMetadata = Array.from(rows[0]?.querySelectorAll('.metadata-item') ?? [], (item) => item.textContent?.trim());
    expect(incomingMetadata).toContain('Cedente: Ana');
    expect(incomingMetadata).toContain('Transferência iniciada por: Alex');
    expect(rows[1]?.textContent).toContain('Este bilhete já estava na sua carteira');
    expect(host.textContent).not.toContain('XK7654321');
    expect(host.textContent).not.toContain('52998224725');
    expect(Array.from(host.querySelectorAll('.metadata-item'), (item) => item.textContent?.trim()).filter(
      (line) => line === 'Aguardando resposta',
    )).toHaveLength(2);
    expect(host.textContent).not.toContain('Pedido enviado');
    expect(rows[3]?.textContent).toContain('Aguardando resposta');
    expect(rows[3]?.textContent).not.toContain('não era elegível');
    expect(rows[4]?.textContent).toContain('Transferência aceita');
    expect(rows[4]?.querySelector('a[mat-list-item]')).toBeNull();
  });

  it('ignores older responses and errors after a newer SSE snapshot', () => {
    const older = new Subject<TicketTransferLists>();
    const newer = new Subject<TicketTransferLists>();
    api.myTicketTransfers
      .mockReset()
      .mockReturnValueOnce(older)
      .mockReturnValueOnce(newer);

    fixture.componentInstance.retry();
    invalidations.next({ revision: '2', type: 'TRANSFERS_CHANGED', changedAt: new Date().toISOString() });
    const latestLists = createTicketTransferLists({
      incomingPending: [createTicketTransfer({
        id: 'latest-transfer',
        ticket: createWalletTicket({ name: 'Newest request' }),
      })],
    });
    newer.next(latestLists);
    older.next(createTicketTransferLists({ outgoing: [createTicketTransfer({
      id: 'stale-transfer',
      ticket: createWalletTicket({ name: 'Stale request' }),
    })] }));
    older.error(new Error('stale request failure'));
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toEqual({ status: 'ready', transfers: latestLists });
    expect(fixture.nativeElement.textContent).toContain('Newest request');
    expect(fixture.nativeElement.textContent).not.toContain('Stale request');
    expect(fixture.nativeElement.textContent).not.toContain('Não foi possível carregar suas transferências.');
  });

  it('reloads only after ticket or transfer invalidations', () => {
    const initialCallCount = api.myTicketTransfers.mock.calls.length;

    invalidations.next({ revision: '3', type: 'PURCHASES_CHANGED', changedAt: new Date().toISOString() });
    expect(api.myTicketTransfers).toHaveBeenCalledTimes(initialCallCount);

    invalidations.next({ revision: '4', type: 'TICKETS_CHANGED', changedAt: new Date().toISOString() });
    expect(api.myTicketTransfers).toHaveBeenCalledTimes(initialCallCount + 1);

    invalidations.next({ revision: '5', type: 'TRANSFERS_CHANGED', changedAt: new Date().toISOString() });
    expect(api.myTicketTransfers).toHaveBeenCalledTimes(initialCallCount + 2);
  });

  it('shows a retry after a load error and recovers when transfers become available', () => {
    const recovered = createTicketTransferLists({
      outgoing: [createTicketTransfer({ id: 'retry-transfer', ticket: createWalletTicket({ name: 'Retry request' }) })],
    });
    api.myTicketTransfers
      .mockReset()
      .mockReturnValueOnce(throwError(() => new Error('temporary failure')))
      .mockReturnValue(of(recovered));

    fixture.componentInstance.retry();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Não foi possível carregar suas transferências.');

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toEqual({ status: 'ready', transfers: recovered });
    expect(fixture.nativeElement.textContent).toContain('Retry request');
  });
});
