import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CurrentUserMajorEventSubscription, PublicEvent, PublicMajorEvent } from '@cacic-fct/shared-utils';
import { Observable, map } from 'rxjs';

export interface PublicEventSubscriptionSummary {
  eventId: string;
  hasAvailableSlots: boolean;
}

export interface PublicMajorEventSubscriptionPage {
  majorEvent: PublicMajorEvent;
  events: PublicEvent[];
  subscriptionSummaries: PublicEventSubscriptionSummary[];
}

type GraphqlVariable = string | number | boolean | null | undefined | readonly string[];
type GraphqlVariables = Record<string, GraphqlVariable>;

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

const PUBLIC_MAJOR_EVENT_CARD_FIELDS = `
  id
  name
  emoji
  startDate
  endDate
  description
  subscriptionStartDate
  subscriptionEndDate
  rankedSubscriptionEnabled
  buttonText
  buttonLink
  isPaymentRequired
`;

const PUBLIC_MAJOR_EVENT_SUBSCRIPTION_FIELDS = `
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
  maxUncategorizedPerAttendee
  rankedSubscriptionEnabled
  isPaymentRequired
  additionalPaymentInfo
  paymentInfo {
    id
    bankName
    agency
    account
    holder
    document
    pixKey
    pixCity
    majorEventId
  }
  majorEventPrices {
    id
    type
    tiers {
      id
      name
      value
    }
  }
`;

const PUBLIC_SUBSCRIPTION_EVENT_FIELDS = `
  id
  name
  startDate
  endDate
  emoji
  type
  shortDescription
  locationDescription
  eventGroupId
  autoSubscribe
  eventGroup {
    id
    name
  }
`;

const SUBSCRIPTION_SUMMARY_FIELDS = `
  eventId
  hasAvailableSlots
`;

@Injectable({ providedIn: 'root' })
export class MajorEventSubscriptionApiService {
  private readonly http = inject(HttpClient);

  listMajorEvents(startDateFrom?: string): Observable<PublicMajorEvent[]> {
    return this.query<{
      publicMajorEvents: PublicMajorEvent[];
    }>(
      `
        query PublicMajorEvents($startDateFrom: DateTime) {
          publicMajorEvents(startDateFrom: $startDateFrom) {
            ${PUBLIC_MAJOR_EVENT_CARD_FIELDS}
          }
        }
      `,
      { startDateFrom },
    ).pipe(map((data) => data.publicMajorEvents));
  }

  listCurrentUserSubscriptions(): Observable<CurrentUserMajorEventSubscription[]> {
    return this.query<{
      currentUserMajorEventSubscriptions: CurrentUserMajorEventSubscription[];
    }>(
      `
        query CurrentUserMajorEventSubscriptions {
          currentUserMajorEventSubscriptions {
            id
            majorEventId
            subscriptionStatus
            amountPaid
            paymentDate
            paymentTier
            majorEvent {
              id
              isPaymentRequired
            }
          }
        }
      `,
    ).pipe(map((data) => data.currentUserMajorEventSubscriptions));
  }

  getSubscriptionPage(majorEventId: string): Observable<PublicMajorEventSubscriptionPage> {
    return this.query<{
      publicMajorEventSubscriptionPage: PublicMajorEventSubscriptionPage;
    }>(
      `
        query PublicMajorEventSubscriptionPage($majorEventId: String!) {
          publicMajorEventSubscriptionPage(majorEventId: $majorEventId) {
            majorEvent {
              ${PUBLIC_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
            }
            events {
              ${PUBLIC_SUBSCRIPTION_EVENT_FIELDS}
            }
            subscriptionSummaries {
              ${SUBSCRIPTION_SUMMARY_FIELDS}
            }
          }
        }
      `,
      { majorEventId },
    ).pipe(map((data) => data.publicMajorEventSubscriptionPage));
  }

  getCurrentUserSubscription(majorEventId: string): Observable<CurrentUserMajorEventSubscription | null> {
    return this.query<{
      currentUserMajorEventSubscription: CurrentUserMajorEventSubscription | null;
    }>(
      `
        query CurrentUserMajorEventSubscription($majorEventId: String!) {
          currentUserMajorEventSubscription(majorEventId: $majorEventId) {
            id
            majorEventId
            subscriptionStatus
            amountPaid
            paymentDate
            paymentTier
            majorEvent {
              ${PUBLIC_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
            }
            selectedEvents {
              ${PUBLIC_SUBSCRIPTION_EVENT_FIELDS}
            }
          }
        }
      `,
      { majorEventId },
    ).pipe(map((data) => data.currentUserMajorEventSubscription));
  }

  upsertSubscription(
    majorEventId: string,
    selectedEventIds: string[],
    paymentTier?: string | null,
  ): Observable<CurrentUserMajorEventSubscription> {
    return this.query<{
      upsertCurrentUserMajorEventSubscription: CurrentUserMajorEventSubscription;
    }>(
      `
        mutation UpsertCurrentUserMajorEventSubscription(
          $majorEventId: String!
          $selectedEventIds: [String!]!
          $paymentTier: String
        ) {
          upsertCurrentUserMajorEventSubscription(
            input: {
              majorEventId: $majorEventId
              selectedEventIds: $selectedEventIds
              paymentTier: $paymentTier
            }
          ) {
            id
            majorEventId
            subscriptionStatus
            amountPaid
            paymentDate
            paymentTier
            majorEvent {
              ${PUBLIC_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
            }
            selectedEvents {
              ${PUBLIC_SUBSCRIPTION_EVENT_FIELDS}
            }
          }
        }
      `,
      { majorEventId, selectedEventIds, paymentTier },
    ).pipe(map((data) => data.upsertCurrentUserMajorEventSubscription));
  }

  upsertRankedSubscription(
    majorEventId: string,
    selectedEventIds: string[],
    desiredCounts: {
      desiredCourses?: number | null;
      desiredLectures?: number | null;
      desiredUncategorized?: number | null;
    },
    paymentTier?: string | null,
  ): Observable<CurrentUserMajorEventSubscription> {
    return this.query<{
      upsertCurrentUserMajorEventSubscription: CurrentUserMajorEventSubscription;
    }>(
      `
        mutation UpsertCurrentUserRankedMajorEventSubscription(
          $majorEventId: String!
          $selectedEventIds: [String!]!
          $desiredCourses: Int
          $desiredLectures: Int
          $desiredUncategorized: Int
          $paymentTier: String
        ) {
          upsertCurrentUserMajorEventSubscription(
            input: {
              majorEventId: $majorEventId
              selectedEventIds: $selectedEventIds
              desiredCourses: $desiredCourses
              desiredLectures: $desiredLectures
              desiredUncategorized: $desiredUncategorized
              paymentTier: $paymentTier
            }
          ) {
            id
            majorEventId
            subscriptionStatus
            amountPaid
            paymentDate
            paymentTier
            majorEvent {
              ${PUBLIC_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
            }
            selectedEvents {
              ${PUBLIC_SUBSCRIPTION_EVENT_FIELDS}
            }
          }
        }
      `,
      { majorEventId, selectedEventIds, ...desiredCounts, paymentTier },
    ).pipe(map((data) => data.upsertCurrentUserMajorEventSubscription));
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
