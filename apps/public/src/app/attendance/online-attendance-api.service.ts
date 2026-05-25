import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CurrentUserEventAttendance, PublicEvent } from '@cacic-fct/shared-utils';
import { Observable, map } from 'rxjs';

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

interface PendingOnlineAttendanceEvent {
  eventId: string;
  event: PublicEvent;
}

const PUBLIC_MAJOR_EVENT_FIELDS = `
  id
  name
  emoji
  startDate
  endDate
  description
  subscriptionStartDate
  subscriptionEndDate
  maxCoursesPerAttendee
  maxLecturesPerAttendee
  buttonText
  buttonLink
  contactInfo
  contactType
  isPaymentRequired
  additionalPaymentInfo
  shouldIssueCertificate
`;

const PUBLIC_EVENT_GROUP_FIELDS = `
  id
  name
  shouldIssueCertificateForEachEvent
  shouldIssuePartialCertificate
  shouldIssueCertificate
`;

const PUBLIC_EVENT_FIELDS = `
  id
  name
  creditMinutes
  startDate
  endDate
  emoji
  type
  description
  shortDescription
  latitude
  longitude
  locationDescription
  majorEventId
  eventGroupId
  allowSubscription
  subscriptionStartDate
  subscriptionEndDate
  slots
  shouldIssueCertificate
  shouldCollectAttendance
  isOnlineAttendanceAllowed
  onlineAttendanceStartDate
  onlineAttendanceEndDate
  publiclyVisible
  youtubeCode
  buttonText
  buttonLink
  majorEvent {
    ${PUBLIC_MAJOR_EVENT_FIELDS}
  }
  eventGroup {
    ${PUBLIC_EVENT_GROUP_FIELDS}
  }
`;

@Injectable({ providedIn: 'root' })
export class OnlineAttendanceApiService {
  private readonly http = inject(HttpClient);

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

export type { PendingOnlineAttendanceEvent };
