import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  PUBLIC_ATTENDANCE_EVENT_FIELDS,
  PUBLIC_EVENT_GROUP_DETAIL_FIELDS,
  PUBLIC_MAJOR_EVENT_PROFILE_FIELDS,
  type CertificateDownload,
  type CertificateScope,
  type EventTargetType,
  type PublicEvent,
  type PublicEventGroup,
} from '@cacic-fct/event-manager-public-contracts';
import { compareIsoDateDesc } from '@cacic-fct/shared-utils';
import type {
  Certificate,
  CertificateTarget,
  CurrentUserEventAttendance,
  CurrentUserEventGroupSubscription,
  CurrentUserEventSubscription,
  CurrentUserMajorEventFeedItem,
  CurrentUserMajorEventSubscription,
  EventDetails,
  EventGroupDetails,
  MajorEventDetails,
  SubscribedItem,
  SubscriptionsFeed,
} from '@cacic-fct/shared-utils';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

export type {
  Certificate,
  CertificateTarget,
  CurrentUserEventAttendance,
  CurrentUserMajorEventFeedItem,
  CurrentUserMajorEventSubscription,
  EventDetails,
  EventGroupDetails,
  MajorEventDetails,
  SubscribedItem,
  SubscriptionsFeed,
} from '@cacic-fct/shared-utils';
export type { CertificateDownload, PublicEvent, PublicEventGroup } from '@cacic-fct/event-manager-public-contracts';

type GraphqlVariable = string | number | boolean | null | undefined | readonly string[] | object;
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

export interface OrganizerEventInfo {
  event: PublicEvent;
  subscriberCount: number;
  attendanceCount: number;
  onlineAttendanceCode?: string | null;
  canDownloadSubscriberList: boolean;
}

export interface OrganizerInfo {
  targetType: EventTargetType;
  targetId: string;
  title: string;
  events: OrganizerEventInfo[];
}

export interface LecturerProfile {
  id: string;
  personId: string;
  displayName: string;
  biography?: string | null;
  publishGoogleUserPicture: boolean;
  googleUserPicture?: string | null;
  email?: string | null;
  whatsapp?: string | null;
}

export interface LecturerProfileInput {
  displayName: string;
  biography?: string | null;
  publishGoogleUserPicture?: boolean;
  email?: string | null;
  whatsapp?: string | null;
}

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

const LECTURER_PROFILE_FIELDS = `
  id
  personId
  displayName
  biography
  publishGoogleUserPicture
  googleUserPicture
  email
  whatsapp
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
        eventItems: this.mapSubscriptionFeedItems(data.currentUserSubscriptionFeed.items ?? []),
        attendances: data.currentUserEventAttendances,
      })),
    );
  }

  private mapSubscriptionFeedItems(items: CurrentUserSubscriptionFeedItem[]): SubscribedItem[] {
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
        currentUserMajorEventEventSubscriptions: CurrentUserEventSubscription[];
        currentUserEventAttendances: CurrentUserEventAttendance[];
        publicEvents: PublicEvent[];
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
                ${PUBLIC_MAJOR_EVENT_PROFILE_FIELDS}
              }
              selectedEvents {
                ${PUBLIC_ATTENDANCE_EVENT_FIELDS}
              }
              notSubscribedEvents {
                ${PUBLIC_ATTENDANCE_EVENT_FIELDS}
              }
            }
            currentUserMajorEventEventSubscriptions(majorEventId: $majorEventId) {
              eventId
              eventGroupSubscriptionId
              createdAt
              event {
                ${PUBLIC_ATTENDANCE_EVENT_FIELDS}
              }
            }
            currentUserEventAttendances {
              eventId
              attendedAt
            }
            publicEvents(majorEventId: $majorEventId) {
              ${PUBLIC_ATTENDANCE_EVENT_FIELDS}
            }
          }
        `,
        { majorEventId },
      ),
      feedItem: this.getMajorEventFeedItem(majorEventId),
      organizerInfo: this.getOrganizerInfo('major-event', majorEventId),
    }).pipe(
      map(({ details, feedItem, organizerInfo }) => ({
        subscription: this.withDerivedNotSubscribedEvents(
          details.currentUserMajorEventSubscription,
          details.currentUserMajorEventEventSubscriptions ?? [],
          details.publicEvents ?? [],
        ),
        majorEvent: feedItem?.majorEvent ?? null,
        hasIssuedCertificate: feedItem?.participation.hasIssuedCertificate ?? false,
        isLecturer: Boolean(feedItem?.participation.isLecturer || organizerInfo),
        attendances: details.currentUserEventAttendances,
      })),
    );
  }

  getEventDetails(eventId: string): Observable<EventDetails> {
    return forkJoin({
      details: this.query<{
        currentUserEventSubscription: CurrentUserEventSubscription | null;
        currentUserEventAttendance: CurrentUserEventAttendance | null;
      }>(
        `
          query CurrentUserEventDetails($eventId: String!) {
            currentUserEventSubscription(eventId: $eventId) {
              eventId
              eventGroupSubscriptionId
              createdAt
              event {
                ${PUBLIC_ATTENDANCE_EVENT_FIELDS}
              }
            }
            currentUserEventAttendance(eventId: $eventId) {
              eventId
              attendedAt
            }
          }
        `,
        { eventId },
      ),
      certificates: this.getCurrentUserCertificates('EVENT', eventId),
      organizerInfo: this.getOrganizerInfo('event', eventId),
      publicEvent: this.getPublicEvent(eventId).pipe(catchError(() => of(null))),
    }).pipe(
      map(({ details, certificates, organizerInfo, publicEvent }) => ({
        subscription: details.currentUserEventSubscription,
        event: details.currentUserEventSubscription ? null : (publicEvent ?? organizerInfo?.events[0]?.event ?? null),
        hasIssuedCertificate: certificates.length > 0,
        isLecturer: Boolean(organizerInfo),
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
                ${PUBLIC_EVENT_GROUP_DETAIL_FIELDS}
              }
              events {
                ${PUBLIC_ATTENDANCE_EVENT_FIELDS}
              }
            }
            currentUserEventAttendances {
              eventId
              attendedAt
            }
            publicEvents(eventGroupId: $eventGroupId) {
              ${PUBLIC_ATTENDANCE_EVENT_FIELDS}
            }
          }
        `,
        { eventGroupId },
      ),
      certificates: this.getCurrentUserCertificates('EVENT_GROUP', eventGroupId),
      organizerInfo: this.getOrganizerInfo('event-group', eventGroupId),
    }).pipe(
      map(({ details, certificates, organizerInfo }) => {
        const fallbackEvents = details.publicEvents ?? [];
        const eventGroup = fallbackEvents[0]?.eventGroup ?? null;

        return {
          subscription: details.currentUserEventGroupSubscription,
          eventGroup: details.currentUserEventGroupSubscription ? null : eventGroup,
          events: details.currentUserEventGroupSubscription ? [] : organizerInfo?.events.map((item) => item.event) ?? fallbackEvents,
          hasIssuedCertificate: certificates.length > 0,
          isLecturer: Boolean(organizerInfo),
          attendances: details.currentUserEventAttendances,
        };
      }),
    );
  }

  getOrganizerInfo(targetType: EventTargetType, targetId: string): Observable<OrganizerInfo | null> {
    return this.query<{ currentUserOrganizerInfo: OrganizerInfo | null }>(
      `
        query CurrentUserOrganizerInfo($targetType: String!, $targetId: String!) {
          currentUserOrganizerInfo(targetType: $targetType, targetId: $targetId) {
            targetType
            targetId
            title
            events {
              subscriberCount
              attendanceCount
              onlineAttendanceCode
              canDownloadSubscriberList
              event {
                ${PUBLIC_ATTENDANCE_EVENT_FIELDS}
              }
            }
          }
        }
      `,
      { targetType, targetId },
    ).pipe(
      map((data) => data.currentUserOrganizerInfo),
      catchError(() => of(null)),
    );
  }

  getCurrentUserLecturerProfile(): Observable<LecturerProfile | null> {
    return this.query<{ currentUserLecturerProfile: LecturerProfile | null }>(
      `
        query CurrentUserLecturerProfile {
          currentUserLecturerProfile {
            ${LECTURER_PROFILE_FIELDS}
          }
        }
      `,
    ).pipe(map((data) => data.currentUserLecturerProfile));
  }

  upsertCurrentUserLecturerProfile(input: LecturerProfileInput): Observable<LecturerProfile> {
    return this.query<{ upsertCurrentUserLecturerProfile: LecturerProfile }>(
      `
        mutation UpsertCurrentUserLecturerProfile($input: LecturerProfileUpsertInput!) {
          upsertCurrentUserLecturerProfile(input: $input) {
            ${LECTURER_PROFILE_FIELDS}
          }
        }
      `,
      { input },
    ).pipe(map((data) => data.upsertCurrentUserLecturerProfile));
  }

  downloadEventSubscriberList(eventId: string): Observable<CertificateDownload> {
    return this.query<{ downloadCurrentUserEventSubscriberList: CertificateDownload }>(
      `
        query DownloadCurrentUserEventSubscriberList($eventId: String!) {
          downloadCurrentUserEventSubscriberList(eventId: $eventId) {
            fileName
            mimeType
            contentBase64
          }
        }
      `,
      { eventId },
    ).pipe(map((data) => data.downloadCurrentUserEventSubscriberList));
  }

  getCurrentUserCertificatesForTargets(targets: CertificateTarget[]): Observable<Certificate[]> {
    if (targets.length === 0) {
      return of([]);
    }

    return forkJoin(targets.map((target) => this.getCurrentUserCertificates(target.scope, target.targetId))).pipe(
      map((certificateGroups) => this.deduplicateCertificates(certificateGroups.flat())),
    );
  }

  downloadCurrentUserCertificate(certificateId: string): Observable<CertificateDownload> {
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

  downloadCurrentUserCertificatesArchive(): Observable<CertificateDownload> {
    return this.query<{ downloadCurrentUserCertificatesArchive: CertificateDownload }>(
      `
        query DownloadCurrentUserCertificatesArchive {
          downloadCurrentUserCertificatesArchive {
            fileName
            mimeType
            contentBase64
          }
        }
      `,
    ).pipe(map((data) => data.downloadCurrentUserCertificatesArchive));
  }

  private getCurrentUserCertificates(scope: CertificateScope, targetId: string): Observable<Certificate[]> {
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

  private getPublicEvent(eventId: string): Observable<PublicEvent | null> {
    return this.query<{ publicEvent: PublicEvent }>(
      `
        query PublicEventForAttendanceDetails($eventId: String!) {
          publicEvent(id: $eventId) {
            ${PUBLIC_ATTENDANCE_EVENT_FIELDS}
          }
        }
      `,
      { eventId },
    ).pipe(map((data) => data.publicEvent));
  }

  private getMajorEventFeedItem(majorEventId: string): Observable<CurrentUserMajorEventFeedItem | null> {
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
              ${PUBLIC_MAJOR_EVENT_PROFILE_FIELDS}
            }
            participation {
              isSubscribed
              isLecturer
              hasIssuedCertificate
            }
          }
        }
      `,
    ).pipe(map((data) => data.currentUserMajorEventFeed.find((item) => item.majorEventId === majorEventId) ?? null));
  }

  private withDerivedNotSubscribedEvents(
    subscription: CurrentUserMajorEventSubscription | null,
    eventSubscriptions: CurrentUserEventSubscription[],
    publicEvents: PublicEvent[],
  ): CurrentUserMajorEventSubscription | null {
    if (!subscription) {
      return null;
    }

    const selectedEvents = eventSubscriptions.map((eventSubscription) => eventSubscription.event);
    const selectedEventIds = new Set(selectedEvents.map((event) => event.id));
    const notSubscribedEvents = publicEvents.filter((event) => !selectedEventIds.has(event.id));

    return {
      ...subscription,
      selectedEvents,
      notSubscribedEvents,
    };
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

  private deduplicateCertificates(certificates: Certificate[]): Certificate[] {
    const certificatesById = new Map<string, Certificate>();
    for (const certificate of certificates) {
      certificatesById.set(certificate.id, certificate);
    }

    return [...certificatesById.values()].sort((left, right) => compareIsoDateDesc(left.issuedAt, right.issuedAt));
  }
}
