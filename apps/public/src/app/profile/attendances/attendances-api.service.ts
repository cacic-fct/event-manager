import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  Certificate,
  CertificateDownload,
  CertificateScope,
  CertificateTarget,
  CurrentUserEventAttendance,
  CurrentUserEventGroupSubscription,
  CurrentUserEventSubscription,
  CurrentUserMajorEventFeedItem,
  CurrentUserMajorEventSubscription,
  EventDetails,
  EventGroupDetails,
  MajorEventDetails,
  PublicEvent,
  PublicEventGroup,
  SubscribedItem,
  SubscriptionsFeed,
} from '@cacic-eventos/shared-utils';
import { Observable, forkJoin, map, of } from 'rxjs';

export type {
  Certificate,
  CertificateDownload,
  CertificateTarget,
  CurrentUserEventAttendance,
  CurrentUserMajorEventFeedItem,
  CurrentUserMajorEventSubscription,
  EventDetails,
  EventGroupDetails,
  MajorEventDetails,
  PublicEvent,
  PublicEventGroup,
  SubscribedItem,
  SubscriptionsFeed,
} from '@cacic-eventos/shared-utils';

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

interface CurrentUserSubscriptionFeedSingleEventItem {
  type: 'SINGLE_EVENT';
  subscriptionId?: string | null;
  eventId: string;
  date: string;
  createdAt: string;
  event: PublicEvent;
  participation: CurrentUserEventParticipation;
}

interface CurrentUserSubscriptionFeedEventGroupItem {
  type: 'EVENT_GROUP';
  subscriptionId: string;
  eventGroupId: string;
  date: string;
  createdAt: string;
  eventGroup: PublicEventGroup;
  participation: CurrentUserEventParticipation;
}

type CurrentUserSubscriptionFeedItem =
  | CurrentUserSubscriptionFeedSingleEventItem
  | CurrentUserSubscriptionFeedEventGroupItem;

interface CurrentUserSubscriptionFeedResponse {
  items: CurrentUserSubscriptionFeedItem[];
}

interface CurrentUserEventParticipation {
  isSubscribed: boolean;
  isLecturer: boolean;
  hasIssuedCertificate: boolean;
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

const CERTIFICATE_FIELDS = `
  id
  configId
  issuedAt
  config {
    id
    name
    scope
    certificateText
    certificateTemplate {
      id
      name
      version
    }
  }
  certificateTemplate {
    id
    name
    version
  }
`;

@Injectable({ providedIn: 'root' })
export class AttendancesApiService {
  private readonly http = inject(HttpClient);

  getSubscriptionsFeed(): Observable<SubscriptionsFeed> {
    return this.query<{
      currentUserMajorEventFeed: CurrentUserMajorEventFeedItem[];
      currentUserSubscriptionFeed: CurrentUserSubscriptionFeedResponse;
      currentUserEventAttendances: CurrentUserEventAttendance[];
    }>(
      `
        query CurrentUserSubscriptionsFeed {
          currentUserMajorEventFeed {
            id
            majorEventId
            subscriptionStatus
            amountPaid
            paymentDate
            paymentTier
            majorEvent {
              id
              name
              emoji
              startDate
              endDate
              description
            }
            participation {
              isSubscribed
              isLecturer
              hasIssuedCertificate
            }
          }

          currentUserSubscriptionFeed {
            items {
              type
              subscriptionId
              date
              createdAt

              eventId
              event {
                id
                name
                startDate
                endDate
                emoji
                type
                description
                shortDescription
                locationDescription
              }

              eventGroupId
              eventGroup {
                id
                name
                emoji
              }

              participation {
                isSubscribed
                isLecturer
                hasIssuedCertificate
              }
            }
          }

          currentUserEventAttendances {
            eventId
            attendedAt
          }
        }

    `,
    ).pipe(
      map((data) => ({
        majorEventItems: data.currentUserMajorEventFeed,
        eventItems: this.mapSubscriptionFeedItems(
          data.currentUserSubscriptionFeed.items ?? [],
        ),
        attendances: data.currentUserEventAttendances,
      })),
    );
  }

  private mapSubscriptionFeedItems(
    items: CurrentUserSubscriptionFeedItem[],
  ): SubscribedItem[] {
    return items.map((item) => {
      if (item.type === 'SINGLE_EVENT') {
        return {
          __typename: 'SubscribedSingleEventItem',
          id: item.eventId,
          type: 'single',
          startDate: item.date,
          event: item.event,
          participation: item.participation,
        };
      }

      return {
        __typename: 'SubscribedEventGroupItem',
        id: item.subscriptionId ?? item.eventGroupId,
        type: 'group',
        startDate: item.date,
        eventGroup: item.eventGroup,
        events: [],
        participation: item.participation,
      };
    });
  }

  getMajorEventDetails(majorEventId: string): Observable<MajorEventDetails> {
    return forkJoin({
      details: this.query<{
        currentUserMajorEventSubscription: CurrentUserMajorEventSubscription | null;
        currentUserEventAttendances: CurrentUserEventAttendance[];
      }>(
        `
          query CurrentUserMajorEventDetails($majorEventId: String!) {
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
            currentUserEventAttendances {
              eventId
              attendedAt
            }
          }
        `,
        { majorEventId },
      ),
      feedItem: this.getMajorEventFeedItem(majorEventId),
    }).pipe(
      map(({ details, feedItem }) => ({
        subscription: details.currentUserMajorEventSubscription,
        majorEvent: feedItem?.majorEvent ?? null,
        hasIssuedCertificate:
          feedItem?.participation.hasIssuedCertificate ?? false,
        attendances: details.currentUserEventAttendances,
      })),
    );
  }

  getEventDetails(eventId: string): Observable<EventDetails> {
    return forkJoin({
      details: this.query<{
        currentUserEventSubscription: CurrentUserEventSubscription | null;
        currentUserEventAttendance: CurrentUserEventAttendance | null;
        publicEvent: PublicEvent;
      }>(
        `
          query CurrentUserEventDetails($eventId: String!) {
            currentUserEventSubscription(eventId: $eventId) {
              eventId
              eventGroupSubscriptionId
              createdAt
              event {
                ${PUBLIC_EVENT_FIELDS}
              }
            }
            currentUserEventAttendance(eventId: $eventId) {
              eventId
              attendedAt
            }
            publicEvent(id: $eventId) {
              ${PUBLIC_EVENT_FIELDS}
            }
          }
        `,
        { eventId },
      ),
      certificates: this.getCurrentUserCertificates('EVENT', eventId),
    }).pipe(
      map(({ details, certificates }) => ({
        subscription: details.currentUserEventSubscription,
        event: details.currentUserEventSubscription
          ? null
          : details.publicEvent,
        hasIssuedCertificate: certificates.length > 0,
        attendance: details.currentUserEventAttendance,
      })),
    );
  }

  getEventGroupDetails(eventGroupId: string): Observable<EventGroupDetails> {
    return forkJoin({
      details: this.query<{
        currentUserEventGroupSubscription: CurrentUserEventGroupSubscription | null;
        currentUserEventAttendances: CurrentUserEventAttendance[];
        publicEvents: PublicEvent[];
      }>(
        `
          query CurrentUserEventGroupDetails($eventGroupId: String!) {
            currentUserEventGroupSubscription(eventGroupId: $eventGroupId) {
              id
              eventGroupId
              createdAt
              eventGroup {
                ${PUBLIC_EVENT_GROUP_FIELDS}
              }
              events {
                ${PUBLIC_EVENT_FIELDS}
              }
            }
            currentUserEventAttendances {
              eventId
              attendedAt
            }
            publicEvents(eventGroupId: $eventGroupId) {
              ${PUBLIC_EVENT_FIELDS}
            }
          }
        `,
        { eventGroupId },
      ),
      certificates: this.getCurrentUserCertificates(
        'EVENT_GROUP',
        eventGroupId,
      ),
    }).pipe(
      map(({ details, certificates }) => {
        const fallbackEvents = details.publicEvents ?? [];
        const eventGroup = fallbackEvents[0]?.eventGroup ?? null;

        return {
          subscription: details.currentUserEventGroupSubscription,
          eventGroup: details.currentUserEventGroupSubscription
            ? null
            : eventGroup,
          events: details.currentUserEventGroupSubscription
            ? []
            : fallbackEvents,
          hasIssuedCertificate: certificates.length > 0,
          attendances: details.currentUserEventAttendances,
        };
      }),
    );
  }

  getCurrentUserCertificatesForTargets(
    targets: CertificateTarget[],
  ): Observable<Certificate[]> {
    if (targets.length === 0) {
      return of([]);
    }

    return forkJoin(
      targets.map((target) =>
        this.getCurrentUserCertificates(target.scope, target.targetId),
      ),
    ).pipe(
      map((certificateGroups) =>
        this.deduplicateCertificates(certificateGroups.flat()),
      ),
    );
  }

  downloadCurrentUserCertificate(
    certificateId: string,
  ): Observable<CertificateDownload> {
    return this.query<{ downloadCurrentUserCertificate: CertificateDownload }>(
      `
        query DownloadCurrentUserCertificate($certificateId: String!) {
          downloadCurrentUserCertificate(certificateId: $certificateId) {
            fileName
            mimeType
            contentBase64
          }
        }
      `,
      { certificateId },
    ).pipe(map((data) => data.downloadCurrentUserCertificate));
  }

  private getCurrentUserCertificates(
    scope: CertificateScope,
    targetId: string,
  ): Observable<Certificate[]> {
    return this.query<{ currentUserCertificates: Certificate[] }>(
      `
        query CurrentUserCertificates($scope: CertificateScope!, $targetId: String!) {
          currentUserCertificates(scope: $scope, targetId: $targetId) {
            ${CERTIFICATE_FIELDS}
          }
        }
      `,
      { scope, targetId },
    ).pipe(map((data) => data.currentUserCertificates));
  }

  private getMajorEventFeedItem(
    majorEventId: string,
  ): Observable<CurrentUserMajorEventFeedItem | null> {
    return this.query<{
      currentUserMajorEventFeed: CurrentUserMajorEventFeedItem[];
    }>(
      `
        query CurrentUserMajorEventFeedItem {
          currentUserMajorEventFeed {
            id
            majorEventId
            subscriptionStatus
            amountPaid
            paymentDate
            paymentTier
            majorEvent {
              ${PUBLIC_MAJOR_EVENT_FIELDS}
            }
            participation {
              isSubscribed
              isLecturer
              hasIssuedCertificate
            }
          }
        }
      `,
    ).pipe(
      map(
        (data) =>
          data.currentUserMajorEventFeed.find(
            (item) => item.majorEventId === majorEventId,
          ) ?? null,
      ),
    );
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

  private deduplicateCertificates(certificates: Certificate[]): Certificate[] {
    const certificatesById = new Map<string, Certificate>();
    for (const certificate of certificates) {
      certificatesById.set(certificate.id, certificate);
    }

    return [...certificatesById.values()].sort(
      (left, right) =>
        new Date(right.issuedAt).getTime() - new Date(left.issuedAt).getTime(),
    );
  }
}
