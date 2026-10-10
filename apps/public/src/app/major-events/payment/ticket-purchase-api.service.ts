import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { TicketPurchase, TicketPurchaseOption, TicketPurchaseReceipt } from '@cacic-fct/shared-ticketing';
import { Observable, catchError, filter, map, throwError } from 'rxjs';
import { graphqlError, rateLimitFromHttpError } from '../../shared/rate-limit-error';

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

export type TicketPurchaseReceiptUploadResponse = TicketPurchaseReceipt & { purchaseId: string };
export type TicketPurchaseUploadEvent =
  | { type: 'progress'; progress: number }
  | { type: 'done'; result: TicketPurchaseReceiptUploadResponse };

@Service()
export class TicketPurchaseApiService {
  private readonly http = inject(HttpClient);

  getOptions(majorEventId: string): Observable<TicketPurchaseOption[]> {
    return this.query<{ myTicketPurchaseOptions: TicketPurchaseOption[] }>(
      `query MyTicketPurchaseOptions($majorEventId: String!) {
        myTicketPurchaseOptions(majorEventId: $majorEventId) {
          eventId
          majorEventId
          ticketConfigId
          name
          emoji
          description
          amountCents
          priceTierId
          priceTierName
          expiresAt
          event { id name emoji startDate endDate isPubliclyListed locationDescription }
        }
      }`,
      { majorEventId },
    ).pipe(map((data) => data.myTicketPurchaseOptions));
  }

  getPurchases(majorEventId: string): Observable<TicketPurchase[]> {
    return this.query<{ myTicketPurchases: TicketPurchase[] }>(
      `query MyTicketPurchases($majorEventId: String!) {
        myTicketPurchases(majorEventId: $majorEventId) {
          id
          eventId
          majorEventId
          ticketConfigId
          name
          emoji
          priceTierName
          amountCents
          status
          rejectionReason
          createdAt
          updatedAt
          receipt { id fileName mimeType sizeBytes uploadedAt imageUrl expiresAt processingStatus }
        }
      }`,
      { majorEventId },
    ).pipe(map((data) => data.myTicketPurchases));
  }

  uploadReceipt(
    eventId: string,
    ticketConfigId: string,
    expectedAmountCents: number,
    file: File,
  ): Observable<TicketPurchaseUploadEvent> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('ticketConfigId', ticketConfigId);
    formData.append('expectedAmountCents', expectedAmountCents.toString());

    return this.http
      .post<TicketPurchaseReceiptUploadResponse>(
        `/api/ticket-purchases/${encodeURIComponent(eventId)}/receipt`,
        formData,
        { observe: 'events', reportProgress: true },
      )
      .pipe(
        map((event: HttpEvent<TicketPurchaseReceiptUploadResponse>): TicketPurchaseUploadEvent | null => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? file.size;
            return { type: 'progress', progress: total > 0 ? Math.round((event.loaded / total) * 100) : 0 };
          }

          if (event.type === HttpEventType.Response && event.body) {
            return { type: 'done', result: event.body };
          }

          return null;
        }),
        filter((event): event is TicketPurchaseUploadEvent => event !== null),
        catchError((error: unknown) => throwError(() => rateLimitFromHttpError(error) ?? error)),
      );
  }

  private query<TData>(query: string, variables: Record<string, unknown>): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query, variables }).pipe(
      map((response) => {
        if (response.errors?.length) throw graphqlError(response.errors);
        if (!response.data) throw new Error('Resposta GraphQL sem dados.');
        return response.data;
      }),
    );
  }
}
