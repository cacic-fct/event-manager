import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { decodeTypedSseEvent, watchReplayableEventSource } from '@cacic-fct/shared-angular';
import { Observable, map } from 'rxjs';
import type {
  ReceiptRejectionCode,
  ReceiptValidationEvent,
  ReceiptValidationQueue,
  ReceiptValidationQueueItem,
  ReceiptValidationResult,
} from '@cacic-fct/event-manager-admin-contracts';
import { GraphqlHttpService } from './graphql-http.service';

export type {
  ReceiptRejectionCode,
  ReceiptValidationEvent,
  ReceiptValidationQueue,
  ReceiptValidationQueueItem,
  ReceiptValidationResult,
};

@Service()
export class ReceiptValidationApiService {
  private readonly http = inject(HttpClient);
  private readonly graphqlHttp = inject(GraphqlHttpService);

  getPendingCount(): Observable<{ pendingCount: number }> {
    return this.graphqlHttp
      .request<{ adminReceiptPendingValidationCount: { pendingCount: number } }>(
        `query AdminReceiptPendingValidationCount {
          adminReceiptPendingValidationCount {
            pendingCount
          }
        }`,
      )
      .pipe(map((data) => data.adminReceiptPendingValidationCount));
  }

  getQueue(majorEventId?: string): Observable<ReceiptValidationQueue> {
    return this.graphqlHttp
      .request<{ adminReceiptValidationQueue: ReceiptValidationQueue }>(
        `query AdminReceiptValidationQueue($majorEventId: String) {
          adminReceiptValidationQueue(majorEventId: $majorEventId) {
            ${RECEIPT_VALIDATION_QUEUE_FIELDS}
          }
        }`,
        { majorEventId },
      )
      .pipe(map((data) => normalizeReceiptValidationQueue(data.adminReceiptValidationQueue)));
  }

  watchQueue(majorEventId?: string): Observable<ReceiptValidationQueue> {
    const queryString = majorEventId ? `?majorEventId=${encodeURIComponent(majorEventId)}` : '';
    return watchReplayableEventSource(`/api/major-event-receipts/admin/queue/events${queryString}`, {
      decode: (event) =>
        decodeTypedSseEvent<ReceiptValidationQueue, 'queue'>(event, 'receipt-validation-queue', 'queue'),
      errorMessage: 'Não foi possível acompanhar a fila de comprovantes.',
    }).pipe(map((queue) => normalizeReceiptValidationQueue(queue)));
  }

  approve(subscriptionId: string, receiptId: string, selectedEventIds?: string[]): Observable<ReceiptValidationResult> {
    return this.graphqlHttp
      .request<{ approveAdminReceipt: ReceiptValidationResult }>(
        `mutation ApproveAdminReceipt($input: ApproveReceiptInput!) {
          approveAdminReceipt(input: $input) {
            ${RECEIPT_VALIDATION_RESULT_FIELDS}
          }
        }`,
        { input: { subscriptionId, receiptId, selectedEventIds } },
      )
      .pipe(map((data) => data.approveAdminReceipt));
  }

  reject(
    subscriptionId: string,
    receiptId: string | undefined,
    rejectionCode: ReceiptRejectionCode,
    reason?: string,
  ): Observable<ReceiptValidationResult> {
    return this.graphqlHttp
      .request<{ rejectAdminReceipt: ReceiptValidationResult }>(
        `mutation RejectAdminReceipt($input: RejectReceiptInput!) {
          rejectAdminReceipt(input: $input) {
            ${RECEIPT_VALIDATION_RESULT_FIELDS}
          }
        }`,
        {
          input: {
            subscriptionId,
            receiptId,
            rejectionCode,
            reason,
          },
        },
      )
      .pipe(map((data) => data.rejectAdminReceipt));
  }

  undo(actionId: string): Observable<ReceiptValidationQueueItem> {
    return this.graphqlHttp
      .request<{ undoAdminReceiptValidationAction: ReceiptValidationQueueItem }>(
        `mutation UndoAdminReceiptValidationAction($actionId: String!) {
          undoAdminReceiptValidationAction(actionId: $actionId) {
            ${RECEIPT_VALIDATION_QUEUE_ITEM_FIELDS}
          }
        }`,
        { actionId },
      )
      .pipe(map((data) => data.undoAdminReceiptValidationAction));
  }

  approveTicketPurchase(purchaseId: string): Observable<boolean> {
    return this.graphqlHttp
      .request<{ approveTicketPurchase: boolean }>(
        `mutation ApproveTicketPurchase($purchaseId: String!) {
          approveTicketPurchase(purchaseId: $purchaseId)
        }`,
        { purchaseId },
      )
      .pipe(map((data) => data.approveTicketPurchase));
  }

  rejectTicketPurchase(purchaseId: string, reason: string): Observable<boolean> {
    return this.graphqlHttp
      .request<{ rejectTicketPurchase: boolean }>(
        `mutation RejectTicketPurchase($purchaseId: String!, $reason: String!) {
          rejectTicketPurchase(purchaseId: $purchaseId, reason: $reason)
        }`,
        { purchaseId, reason },
      )
      .pipe(map((data) => data.rejectTicketPurchase));
  }
}

function normalizeReceiptValidationQueue(queue: ReceiptValidationQueue): ReceiptValidationQueue {
  return {
    ...queue,
    pendingCount: Number.isFinite(queue?.pendingCount) ? queue.pendingCount : 0,
    subscriptionCount: Number.isFinite(queue?.subscriptionCount)
      ? queue.subscriptionCount
      : (Array.isArray(queue?.items) ? queue.items.filter((item) => item.category !== 'TICKET').length : 0),
    ticketCount: Number.isFinite(queue?.ticketCount)
      ? queue.ticketCount
      : (Array.isArray(queue?.items) ? queue.items.filter((item) => item.category === 'TICKET').length : 0),
    availablePaymentTiers: Array.isArray(queue?.availablePaymentTiers) ? queue.availablePaymentTiers : [],
    items: Array.isArray(queue?.items)
      ? queue.items.map((item) => ({
          ...item,
          events: Array.isArray(item.events) ? item.events : [],
        }))
      : [],
  };
}

const RECEIPT_VALIDATION_EVENT_FIELDS = `
  id
  name
  emoji
  type
  startDate
  endDate
  locationDescription
  slots
  slotsAvailable
  eventGroupId
  eventGroupName
  preferenceOrder
  autoSubscribe
  selectedForConfirmation
  hasScheduleConflict
  hasNoSlots
`;

const RECEIPT_VALIDATION_QUEUE_ITEM_FIELDS = `
  category
  subscriptionId
  purchaseId
  ticketName
  majorEventId
  majorEventName
  majorEventCreatedAt
  majorEventEndDate
  personId
  personName
  personEmail
  personPhone
  amountPaid
  paymentTier
  subscriptionFlow
  desiredCourses
  desiredLectures
  desiredUncategorized
  subscriptionStatus
  subscriptionUpdatedAt
  subscriptionCreatedAt
  receiptRejectionReason
  receipt {
    id
    fileName
    mimeType
    sizeBytes
    uploadedAt
    expiresAt
    imageUrl
    processingStatus
    ocrText
    amountMatched
    matchedAmountText
    nameMatched
    matchedNameText
  }
  events {
    ${RECEIPT_VALIDATION_EVENT_FIELDS}
  }
`;

const RECEIPT_VALIDATION_QUEUE_FIELDS = `
  pendingCount
  subscriptionCount
  ticketCount
  availablePaymentTiers {
    id
    name
  }
  items {
    ${RECEIPT_VALIDATION_QUEUE_ITEM_FIELDS}
  }
`;

const RECEIPT_VALIDATION_RESULT_FIELDS = `
  actionId
  item {
    ${RECEIPT_VALIDATION_QUEUE_ITEM_FIELDS}
  }
`;
