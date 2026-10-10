import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { EMPTY, of } from 'rxjs';
import { createWalletStoryTicket } from '../wallet/testing/wallet-story-fixtures';
import { TicketingApiService } from './ticketing-api.service';
import { TicketDetailsPage } from './ticket-details-page';

describe('TicketDetailsPage', () => {
  afterEach(() => vi.useRealTimers());

  it('shows disabled tickets as unavailable without a barcode or transfer action', async () => {
    const ticket = createWalletStoryTicket({ status: 'UNAVAILABLE', transferable: false, aztecPayload: null });
    await TestBed.configureTestingModule({
      imports: [TicketDetailsPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: {
          snapshot: { paramMap: convertToParamMap({ ticketId: ticket.id }) },
          paramMap: of(convertToParamMap({ ticketId: ticket.id })),
        } },
        { provide: TicketingApiService, useValue: { myWalletTicket: () => of(ticket), watchCurrentUser: () => EMPTY } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TicketDetailsPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Indisponível');
    expect(fixture.nativeElement.querySelector('a[mat-flat-button]')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-wallet-barcode')).toBeNull();
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('routes a ticket that is not owned by the current user to shared not found', async () => {
    await TestBed.configureTestingModule({
      imports: [TicketDetailsPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ ticketId: 'private-ticket' }) },
            paramMap: of(convertToParamMap({ ticketId: 'private-ticket' })),
          },
        },
        { provide: TicketingApiService, useValue: { myWalletTicket: () => of(null), watchCurrentUser: () => EMPTY } },
      ],
    }).compileComponents();
    const routeErrors = TestBed.inject(RouteErrorService);
    vi.spyOn(routeErrors, 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(TicketDetailsPage);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(routeErrors.navigate).toHaveBeenCalledWith(404);
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('removes the transfer action at effective expiry without waiting for an SSE update', async () => {
    vi.useFakeTimers();
    const ticket = createWalletStoryTicket({
      effectiveExpiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    const api = { myWalletTicket: vi.fn(() => of(ticket)), watchCurrentUser: () => EMPTY };

    await TestBed.configureTestingModule({
      imports: [TicketDetailsPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ ticketId: ticket.id }) },
            paramMap: of(convertToParamMap({ ticketId: ticket.id })),
          },
        },
        { provide: TicketingApiService, useValue: api },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<TicketDetailsPage> = TestBed.createComponent(TicketDetailsPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[mat-flat-button]')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(1000);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[mat-flat-button]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Expirado');
    expect(api.myWalletTicket).toHaveBeenCalledTimes(2);
    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
