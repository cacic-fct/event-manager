import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  PUBLIC_CALENDAR_EVENTS_QUERY,
  type EventType,
  type GraphqlResponse,
  type GraphqlVariables,
  type PublicCalendarEventsQuery,
  type PublicCalendarEventsQueryVariables,
  type PublicEvent,
} from '@cacic-fct/event-manager-public-contracts';
import { Observable, map } from 'rxjs';

export type CalendarEventTypeFilter = EventType | 'ALL';

export interface CalendarEventFilters {
  query: string;
  eventType: CalendarEventTypeFilter;
  startDateFrom: string;
  startDateUntil?: string;
}

interface CurrentUserSubscribedItem {
  event?: { id: string } | null;
  events?: Array<{ id: string }> | null;
}

@Injectable({ providedIn: 'root' })
export class CalendarApiService {
  private readonly http = inject(HttpClient);

  getCalendarEvents(filters: CalendarEventFilters): Observable<PublicEvent[]> {
    const variables: PublicCalendarEventsQueryVariables = {
      query: filters.query || null,
      eventType: filters.eventType === 'ALL' ? null : filters.eventType,
      startDateFrom: filters.startDateFrom,
      startDateUntil: filters.startDateUntil ?? null,
    };

    return this.query<PublicCalendarEventsQuery>(
      PUBLIC_CALENDAR_EVENTS_QUERY,
      variables,
    ).pipe(map((data) => data.publicCalendarEvents));
  }

  getCurrentUserSubscribedEventIds(): Observable<Set<string>> {
    return this.query<{
      currentUserSubscribedItems: CurrentUserSubscribedItem[];
      currentUserMajorEventSubscriptions: Array<{ selectedEvents?: Array<{ id: string }> | null }>;
    }>(
      `
        query CurrentUserCalendarSubscribedEvents {
          currentUserSubscribedItems {
            ... on SubscribedSingleEventItem {
              event {
                id
              }
            }
            ... on SubscribedEventGroupItem {
              events {
                id
              }
            }
          }
          currentUserMajorEventSubscriptions {
            selectedEvents {
              id
            }
          }
        }
      `,
    ).pipe(
      map((data) => {
        const eventIds = new Set<string>();

        for (const item of data.currentUserSubscribedItems) {
          if (item.event) {
            eventIds.add(item.event.id);
          }

          for (const event of item.events ?? []) {
            eventIds.add(event.id);
          }
        }

        for (const subscription of data.currentUserMajorEventSubscriptions) {
          for (const event of subscription.selectedEvents ?? []) {
            eventIds.add(event.id);
          }
        }

        return eventIds;
      }),
    );
  }

  private query<TData>(query: string, variables?: GraphqlVariables): Observable<TData> {
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
