import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { PLATFORM_ID, Service, inject } from '@angular/core';
import { watchRecoveringReplayableEventSource } from '@cacic-fct/shared-angular';
import type {
  TicketRealtimeInvalidation,
  TicketTransfer,
  TicketTransferLists,
  WalletTicket,
} from '@cacic-fct/shared-ticketing';
import { EMPTY, map, merge, Observable, Subject, tap } from 'rxjs';
import { graphqlError } from '../../shared/rate-limit-error';

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

const WALLET_TICKET_FIELDS = `
  id
  eventId
  name
  emoji
  description
  transferEligibilityDescription
  status
  transferable
  effectiveExpiresAt
  aztecPayload
  event { id name emoji type startsAt endsAt locationDescription publicUrl }
  holder { personId fullName firstName avatarUrl redactedIdentityDocument }
`;

const TICKET_TRANSFER_FIELDS = `
  id
  senderStatus
  recipientStatus
  submittedDestinationIdentityDocument
  ignoreReason
  initiatedByAdmin
  initiatingAdmin { personId firstName avatarUrl }
  createdAt
  updatedAt
  expiresFromListAt
  canCancel
  canAccept
  event { id name emoji type startsAt endsAt locationDescription publicUrl }
  sender { personId fullName firstName avatarUrl redactedIdentityDocument }
  recipient { personId fullName firstName avatarUrl redactedIdentityDocument }
  ticket { ${WALLET_TICKET_FIELDS} }
`;

@Service()
export class TicketingApiService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  myWalletTickets(): Observable<WalletTicket[]> {
    return this.query<{ myWalletTickets: WalletTicket[] }>(`
      query MyWalletTickets {
        myWalletTickets { ${WALLET_TICKET_FIELDS} }
      }
    `).pipe(map((data) => data.myWalletTickets));
  }

  myWalletTicket(ticketId: string): Observable<WalletTicket | null> {
    return this.query<{ myWalletTicket: WalletTicket | null }>(
      `query MyWalletTicket($ticketId: String!) {
        myWalletTicket(ticketId: $ticketId) { ${WALLET_TICKET_FIELDS} }
      }`,
      { ticketId },
    ).pipe(map((data) => data.myWalletTicket));
  }

  myTicketTransfers(): Observable<TicketTransferLists> {
    return this.query<{ myTicketTransfers: TicketTransferLists }>(`
      query MyTicketTransfers {
        myTicketTransfers {
          incomingPending { ${TICKET_TRANSFER_FIELDS} }
          incomingIgnored { ${TICKET_TRANSFER_FIELDS} }
          outgoing { ${TICKET_TRANSFER_FIELDS} }
        }
      }
    `).pipe(map((data) => data.myTicketTransfers));
  }

  ticketTransfer(transferId: string): Observable<TicketTransfer | null> {
    return this.query<{ ticketTransfer: TicketTransfer | null }>(
      `query TicketTransfer($transferId: String!) {
        ticketTransfer(transferId: $transferId) { ${TICKET_TRANSFER_FIELDS} }
      }`,
      { transferId },
    ).pipe(map((data) => data.ticketTransfer));
  }

  startTicketTransfer(ticketId: string, destinationIdentityDocument: string): Observable<TicketTransfer> {
    return this.query<{ startTicketTransfer: TicketTransfer }>(
      `mutation StartTicketTransfer($ticketId: String!, $destinationIdentityDocument: String!) {
        startTicketTransfer(ticketId: $ticketId, destinationIdentityDocument: $destinationIdentityDocument) {
          ${TICKET_TRANSFER_FIELDS}
        }
      }`,
      { ticketId, destinationIdentityDocument },
    ).pipe(map((data) => data.startTicketTransfer));
  }

  cancelTicketTransfer(transferId: string): Observable<TicketTransfer> {
    return this.transferMutation('cancelTicketTransfer', transferId);
  }

  acceptTicketTransfer(transferId: string): Observable<TicketTransfer> {
    return this.transferMutation('acceptTicketTransfer', transferId);
  }

  ignoreTicketTransfer(transferId: string): Observable<TicketTransfer> {
    return this.transferMutation('ignoreTicketTransfer', transferId);
  }

  watchCurrentUser(): Observable<TicketRealtimeInvalidation> {
    if (!this.isBrowser || typeof EventSource === 'undefined') return EMPTY;

    return new Observable<TicketRealtimeInvalidation>((subscriber) => {
      const recoveredInvalidations = new Subject<TicketRealtimeInvalidation>();
      const stream = watchRecoveringReplayableEventSource('/api/current-user/tickets/realtime/events', {
        decode: decodeTicketRealtimeInvalidation,
        errorMessage: 'Não foi possível acompanhar seus bilhetes em tempo real.',
        retryDelayMs: 1000,
        retryMaxDelayMs: 30_000,
        recover: () =>
          this.recoverTicketState().pipe(
            tap(() => {
              const changedAt = new Date().toISOString();
              const revision = `recovery-${Date.now()}`;
              for (const type of ['TICKETS_CHANGED', 'TRANSFERS_CHANGED', 'PURCHASES_CHANGED'] as const) {
                recoveredInvalidations.next({ revision, type, changedAt });
              }
            }),
          ),
      });
      const subscription = merge(stream, recoveredInvalidations).subscribe(subscriber);

      return () => {
        subscription.unsubscribe();
        recoveredInvalidations.complete();
      };
    });
  }

  private recoverTicketState(): Observable<unknown> {
    return this.query<{
      myWalletTickets: Array<{ id: string }>;
      myTicketTransfers: {
        incomingPending: Array<{ id: string }>;
        incomingIgnored: Array<{ id: string }>;
        outgoing: Array<{ id: string }>;
      };
    }>(`
      query TicketRealtimeRecoverySnapshot {
        myWalletTickets { id }
        myTicketTransfers {
          incomingPending { id }
          incomingIgnored { id }
          outgoing { id }
        }
      }
    `);
  }

  private transferMutation(operationName: string, transferId: string): Observable<TicketTransfer> {
    return this.query<{ [key: string]: TicketTransfer }>(
      `mutation ${operationName}($transferId: String!) {
        ${operationName}(transferId: $transferId) { ${TICKET_TRANSFER_FIELDS} }
      }`,
      { transferId },
    ).pipe(map((data) => data[operationName]));
  }

  private query<TData>(query: string, variables?: Record<string, unknown>): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query, variables }).pipe(
      map((response) => {
        if (response.errors?.length) throw graphqlError(response.errors);
        if (!response.data) throw new Error('Resposta GraphQL sem dados.');
        return response.data;
      }),
    );
  }
}

function decodeTicketRealtimeInvalidation(event: MessageEvent<string>): TicketRealtimeInvalidation | null {
  try {
    const value: unknown = JSON.parse(event.data);
    if (!isRecord(value)) return null;

    const type = value['type'];
    if (
      (type !== 'TICKETS_CHANGED' && type !== 'TRANSFERS_CHANGED' && type !== 'PURCHASES_CHANGED') ||
      typeof value['revision'] !== 'string' ||
      typeof value['changedAt'] !== 'string'
    ) {
      return null;
    }

    return value as TicketRealtimeInvalidation;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
