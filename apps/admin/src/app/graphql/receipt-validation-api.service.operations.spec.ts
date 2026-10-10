import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  adminFixtureDateFromNow,
  createAdminEvent,
  createAdminMajorEvent,
  createAdminPerson,
} from '../testing/admin-entity-fixtures';
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
        if (query.includes('ApproveTicketPurchase')) {
          return of({ approveTicketPurchase: true });
        }
        if (query.includes('RejectTicketPurchase')) {
          return of({ rejectTicketPurchase: true });
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
    expect(queueQuery).toContain('availablePaymentTiers');
    expect(queueQuery).toContain('ticketCount');
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

  it('approves a ticket purchase through its own audited action', async () => {
    await expect(firstValueFrom(service.approveTicketPurchase('purchase-1'))).resolves.toBe(true);
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('approveTicketPurchase(purchaseId: $purchaseId)'),
      { purchaseId: 'purchase-1' },
    );
  });

  it('rejects a ticket purchase with the required reviewer reason', async () => {
    await expect(firstValueFrom(service.rejectTicketPurchase('purchase-1', 'Comprovante ilegível'))).resolves.toBe(true);
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('rejectTicketPurchase(purchaseId: $purchaseId, reason: $reason)'),
      { purchaseId: 'purchase-1', reason: 'Comprovante ilegível' },
    );
  });
});

function receiptResultFixture() {
  return { actionId: 'action-1', item: queueFixture().items[0] };
}

function queueFixture() {
  const event = createAdminEvent({ id: 'event-1', name: 'Credenciamento' });
  const majorEvent = createAdminMajorEvent({ id: 'major-1', name: 'Semana' });
  const person = createAdminPerson({ id: 'person-1', name: 'Ada Lovelace', email: 'ada@example.edu' });
  return {
    pendingCount: 1,
    subscriptionCount: 1,
    ticketCount: 0,
    availablePaymentTiers: [{ id: 'tier-student', name: 'Estudante' }],
    items: [
      {
        category: 'SUBSCRIPTION' as const,
        subscriptionId: 'subscription-1',
        majorEventId: 'major-1',
        majorEventName: majorEvent.name,
        majorEventCreatedAt: majorEvent.createdAt,
        majorEventEndDate: majorEvent.endDate,
        personId: person.id,
        personName: person.name,
        personEmail: person.email,
        subscriptionFlow: 'RECEIPT',
        subscriptionStatus: 'PENDING_PAYMENT',
        subscriptionUpdatedAt: adminFixtureDateFromNow(-1, 15),
        subscriptionCreatedAt: adminFixtureDateFromNow(-2, 15),
        receipt: null,
        events: [
          {
            id: 'event-1',
            name: event.name,
            emoji: event.emoji,
            type: 'OTHER',
            startDate: event.startDate,
            endDate: event.endDate,
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
