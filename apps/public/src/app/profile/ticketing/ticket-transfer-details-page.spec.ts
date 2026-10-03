import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { createTicketStoryTransfer } from './ticketing-story-fixtures';
import { TicketTransferDetailsPage } from './ticket-transfer-details-page';
import { TicketingApiService } from './ticketing-api.service';
import { createWalletStoryTicket } from '../wallet/testing/wallet-story-fixtures';

describe('TicketTransferDetailsPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows automatic-ignore status when eligibility changes during acceptance', async () => {
    const transfer = createTicketStoryTransfer();
    const ignored = {
      ...transfer,
      recipientStatus: 'SYSTEM_INELIGIBLE' as const,
      ignoreReason: 'INELIGIBLE' as const,
      canAccept: false,
    };
    const navigate = vi.fn(() => Promise.resolve(true));
    const component = Object.create(TicketTransferDetailsPage.prototype) as unknown as {
      api: { acceptTicketTransfer: ReturnType<typeof vi.fn> };
      destroyRef: { onDestroy(callback: () => void): () => void };
      isAccepting: ReturnType<typeof signal<boolean>>;
      requestId: number;
      router: { navigate: ReturnType<typeof vi.fn> };
      snackBar: { open: ReturnType<typeof vi.fn> };
      state: ReturnType<typeof signal<{ status: 'ready'; transfer: typeof transfer }>>;
      accept(value: typeof transfer): void;
    };
    component.api = { acceptTicketTransfer: vi.fn(() => of(ignored)) };
    component.destroyRef = { onDestroy: () => () => undefined };
    component.isAccepting = signal(true);
    component.requestId = 0;
    component.router = { navigate };
    component.snackBar = { open: vi.fn() };
    component.state = signal({ status: 'ready', transfer });

    component.accept(transfer);

    await vi.waitFor(() => expect(component.state().transfer.recipientStatus).toBe('SYSTEM_INELIGIBLE'));
    expect(navigate).not.toHaveBeenCalled();
    expect(component.isAccepting()).toBe(false);
  });

  it('keeps cancellation unavailable for a holder when an administrator authored the request', async () => {
    const transfer = createTicketStoryTransfer({ recipient: null, initiatedByAdmin: true, canCancel: false });
    TestBed.configureTestingModule({
      imports: [TicketTransferDetailsPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ transferId: transfer.id }) }, paramMap: of(convertToParamMap({ transferId: transfer.id })) } },
        { provide: TicketingApiService, useValue: { ticketTransfer: () => of(transfer), watchCurrentUser: () => of() } },
        { provide: AuthService, useValue: { user: () => ({ sub: 'holder-user', claims: {} }) } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(TicketTransferDetailsPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.canCancel()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Cancelar pedido');
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('disables receipt after expiry while the transfer page remains open', async () => {
    vi.useFakeTimers();
    const ticket = createWalletStoryTicket({
      effectiveExpiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    const transfer = createTicketStoryTransfer({ ticket });

    await TestBed.configureTestingModule({
      imports: [TicketTransferDetailsPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ transferId: transfer.id }) },
            paramMap: of(convertToParamMap({ transferId: transfer.id })),
          },
        },
        { provide: TicketingApiService, useValue: { ticketTransfer: () => of(transfer), watchCurrentUser: () => of() } },
        { provide: AuthService, useValue: { user: () => ({ sub: 'recipient-user', claims: { name: 'João' } }) } },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(false) }) } },
        { provide: MatSnackBar, useValue: { open: () => undefined } },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<TicketTransferDetailsPage> = TestBed.createComponent(TicketTransferDetailsPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Receber bilhete');

    await vi.advanceTimersByTimeAsync(1000);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('Este bilhete expirou. Não é possível recebê-lo ou transferi-lo.');
    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
