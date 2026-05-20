import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, inject } from '@angular/core';
import { Observable } from 'rxjs';

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
  private readonly zone = inject(NgZone);

  getPendingCount(): Observable<{ pendingCount: number }> {
    return this.http.get<{ pendingCount: number }>('/api/major-event-receipts/admin/pending-count');
  }

  getQueue(): Observable<ReceiptValidationQueue> {
    return this.http.get<ReceiptValidationQueue>('/api/major-event-receipts/admin/queue');
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
    return this.http.post<ReceiptValidationResult>(
      `/api/major-event-receipts/admin/subscriptions/${subscriptionId}/approve`,
      { receiptId, ...(selectedEventIds ? { selectedEventIds } : {}) },
    );
  }

  reject(
    subscriptionId: string,
    receiptId: string | undefined,
    rejectionCode: ReceiptRejectionCode,
    reason?: string,
  ): Observable<ReceiptValidationResult> {
    return this.http.post<ReceiptValidationResult>(
      `/api/major-event-receipts/admin/subscriptions/${subscriptionId}/reject`,
      {
        ...(receiptId ? { receiptId } : {}),
        rejectionCode,
        reason,
      },
    );
  }

  undo(actionId: string): Observable<ReceiptValidationQueueItem> {
    return this.http.post<ReceiptValidationQueueItem>(
      `/api/major-event-receipts/admin/actions/${actionId}/undo`,
      {},
    );
  }
}
