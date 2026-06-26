import { HttpEventType, HttpHeaders } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, toArray } from 'rxjs';
import { RateLimitError } from '../../shared/rate-limit-error';
import { PaymentReceiptApiService } from './payment-receipt-api.service';

describe('PaymentReceiptApiService', () => {
  let httpTesting: HttpTestingController;
  let service: PaymentReceiptApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(PaymentReceiptApiService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('loads the current user receipt through GraphQL', async () => {
    const responsePromise = firstValueFrom(service.getCurrentReceipt('major-1'));

    const request = httpTesting.expectOne('/api/graphql');
    expect(String(request.request.body.query)).toContain('currentUserMajorEventReceipt');
    expect(request.request.body.variables).toEqual({ majorEventId: 'major-1' });

    request.flush({
      data: {
        currentUserMajorEventReceipt: receiptFixture(),
      },
    });

    await expect(responsePromise).resolves.toEqual(receiptFixture());
  });

  it('maps multipart upload progress and final receipt response', async () => {
    const file = new File(['receipt'], 'receipt.png', { type: 'image/png' });
    const responsePromise = firstValueFrom(service.uploadReceipt('major-1', file).pipe(toArray()));

    const request = httpTesting.expectOne('/api/major-event-receipts/major-events/major-1');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeInstanceOf(FormData);
    expect(request.request.reportProgress).toBe(true);

    request.event({
      type: HttpEventType.UploadProgress,
      loaded: 4,
      total: 8,
    });
    request.flush(receiptFixture());

    await expect(responsePromise).resolves.toEqual([
      { type: 'progress', progress: 50 },
      { type: 'done', receipt: receiptFixture() },
    ]);
  });

  it('converts receipt upload 429 responses into a cooldown error', async () => {
    const file = new File(['receipt'], 'receipt.png', { type: 'image/png' });
    const responsePromise = firstValueFrom(service.uploadReceipt('major-1', file));

    httpTesting.expectOne('/api/major-event-receipts/major-events/major-1').flush(
      {
        message: 'Too many attempts.',
      },
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: new HttpHeaders({ 'Retry-After': '17' }),
      },
    );

    await expect(responsePromise).rejects.toBeInstanceOf(RateLimitError);
    await expect(responsePromise).rejects.toMatchObject({ retryAfterSeconds: 17 });
  });
});

function receiptFixture() {
  return {
    id: 'receipt-1',
    fileName: 'receipt.png',
    mimeType: 'image/png',
    sizeBytes: 4096,
    uploadedAt: '2026-06-26T12:00:00.000Z',
    expiresAt: '2027-06-26T12:00:00.000Z',
    imageUrl: '/api/major-event-receipts/receipt-1/image',
    processingStatus: 'PENDING',
    amountMatched: null,
    nameMatched: null,
  };
}
