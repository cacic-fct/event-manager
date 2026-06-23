import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  PUBLIC_EVENT_PAGE_FIELDS,
  PUBLIC_EVENT_SUBSCRIPTION_SUMMARY_FIELDS,
  PUBLIC_EVENT_WEATHER_FIELDS,
  type GraphqlResponse,
  type GraphqlVariables,
  type PublicEvent,
  type PublicEventSubscriptionSummary,
  type PublicEventWeather,
} from '@cacic-fct/event-manager-public-contracts';
import type { CurrentUserEventAttendance, CurrentUserEventSubscription } from '@cacic-fct/shared-utils';
import { Observable, map } from 'rxjs';

export type { PublicEventSubscriptionSummary, PublicEventWeather } from '@cacic-fct/event-manager-public-contracts';

export interface EventPageData {
  event: PublicEvent;
  subscriptionSummary: PublicEventSubscriptionSummary;
  weather: PublicEventWeather | null;
  currentUserSubscription: CurrentUserEventSubscription | null;
  currentUserAttendance: CurrentUserEventAttendance | null;
}

@Injectable({ providedIn: 'root' })
export class EventApiService {
  private readonly http = inject(HttpClient);

  getEventPageData(eventId: string, includeCurrentUser: boolean): Observable<EventPageData> {
    return this.query<{
      publicEvent: PublicEvent;
      publicEventSubscriptionSummary: PublicEventSubscriptionSummary;
      publicEventWeather: PublicEventWeather | null;
      currentUserEventSubscription?: CurrentUserEventSubscription | null;
      currentUserEventAttendance?: CurrentUserEventAttendance | null;
    }>(
      `
        query PublicEventPage($eventId: String!) {
          publicEvent(id: $eventId) {
            ${PUBLIC_EVENT_PAGE_FIELDS}
          }
          publicEventSubscriptionSummary(eventId: $eventId) {
            ${PUBLIC_EVENT_SUBSCRIPTION_SUMMARY_FIELDS}
          }
          publicEventWeather(eventId: $eventId) {
            ${PUBLIC_EVENT_WEATHER_FIELDS}
          }
          ${
            includeCurrentUser
              ? `
          currentUserEventSubscription(eventId: $eventId) {
            eventId
            eventGroupSubscriptionId
            createdAt
            event {
              id
            }
          }
          currentUserEventAttendance(eventId: $eventId) {
            eventId
            attendedAt
          }
          `
              : ''
          }
        }
      `,
      { eventId },
    ).pipe(
      map((data) => ({
        event: data.publicEvent,
        subscriptionSummary: data.publicEventSubscriptionSummary,
        weather: data.publicEventWeather,
        currentUserSubscription: data.currentUserEventSubscription ?? null,
        currentUserAttendance: data.currentUserEventAttendance ?? null,
      })),
    );
  }

  subscribeToEvent(eventId: string): Observable<PublicEvent> {
    return this.query<{ subscribeCurrentUserStandaloneEvent: PublicEvent }>(
      `
        mutation SubscribeCurrentUserStandaloneEvent($eventId: String!) {
          subscribeCurrentUserStandaloneEvent(eventId: $eventId) {
            id
          }
        }
      `,
      { eventId },
    ).pipe(map((data) => data.subscribeCurrentUserStandaloneEvent));
  }

  unsubscribeFromEvent(eventId: string): Observable<PublicEvent> {
    return this.query<{ unsubscribeCurrentUserStandaloneEvent: PublicEvent }>(
      `
        mutation UnsubscribeCurrentUserStandaloneEvent($eventId: String!) {
          unsubscribeCurrentUserStandaloneEvent(eventId: $eventId) {
            id
          }
        }
      `,
      { eventId },
    ).pipe(map((data) => data.unsubscribeCurrentUserStandaloneEvent));
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
          }
        }
      `,
      { eventId, code },
    ).pipe(map((data) => data.confirmCurrentUserOnlineAttendance));
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
