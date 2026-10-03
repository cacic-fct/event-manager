import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import { createWalletStoryTicket } from '../wallet/testing/wallet-story-fixtures';
import { TicketingApiService } from './ticketing-api.service';
import { TicketDetailsPage } from './ticket-details-page';

describe('TicketDetailsPage', () => {
  afterEach(() => vi.useRealTimers());

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
