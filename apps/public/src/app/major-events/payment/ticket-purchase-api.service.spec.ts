import { HttpEventType } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TicketPurchaseApiService } from './ticket-purchase-api.service';

describe('TicketPurchaseApiService', () => {
  let service: TicketPurchaseApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(TicketPurchaseApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads ticket offers only through the server-filtered subscription query', async () => {
    const result = service.getOptions('major-1').toPromise();
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('myTicketPurchaseOptions');
    expect(request.request.body.variables).toEqual({ majorEventId: 'major-1' });
    request.flush({ data: { myTicketPurchaseOptions: [] } });
    await expect(result).resolves.toEqual([]);
  });

  it('creates the purchase request only with the successful receipt upload', () => {
    const file = new File(['payment receipt'], 'receipt.pdf', { type: 'application/pdf' });
    const received: unknown[] = [];
    service.uploadReceipt('event-1', 'ticket-config-1', 2500, file).subscribe((event) => received.push(event));

    const request = http.expectOne('/api/ticket-purchases/event-1/receipt');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.get('ticketConfigId')).toBe('ticket-config-1');
    expect(request.request.body.get('expectedAmountCents')).toBe('2500');
    expect(received).toEqual([]);

    request.flush({
      id: 'receipt-1',
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      imageUrl: '/api/ticket-purchases/purchase-1/receipt',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      processingStatus: 'PENDING',
      purchaseId: 'purchase-1',
    });

    expect(received).toEqual([
      {
        type: 'done',
        result: expect.objectContaining({ purchaseId: 'purchase-1' }),
      },
    ]);
  });

  it('reports receipt upload progress before success is persisted', () => {
    const file = new File(['receipt'], 'receipt.png', { type: 'image/png' });
    const received: unknown[] = [];
    service.uploadReceipt('event-1', 'config-1', 1200, file).subscribe((event) => received.push(event));
    const request = http.expectOne('/api/ticket-purchases/event-1/receipt');

    request.event({ type: HttpEventType.UploadProgress, loaded: 30, total: 60 });

    expect(received).toEqual([{ type: 'progress', progress: 50 }]);
    request.flush({
      id: 'receipt-2',
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      imageUrl: '/api/ticket-purchases/purchase-2/receipt',
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      processingStatus: 'PENDING',
      purchaseId: 'purchase-2',
    });
  });
});
