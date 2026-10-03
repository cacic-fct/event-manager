import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { createTicketTransfer, createTicketTransferLists, createWalletTicket } from '@cacic-fct/shared-ticketing/testing';
import { EMPTY, of, throwError } from 'rxjs';
import { TicketingApiService } from './ticketing-api.service';
import { TicketTransferStartPage } from './ticket-transfer-start-page';

describe('TicketTransferStartPage', () => {
  let fixture: ComponentFixture<TicketTransferStartPage>;
  let ticketApi: {
    myWalletTicket: ReturnType<typeof vi.fn>;
    myTicketTransfers: ReturnType<typeof vi.fn>;
    startTicketTransfer: ReturnType<typeof vi.fn>;
    cancelTicketTransfer: ReturnType<typeof vi.fn>;
  };

  async function setup(options: { startError?: boolean; pending?: boolean } = {}): Promise<void> {
    const ticket = createWalletTicket({ id: '018f47a1-3d5b-7abc-8def-0123456789ac' });
    const pending = createTicketTransfer({
      ticket,
      recipient: null,
      submittedDestinationIdentityDocument: 'XK1234567',
      canCancel: true,
    });
    ticketApi = {
      myWalletTicket: vi.fn(() => of(ticket)),
      myTicketTransfers: vi.fn(() => of(createTicketTransferLists({ outgoing: options.pending ? [pending] : [] }))),
      startTicketTransfer: vi.fn(() =>
        options.startError
          ? throwError(() => new Error('recipient eligibility details must stay private'))
          : of(createTicketTransfer({
              ticket,
              recipient: null,
              submittedDestinationIdentityDocument: 'XK7654321',
            })),
      ),
      cancelTicketTransfer: vi.fn(() => of({ ...pending, senderStatus: 'CANCELED' as const, canCancel: false })),
    };

    await TestBed.configureTestingModule({
      imports: [TicketTransferStartPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ ticketId: ticket.id }) },
            paramMap: of(convertToParamMap({ ticketId: ticket.id })),
          },
        },
        { provide: TicketingApiService, useValue: { ...ticketApi, watchCurrentUser: () => EMPTY } },
        {
          provide: AuthService,
          useValue: {
            user: () => ({ sub: 'sender-user', claims: { name: 'Marina da Silva', identity_document: '52998224725' } }),
          },
        },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketTransferStartPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('preserves passport identifiers and shows the author-only result', async () => {
    await setup();

    expect(fixture.nativeElement.textContent).toContain('•••.982.247-••');
    fixture.nativeElement.querySelector('input[formControlName="identityDocument"]').value = ' XK7654321 ';
    fixture.nativeElement.querySelector('input[formControlName="identityDocument"]').dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.nativeElement.querySelector('button[type="submit"]').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(ticketApi.startTicketTransfer).toHaveBeenCalledWith('018f47a1-3d5b-7abc-8def-0123456789ac', 'XK7654321');
    expect(fixture.nativeElement.textContent).toContain('XK7654321');
    expect(fixture.nativeElement.textContent).toContain(
      'Seu nome completo e seu CPF parcialmente oculto ou o passaporte serão compartilhados com quem receber o bilhete.',
    );
  });

  it('keeps eligibility results private when the transfer request fails', async () => {
    await setup({ startError: true });
    const input = fixture.nativeElement.querySelector('input[formControlName="identityDocument"]') as HTMLInputElement;
    input.value = '529.982.247-25';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Não foi possível enviar o pedido agora. Confira o documento e tente novamente.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('recipient eligibility details');
    expect(fixture.nativeElement.textContent).not.toContain('elegível para receber');
  });

  it('allows cancellation immediately for a pending request author', async () => {
    await setup({ pending: true });

    const cancelButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(cancelButton.textContent).toContain('Cancelar pedido');
    expect(cancelButton.disabled).toBe(false);
    expect(fixture.componentInstance.canCancel()).toBe(true);
    expect(ticketApi.cancelTicketTransfer).not.toHaveBeenCalled();
  });
});
