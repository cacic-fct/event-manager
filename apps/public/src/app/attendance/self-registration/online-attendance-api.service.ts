import { PUBLIC_EVENT_PAGE_FIELDS, type PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { isOnlineAttendanceRegistrationOpen, type CurrentUserEventAttendance } from '@cacic-fct/shared-utils';
import { resolveAttendanceEligibility } from '@cacic-fct/shared-event-participation';
import { Observable, map } from 'rxjs';
import { graphqlError } from '../../shared/rate-limit-error';

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

interface PendingOnlineAttendanceEvent {
  eventId: string;
  event: PublicEvent;
}

const PUBLIC_EVENT_FIELDS = `
  id
  name
  startDate
  emoji
  majorEvent {
    id
    name
  }
`;

@Service()
export class OnlineAttendanceApiService {
  private readonly http = inject(HttpClient);

  getWalkInEvent(eventId: string): Observable<PendingOnlineAttendanceEvent | null> {
    return this.query<{ publicEvent: PublicEvent; currentUserEventAttendance: CurrentUserEventAttendance | null }>(`
      query CurrentUserWalkInAttendanceEvent($eventId: String!) {
        publicEvent(id: $eventId) { ${PUBLIC_EVENT_PAGE_FIELDS} }
        currentUserEventAttendance(eventId: $eventId) { eventId attendedAt }
      }
    `, { eventId }).pipe(map(({ publicEvent: event, currentUserEventAttendance }) =>
      event && !currentUserEventAttendance && resolveAttendanceEligibility(event) === 'ANYONE'
        && isOnlineAttendanceRegistrationOpen(event) ? { eventId, event } : null,
    ));
  }

  listPendingEvents(): Observable<PendingOnlineAttendanceEvent[]> {
    return this.query<{
      currentUserPendingOnlineAttendanceEvents: PendingOnlineAttendanceEvent[];
    }>(
      `
        query CurrentUserPendingOnlineAttendanceEvents {
          currentUserPendingOnlineAttendanceEvents {
            eventId
            event {
              ${PUBLIC_EVENT_FIELDS}
            }
          }
        }
      `,
    ).pipe(map((data) => data.currentUserPendingOnlineAttendanceEvents));
  }

  confirmAttendance(eventId: string, code: string): Observable<CurrentUserEventAttendance> {
    return this.query<{
      confirmCurrentUserOnlineAttendance: CurrentUserEventAttendance;
    }>(
      `
        mutation ConfirmCurrentUserOnlineAttendance($eventId: String!, $code: String!) {
          confirmCurrentUserOnlineAttendance(input: { eventId: $eventId, code: $code }) {
            eventId
            attendedAt
            createdAt
          }
        }
      `,
      { eventId, code },
    ).pipe(map((data) => data.confirmCurrentUserOnlineAttendance));
  }

  private query<TData>(query: string, variables?: Record<string, string>): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query, variables }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw graphqlError(response.errors);
        }

        if (!response.data) {
          throw new Error('Resposta GraphQL sem dados.');
        }

        return response.data;
      }),
    );
  }
}

export type { PendingOnlineAttendanceEvent };
