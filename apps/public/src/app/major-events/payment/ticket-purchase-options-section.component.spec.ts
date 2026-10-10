import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';
import { createTicketPurchase, createTicketPurchaseOption } from '@cacic-fct/shared-ticketing/testing';
import type { TicketPurchaseOption } from '@cacic-fct/shared-ticketing';
import { AnalyticsService } from '../../analytics/analytics.service';
import { TicketingApiService } from '../../profile/ticketing/ticketing-api.service';
import { TicketPurchaseApiService } from './ticket-purchase-api.service';
import { TicketPurchaseOptionsSectionComponent } from './ticket-purchase-options-section.component';

describe('TicketPurchaseOptionsSectionComponent', () => {
  let fixture: ComponentFixture<TicketPurchaseOptionsSectionComponent>;
  let optionsApi: { getOptions: ReturnType<typeof vi.fn>; getPurchases: ReturnType<typeof vi.fn> };
  let analytics: { trackEvent: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  const option: TicketPurchaseOption = createTicketPurchaseOption({
    eventId: 'party-event',
    majorEventId: 'major-event-1',
    ticketConfigId: 'party-ticket-config',
    event: { id: 'party-event', name: 'Festa de encerramento' },
  });

  beforeEach(async () => {
    optionsApi = { getOptions: vi.fn(() => of([option])), getPurchases: vi.fn(() => of([])) };
    analytics = { trackEvent: vi.fn() };
    router = { navigate: vi.fn(() => Promise.resolve(true)) };

    await TestBed.configureTestingModule({
      imports: [TicketPurchaseOptionsSectionComponent],
      providers: [
        { provide: TicketPurchaseApiService, useValue: optionsApi },
        { provide: TicketingApiService, useValue: { watchCurrentUser: () => EMPTY } },
        { provide: AnalyticsService, useValue: analytics },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketPurchaseOptionsSectionComponent);
    fixture.componentRef.setInput('majorEventId', 'major-event-1');
    fixture.componentRef.setInput('subscriptionStatus', 'CONFIRMED');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('shows the server-filtered price and sends purchase clicks to the shared payment page', () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(fixture.nativeElement.textContent).toContain('25,00');
    expect(fixture.nativeElement.textContent).toContain('Valor para a faixa Estudante');

    button.click();

    expect(analytics.trackEvent).toHaveBeenCalledWith('ticket_purchase_clicked', {
      major_event_id: 'major-event-1',
      event_id: 'party-event',
      ticket_config_id: 'party-ticket-config',
      amount_cents: 2500,
      price_tier_id: 'student-tier',
    });
    expect(router.navigate).toHaveBeenCalledWith(
      ['/major-event', 'major-event-1', 'payment', 'ticket', 'party-event'],
      { queryParams: { ticketConfigId: 'party-ticket-config', expectedAmountCents: 2500 } },
    );
  });

  it('does not query or show ticket offers before the major-event subscription is confirmed', async () => {
    optionsApi.getOptions.mockClear();
    const unconfirmed = TestBed.createComponent(TicketPurchaseOptionsSectionComponent);
    unconfirmed.componentRef.setInput('majorEventId', 'major-event-1');
    unconfirmed.componentRef.setInput('subscriptionStatus', 'RECEIPT_UNDER_REVIEW');
    unconfirmed.detectChanges();
    await unconfirmed.whenStable();

    expect(optionsApi.getOptions).not.toHaveBeenCalled();
    expect(unconfirmed.nativeElement.textContent).not.toContain('Festa de encerramento');
  });

  it('shows fixed pricing without a tier label when no price tier applies', async () => {
    const fixedOption = createTicketPurchaseOption({
      ...option,
      amountCents: 3000,
      priceTierId: null,
      priceTierName: null,
    });
    optionsApi.getOptions.mockReturnValue(of([fixedOption]));
    const fixed = TestBed.createComponent(TicketPurchaseOptionsSectionComponent);
    fixed.componentRef.setInput('majorEventId', 'major-event-1');
    fixed.componentRef.setInput('subscriptionStatus', 'CONFIRMED');
    fixed.detectChanges();
    await fixed.whenStable();

    expect(fixed.nativeElement.textContent).toContain('30,00');
    expect(fixed.nativeElement.textContent).not.toContain('Valor para a faixa');
  });

  it('renders purchase history states and rejection reasons beside still available offers', async () => {
    optionsApi.getPurchases.mockReturnValue(of([
      createTicketPurchase({
        name: 'Ingresso com comprovante rejeitado',
        status: 'REJECTED',
        rejectionReason: 'O comprovante está ilegível.',
      }),
    ]));
    const history = TestBed.createComponent(TicketPurchaseOptionsSectionComponent);
    history.componentRef.setInput('majorEventId', 'major-event-1');
    history.componentRef.setInput('subscriptionStatus', 'CONFIRMED');
    history.detectChanges();
    await history.whenStable();

    expect(history.nativeElement.textContent).toContain('Festa de encerramento');
    expect(history.nativeElement.textContent).toContain('Comprovante rejeitado');
    expect(history.nativeElement.textContent).toContain('O comprovante está ilegível.');
  });

  it('offers a retry after options fail to load', async () => {
    optionsApi.getOptions.mockReset();
    optionsApi.getOptions
      .mockReturnValueOnce(throwError(() => new Error('temporary failure')))
      .mockReturnValue(of([option]));
    const failed = TestBed.createComponent(TicketPurchaseOptionsSectionComponent);
    failed.componentRef.setInput('majorEventId', 'major-event-1');
    failed.componentRef.setInput('subscriptionStatus', 'CONFIRMED');
    failed.detectChanges();
    await failed.whenStable();
    expect(failed.nativeElement.textContent).toContain('Não foi possível carregar os bilhetes adicionais.');

    (failed.nativeElement.querySelector('button') as HTMLButtonElement).click();
    failed.detectChanges();
    await failed.whenStable();
    failed.detectChanges();

    expect(failed.nativeElement.textContent).toContain('Festa de encerramento');
  });
});
