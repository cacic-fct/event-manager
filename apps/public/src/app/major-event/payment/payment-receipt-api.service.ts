import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map } from 'rxjs';

export interface PaymentReceipt {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  expiresAt: string;
  imageUrl: string;
  processingStatus: string;
  amountMatched?: boolean | null;
  nameMatched?: boolean | null;
}

export type ReceiptUploadEvent =
  | { type: 'progress'; progress: number }
  | { type: 'done'; receipt: PaymentReceipt };

@Injectable({ providedIn: 'root' })
export class PaymentReceiptApiService {
  private readonly http = inject(HttpClient);

  getCurrentReceipt(majorEventId: string): Observable<PaymentReceipt | null> {
    return this.http.get<PaymentReceipt | null>(`/api/major-event-receipts/major-events/${majorEventId}/current`);
  }

  uploadReceipt(majorEventId: string, file: File): Observable<ReceiptUploadEvent> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http
      .post<PaymentReceipt>(`/api/major-event-receipts/major-events/${majorEventId}`, formData, {
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        map((event: HttpEvent<PaymentReceipt>): ReceiptUploadEvent | null => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? file.size;
            return {
              type: 'progress',
              progress: total > 0 ? Math.round((event.loaded / total) * 100) : 0,
            };
          }

          if (event.type === HttpEventType.Response && event.body) {
            return {
              type: 'done',
              receipt: event.body,
            };
          }

          return null;
        }),
        filter((event): event is ReceiptUploadEvent => event !== null),
      );
  }
}
