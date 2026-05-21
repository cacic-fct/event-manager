import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';

export type ReceiptRejectionCode = 'INVALID_RECEIPT' | 'NO_SLOTS' | 'SCHEDULE_CONFLICT' | 'GENERIC';

export interface ReceiptValidationEvent {
  id: string;
  name: string;
  emoji: string;
  type: string;
  startDate: string;
  endDate: string;
  locationDescription?: string | null;
  slots?: number | null;
  slotsAvailable?: number | null;
  eventGroupId?: string | null;
  eventGroupName?: string | null;
  preferenceOrder?: number | null;
  autoSubscribe: boolean;
  selectedForConfirmation: boolean;
  hasScheduleConflict: boolean;
  hasNoSlots: boolean;
}

export interface ReceiptValidationQueueItem {
  subscriptionId: string;
  majorEventId: string;
  majorEventName: string;
  personId: string;
  personName: string;
  personEmail?: string | null;
  personPhone?: string | null;
  amountPaid?: number | null;
  paymentTier?: string | null;
  subscriptionFlow: string;
  desiredCourses?: number | null;
  desiredLectures?: number | null;
  desiredUncategorized?: number | null;
  subscriptionStatus: string;
  subscriptionUpdatedAt: string;
  receiptRejectionReason?: string | null;
  receipt?: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    expiresAt: string;
    imageUrl: string;
    processingStatus: string;
    ocrText?: string | null;
    amountMatched?: boolean | null;
    matchedAmountText?: string | null;
    nameMatched?: boolean | null;
    matchedNameText?: string | null;
  } | null;
  events: ReceiptValidationEvent[];
}

export interface ReceiptValidationQueue {
  pendingCount: number;
  items: ReceiptValidationQueueItem[];
}

export interface ReceiptValidationResult {
  actionId: string;
  item: ReceiptValidationQueueItem;
}

@Injectable({ providedIn: 'root' })
export class ReceiptValidationApiService {
  private readonly http = inject(HttpClient);
  private readonly graphqlHttp = inject(GraphqlHttpService);
  private readonly zone = inject(NgZone);

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

  getQueue(): Observable<ReceiptValidationQueue> {
    return this.graphqlHttp
      .request<{ adminReceiptValidationQueue: ReceiptValidationQueue }>(
        `query AdminReceiptValidationQueue {
          adminReceiptValidationQueue {
            ${RECEIPT_VALIDATION_QUEUE_FIELDS}
          }
        }`,
      )
      .pipe(map((data) => data.adminReceiptValidationQueue));
  }

  watchQueue(): Observable<ReceiptValidationQueue> {
    return new Observable<ReceiptValidationQueue>((subscriber) => {
      const source = new EventSource('/api/major-event-receipts/admin/queue/events', {
        withCredentials: true,
      });

      source.onmessage = (event) => {
        this.zone.run(() => {
          const parsed = JSON.parse(event.data) as {
            type: string;
            queue?: ReceiptValidationQueue;
          };
          if (parsed.type === 'receipt-validation-queue' && parsed.queue) {
            subscriber.next(parsed.queue);
          }
        });
      };
      source.onerror = () => {
        this.zone.run(() => subscriber.error(new Error('Não foi possível acompanhar a fila de comprovantes.')));
        source.close();
      };

      return () => source.close();
    });
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
  subscriptionId
  majorEventId
  majorEventName
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
