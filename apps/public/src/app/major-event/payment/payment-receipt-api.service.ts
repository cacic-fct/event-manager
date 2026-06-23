import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { TURNSTILE_TOKEN_HEADER } from '@cacic-fct/shared-utils';
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

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

@Injectable({ providedIn: 'root' })
export class PaymentReceiptApiService {
  private readonly http = inject(HttpClient);

  getCurrentReceipt(majorEventId: string): Observable<PaymentReceipt | null> {
    return this.query<{ currentUserMajorEventReceipt: PaymentReceipt | null }>(
      `query CurrentUserMajorEventReceipt($majorEventId: String!) {
        currentUserMajorEventReceipt(majorEventId: $majorEventId) {
          id
          fileName
          mimeType
          sizeBytes
          uploadedAt
          expiresAt
          imageUrl
          processingStatus
          amountMatched
          nameMatched
        }
      }`,
      { majorEventId },
    ).pipe(map((data) => data.currentUserMajorEventReceipt));
  }

  uploadReceipt(majorEventId: string, file: File, turnstileToken: string): Observable<ReceiptUploadEvent> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http
      .post<PaymentReceipt>(`/api/major-event-receipts/major-events/${majorEventId}`, formData, {
        headers: {
          [TURNSTILE_TOKEN_HEADER]: turnstileToken,
        },
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

  private query<TData>(query: string, variables?: Record<string, unknown>): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query, variables }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw new Error(response.errors.map((error) => error.message).join('\n'));
        }

        if (!response.data) {
          throw new Error('Resposta GraphQL sem dados.');
        }

        return response.data;
      }),
    );
  }
}
