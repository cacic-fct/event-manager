import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CurrentUserEventAttendance, CurrentUserEventSubscription, PublicEvent } from '@cacic-fct/shared-utils';
import { Observable, map } from 'rxjs';

export interface PublicEventWeather {
  eventId: string;
  temperature: number;
  weatherCode: number;
  summary: string;
  materialIcon: string;
  forecastTime: string;
  fetchedAt: string;
  attribution: string;
}

export interface PublicEventSubscriptionSummary {
  eventId: string;
  hasAvailableSlots: boolean;
}

export interface EventPageData {
  event: PublicEvent;
  subscriptionSummary: PublicEventSubscriptionSummary;
  weather: PublicEventWeather | null;
  currentUserSubscription: CurrentUserEventSubscription | null;
  currentUserAttendance: CurrentUserEventAttendance | null;
}

export type GraphqlVariable = string | number | boolean | null | undefined | readonly string[];
type GraphqlVariables = Record<string, GraphqlVariable>;

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

const PUBLIC_MAJOR_EVENT_FIELDS = `
  id
  name
  subscriptionStartDate
  subscriptionEndDate
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
    id
    name
  }
  lecturers {
    id
    displayName
    biography
    publishGoogleUserPicture
    googleUserPicture
    email
    whatsapp
  }
`;

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
            ${PUBLIC_EVENT_FIELDS}
          }
          publicEventSubscriptionSummary(eventId: $eventId) {
            eventId
            hasAvailableSlots
          }
          publicEventWeather(eventId: $eventId) {
            eventId
            temperature
            weatherCode
            summary
            materialIcon
            forecastTime
            fetchedAt
            attribution
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
