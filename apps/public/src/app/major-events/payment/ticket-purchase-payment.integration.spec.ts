import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { createTicketPurchaseOption, createTicketPurchaseReceipt } from '@cacic-fct/shared-ticketing/testing';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { EMPTY, of } from 'rxjs';
import { AnalyticsService } from '../../analytics/analytics.service';
import { RealtimeInvalidationService } from '../../shared/realtime-invalidation.service';
import { TicketingApiService } from '../../profile/ticketing/ticketing-api.service';
import { MajorEventSubscriptionApiService } from '../registration/subscription-api.service';
import { PaymentReceiptApiService } from './receipt-api.service';
import { PaymentInfo } from './payment-info';

describe('ticket purchase payment integration', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PaymentInfo>;
  let analytics: { trackEvent: ReturnType<typeof vi.fn>; trackMajorEventTransaction: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    analytics = { trackEvent: vi.fn(), trackMajorEventTransaction: vi.fn() };
    snackBar = { open: vi.fn() };
    const dialog = { open: vi.fn(() => ({ afterClosed: () => of(true) })) };
    const majorEventSubscription = {
      id: 'subscription-1',
      majorEventId: 'major-1',
      subscriptionStatus: 'CONFIRMED',
      paymentTier: 'Estudante',
      amountPaid: 10_000,
      majorEvent: {
        id: 'major-1',
        name: 'Congresso de Computação',
        isPaymentRequired: true,
        paymentInfo: null,
        additionalPaymentInfo: null,
        majorEventPrices: [],
      },
    } as unknown as CurrentUserMajorEventSubscription;

    await TestBed.configureTestingModule({
      imports: [PaymentInfo],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ majorEventId: 'major-1', ticketEventId: 'party-event' }),
              queryParamMap: convertToParamMap({ ticketConfigId: 'party-config', expectedAmountCents: '2500' }),
            },
          },
        },
        { provide: MajorEventSubscriptionApiService, useValue: { getCurrentUserSubscription: () => of(majorEventSubscription) } },
        { provide: PaymentReceiptApiService, useValue: { getCurrentReceipt: vi.fn(), uploadReceipt: vi.fn() } },
        {
          provide: RealtimeInvalidationService,
          useValue: { watchCurrentUserData: () => EMPTY, watchCatalog: () => EMPTY },
        },
        { provide: TicketingApiService, useValue: { watchCurrentUser: () => EMPTY } },
        { provide: AnalyticsService, useValue: analytics },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    })
      .overrideProvider(MatDialog, { useValue: dialog })
      .overrideProvider(MatSnackBar, { useValue: snackBar })
      .compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PaymentInfo);
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    TestBed.resetTestingModule();
  });

  it('shows the ticket receipt only after the upload endpoint succeeds', async () => {
    fixture.detectChanges();
    const graphqlRequests = http.match('/api/graphql');
    expect(graphqlRequests).toHaveLength(2);
    const optionsRequest = graphqlRequests.find((request) => request.request.body.query.includes('myTicketPurchaseOptions'));
    const purchasesRequest = graphqlRequests.find((request) => request.request.body.query.includes('myTicketPurchases'));
    expect(optionsRequest).toBeDefined();
    expect(purchasesRequest).toBeDefined();
    optionsRequest?.flush({ data: { myTicketPurchaseOptions: [createTicketPurchaseOption({
      eventId: 'party-event',
      majorEventId: 'major-1',
      ticketConfigId: 'party-config',
      amountCents: 2500,
      priceTierId: 'student-tier',
      priceTierName: 'Estudante',
      event: { id: 'party-event', name: 'Festa de encerramento' },
    })] } });
    purchasesRequest?.flush({ data: { myTicketPurchases: [] } });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('25,00');
    expect(fixture.nativeElement.textContent).toContain('Festa de encerramento');
    expect(fixture.nativeElement.textContent).toContain('A compra só será registrada depois que o envio do comprovante for concluído.');

    const file = new File(['recibo de pagamento'], 'comprovante.pdf', { type: 'application/pdf' });
    const fileInput = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { configurable: true, value: { item: () => file } });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const uploadRequest = http.expectOne('/api/ticket-purchases/party-event/receipt');
    expect(uploadRequest.request.method).toBe('POST');
    expect(uploadRequest.request.body.get('ticketConfigId')).toBe('party-config');
    expect(uploadRequest.request.body.get('expectedAmountCents')).toBe('2500');
    expect(analytics.trackEvent).not.toHaveBeenCalledWith('ticket_purchase_receipt_uploaded', expect.anything());
    expect(http.match('/api/major-event-receipts/major-events/major-1')).toHaveLength(0);

    uploadRequest.flush({
      ...createTicketPurchaseReceipt(),
      id: 'receipt-uploaded',
      imageUrl: '/api/ticket-purchases/purchase-created/receipt',
      purchaseId: 'purchase-created',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Comprovante em análise');
    expect(fixture.nativeElement.textContent).toContain('O comprovante do bilhete foi enviado e está vinculado a esta compra.');
    expect(snackBar.open).toHaveBeenCalledWith('Comprovante enviado. A compra está em análise.', 'OK', { duration: 3500 });
    expect(analytics.trackEvent).toHaveBeenCalledWith('ticket_purchase_receipt_uploaded', {
      major_event_id: 'major-1',
      event_id: 'party-event',
      ticket_config_id: 'party-config',
      purchase_id: 'purchase-created',
      amount_cents: 2500,
    });
  });
});
