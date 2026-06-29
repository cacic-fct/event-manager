import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  PUBLIC_EVENT_PAGE_FIELDS,
  PUBLIC_MAJOR_EVENTS_QUERY,
  PUBLIC_MAJOR_EVENT_CARD_FIELDS,
  PUBLIC_MAJOR_EVENT_SUBSCRIPTION_FIELDS,
  PUBLIC_MAJOR_EVENT_SUBSCRIPTION_PAGE_QUERY,
  PUBLIC_SUBSCRIPTION_EVENT_FIELDS,
  type GraphqlResponse,
  type GraphqlVariables,
  type PublicMajorEventsQuery,
  type PublicMajorEventsQueryVariables,
  type PublicEvent,
  type PublicEventGroup,
  type PublicMajorEvent,
  type PublicMajorEventSubscriptionPage,
  type PublicMajorEventSubscriptionPageQuery,
  type SubmitPublicEventFormResponseInput,
} from '@cacic-fct/event-manager-public-contracts';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { Observable, map } from 'rxjs';
import { graphqlError } from '../../shared/rate-limit-error';

export type { PublicEventSubscriptionSummary, PublicMajorEventSubscriptionPage } from '@cacic-fct/event-manager-public-contracts';

export interface PublicContentGroupPreview {
  previewAt: string;
  expiresAt: string;
  eventGroup: PublicEventGroup;
  events: PublicEvent[];
}

@Injectable({ providedIn: 'root' })
export class MajorEventSubscriptionApiService {
  private readonly http = inject(HttpClient);

  listMajorEvents(startDateFrom?: string): Observable<PublicMajorEvent[]> {
    const variables: PublicMajorEventsQueryVariables = { startDateFrom };
    return this.query<PublicMajorEventsQuery>(PUBLIC_MAJOR_EVENTS_QUERY, variables).pipe(
      map((data) => data.publicMajorEvents),
    );
  }

  getPreviewMajorEvents(previewToken: string): Observable<{ events: PublicMajorEvent[]; expiresAt: string }> {
    return this.query<{
      publicContentPreview: {
        expiresAt: string;
        majorEvent: PublicMajorEvent | null;
      };
    }>(
      `
        query PublicContentPreviewMajorEvent($previewToken: String!) {
          publicContentPreview(previewToken: $previewToken) {
            expiresAt
            majorEvent {
              ${PUBLIC_MAJOR_EVENT_CARD_FIELDS}
            }
          }
        }
      `,
      { previewToken },
    ).pipe(
      map((data) => {
        const majorEvent = data.publicContentPreview.majorEvent;
        if (!majorEvent) {
          throw new Error('Pré-visualização sem grande evento.');
        }

        return {
          events: [majorEvent],
          expiresAt: data.publicContentPreview.expiresAt,
        };
      }),
    );
  }

  getPreviewGroup(previewToken: string): Observable<PublicContentGroupPreview> {
    return this.query<{
      publicContentPreview: PublicContentGroupPreview;
    }>(
      `
        query PublicContentPreviewGroup($previewToken: String!) {
          publicContentPreview(previewToken: $previewToken) {
            previewAt
            expiresAt
            eventGroup {
              id
              name
              emoji
              shouldIssueCertificate
              shouldIssueCertificateForEachEvent
              shouldIssuePartialCertificate
            }
            events {
              ${PUBLIC_EVENT_PAGE_FIELDS}
            }
          }
        }
      `,
      { previewToken },
    ).pipe(
      map((data) => {
        if (!data.publicContentPreview.eventGroup) {
          throw new Error('Pré-visualização sem grupo de eventos.');
        }

        return data.publicContentPreview;
      }),
    );
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
    return this.query<PublicMajorEventSubscriptionPageQuery>(PUBLIC_MAJOR_EVENT_SUBSCRIPTION_PAGE_QUERY, {
      majorEventId,
    }).pipe(map((data) => data.publicMajorEventSubscriptionPage));
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
    formResponses?: SubmitPublicEventFormResponseInput[],
  ): Observable<CurrentUserMajorEventSubscription> {
    return this.query<{
      upsertCurrentUserMajorEventSubscription: CurrentUserMajorEventSubscription;
    }>(
      `
        mutation UpsertCurrentUserMajorEventSubscription(
          $majorEventId: String!
          $selectedEventIds: [String!]!
          $paymentTier: String
          $formResponses: [SubmitEventFormResponseInput!]
        ) {
          upsertCurrentUserMajorEventSubscription(
            input: {
              majorEventId: $majorEventId
              selectedEventIds: $selectedEventIds
              paymentTier: $paymentTier
              formResponses: $formResponses
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
      { majorEventId, selectedEventIds, paymentTier, formResponses },
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
    formResponses?: SubmitPublicEventFormResponseInput[],
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
          $formResponses: [SubmitEventFormResponseInput!]
        ) {
          upsertCurrentUserMajorEventSubscription(
            input: {
              majorEventId: $majorEventId
              selectedEventIds: $selectedEventIds
              desiredCourses: $desiredCourses
              desiredLectures: $desiredLectures
              desiredUncategorized: $desiredUncategorized
              paymentTier: $paymentTier
              formResponses: $formResponses
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
      { majorEventId, selectedEventIds, ...desiredCounts, paymentTier, formResponses },
    ).pipe(map((data) => data.upsertCurrentUserMajorEventSubscription));
  }

  private query<TData>(query: string, variables?: GraphqlVariables): Observable<TData> {
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
