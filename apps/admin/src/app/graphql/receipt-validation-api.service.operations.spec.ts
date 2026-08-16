import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { adminFixtureDateFromNow } from '../testing/admin-entity-fixtures';
import { firstValueFrom, of, throwError } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { ReceiptValidationApiService } from './receipt-validation-api.service';

describe('ReceiptValidationApiService operation contracts', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: ReceiptValidationApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('AdminReceiptPendingValidationCount')) {
          return of({ adminReceiptPendingValidationCount: { pendingCount: 3 } });
        }
        if (query.includes('ApproveAdminReceipt')) {
          return of({ approveAdminReceipt: receiptResultFixture() });
        }
        return of({ adminReceiptValidationQueue: queueFixture() });
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        ReceiptValidationApiService,
        { provide: GraphqlHttpService, useValue: graphqlHttp },
      ],
    });

    service = TestBed.inject(ReceiptValidationApiService);
  });

  it('maps the pending count and scoped queue query payloads', async () => {
    const expectedQueue = queueFixture();

    await expect(firstValueFrom(service.getPendingCount())).resolves.toEqual({ pendingCount: 3 });
    await expect(firstValueFrom(service.getQueue('major / 1'))).resolves.toEqual(expectedQueue);

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('query AdminReceiptPendingValidationCount'),
    );
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('query AdminReceiptValidationQueue'),
      { majorEventId: 'major / 1' },
    );

    const queueQuery = graphqlHttp.request.mock.calls[1][0] as string;
    expect(queueQuery).toContain('adminReceiptValidationQueue');
    expect(queueQuery).toContain('subscriptionId');
    expect(queueQuery).toContain('selectedForConfirmation');
  });

  it('passes through GraphQL errors from queue reads', async () => {
    const error = new Error('receipt queue unavailable');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(firstValueFrom(service.getPendingCount())).rejects.toBe(error);
  });

  it('maps approval selections into the receipt mutation payload', async () => {
    const selectedEventIds = ['event-1', 'event-2'];

    await expect(firstValueFrom(service.approve('subscription-1', 'receipt-1', selectedEventIds))).resolves.toEqual(
      receiptResultFixture(),
    );

    expect(graphqlHttp.request).toHaveBeenCalledWith(expect.stringContaining('mutation ApproveAdminReceipt'), {
      input: { subscriptionId: 'subscription-1', receiptId: 'receipt-1', selectedEventIds },
    });
    const mutation = graphqlHttp.request.mock.calls[0][0] as string;
    expect(mutation).toContain('approveAdminReceipt');
    expect(mutation).toContain('actionId');
  });
});

function receiptResultFixture() {
  return { actionId: 'action-1', item: queueFixture().items[0] };
}

function queueFixture() {
  return {
    pendingCount: 1,
    items: [
      {
        subscriptionId: 'subscription-1',
        majorEventId: 'major-1',
        majorEventName: 'Semana',
        majorEventCreatedAt: adminFixtureDateFromNow(-10),
        majorEventEndDate: adminFixtureDateFromNow(2, 21),
        personId: 'person-1',
        personName: 'Ada Lovelace',
        personEmail: 'ada@example.edu',
        subscriptionFlow: 'RECEIPT',
        subscriptionStatus: 'PENDING_PAYMENT',
        subscriptionUpdatedAt: adminFixtureDateFromNow(-1, 15),
        receipt: null,
        events: [
          {
            id: 'event-1',
            name: 'Credenciamento',
            emoji: 'clipboard',
            type: 'OTHER',
            startDate: adminFixtureDateFromNow(1),
            endDate: adminFixtureDateFromNow(1, 14),
            autoSubscribe: false,
            selectedForConfirmation: true,
            hasScheduleConflict: false,
            hasNoSlots: false,
          },
        ],
      },
    ],
  };
}
