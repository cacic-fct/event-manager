import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CurrentUserMajorEventSubscription, PublicEvent, PublicMajorEvent } from '@cacic-fct/shared-utils';
import { Observable, map } from 'rxjs';

export interface PublicEventSubscriptionSummary {
  eventId: string;
  slots?: number | null;
  availableSlots?: number | null;
  hasAvailableSlots: boolean;
  queueCount: number;
}

export interface PublicMajorEventSubscriptionPage {
  majorEvent: PublicMajorEvent;
  events: PublicEvent[];
  subscriptionSummaries: PublicEventSubscriptionSummary[];
}

type GraphqlVariable =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly string[];
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
  emoji
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
  slotsAvailable
  queueCount
  autoSubscribe
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

const SUBSCRIPTION_SUMMARY_FIELDS = `
  eventId
  slots
  availableSlots
  hasAvailableSlots
  queueCount
`;

@Injectable({ providedIn: 'root' })
export class MajorEventSubscriptionApiService {
  private readonly http = inject(HttpClient);

  getSubscriptionPage(
    majorEventId: string,
  ): Observable<PublicMajorEventSubscriptionPage> {
    return this.query<{
      publicMajorEventSubscriptionPage: PublicMajorEventSubscriptionPage;
    }>(
      `
        query PublicMajorEventSubscriptionPage($majorEventId: String!) {
          publicMajorEventSubscriptionPage(majorEventId: $majorEventId) {
            majorEvent {
              ${PUBLIC_MAJOR_EVENT_FIELDS}
            }
            events {
              ${PUBLIC_EVENT_FIELDS}
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

  getCurrentUserSubscription(
    majorEventId: string,
  ): Observable<CurrentUserMajorEventSubscription | null> {
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
              ${PUBLIC_MAJOR_EVENT_FIELDS}
            }
            selectedEvents {
              ${PUBLIC_EVENT_FIELDS}
            }
            notSubscribedEvents {
              ${PUBLIC_EVENT_FIELDS}
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
  ): Observable<CurrentUserMajorEventSubscription> {
    return this.query<{
      upsertCurrentUserMajorEventSubscription: CurrentUserMajorEventSubscription;
    }>(
      `
        mutation UpsertCurrentUserMajorEventSubscription(
          $majorEventId: String!
          $selectedEventIds: [String!]!
        ) {
          upsertCurrentUserMajorEventSubscription(
            input: {
              majorEventId: $majorEventId
              selectedEventIds: $selectedEventIds
            }
          ) {
            id
            majorEventId
            subscriptionStatus
            majorEvent {
              ${PUBLIC_MAJOR_EVENT_FIELDS}
            }
            selectedEvents {
              ${PUBLIC_EVENT_FIELDS}
            }
            notSubscribedEvents {
              ${PUBLIC_EVENT_FIELDS}
            }
          }
        }
      `,
      { majorEventId, selectedEventIds },
    ).pipe(map((data) => data.upsertCurrentUserMajorEventSubscription));
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
