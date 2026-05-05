import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { EventType } from '@cacic-eventos/shared-data-types';
import type { PublicEvent } from '@cacic-eventos/shared-utils';
import { Observable, map } from 'rxjs';

export type CalendarEventTypeFilter = EventType | 'ALL';

export interface CalendarEventFilters {
  query: string;
  eventType: CalendarEventTypeFilter;
  startDateFrom: string;
  startDateTo?: string;
}

type GraphqlVariable = string | number | boolean | null | undefined;
type GraphqlVariables = Record<string, GraphqlVariable>;

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
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
export class CalendarApiService {
  private readonly http = inject(HttpClient);

  getCalendarEvents(filters: CalendarEventFilters): Observable<PublicEvent[]> {
    return this.query<{ publicCalendarEvents: PublicEvent[] }>(
      `
        query PublicCalendarEvents(
          $query: String
          $eventType: EventType
          $startDateFrom: DateTime
          $startDateTo: DateTime
        ) {
          publicCalendarEvents(
            query: $query
            eventType: $eventType
            startDateFrom: $startDateFrom
            startDateTo: $startDateTo
          ) {
            ${PUBLIC_EVENT_FIELDS}
          }
        }
      `,
      {
        query: filters.query || null,
        eventType: filters.eventType === 'ALL' ? null : filters.eventType,
        startDateFrom: filters.startDateFrom,
        startDateTo: filters.startDateTo ?? null,
      },
    ).pipe(map((data) => data.publicCalendarEvents));
  }

  private query<TData>(
    query: string,
    variables?: GraphqlVariables,
  ): Observable<TData> {
    return this.http
      .post<GraphqlResponse<TData>>('/api/graphql', { query, variables })
      .pipe(
        map((response) => {
          if (response.errors?.length) {
            throw new Error(
              response.errors.map((error) => error.message).join('\n'),
            );
          }

          if (!response.data) {
            throw new Error('Resposta GraphQL sem dados.');
          }

          return response.data;
        }),
      );
  }
}
