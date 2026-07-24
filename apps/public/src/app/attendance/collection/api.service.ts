import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { decodeTypedSseEvent, watchReplayableEventSource } from '@cacic-fct/shared-angular';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { Observable, map } from 'rxjs';

export type AttendanceCreationMethod =
  | 'CSV_IMPORT'
  | 'EVENT_DUPLICATION'
  | 'MANUAL_INPUT'
  | 'SCANNER'
  | 'ONLINE_CODE'
  | 'UNKNOWN';
export type AttendanceCategory = 'NON_PAYING' | 'NON_SUBSCRIBED' | 'REGULAR' | 'UNKNOWN';

export interface AttendanceCollectionEvent {
  eventId: string;
  event: PublicEvent;
}

export interface AttendanceCollectionLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export interface AttendanceScannerFeedItem {
  personId: string;
  eventId: string;
  fullName?: string | null;
  unespRole?: string | null;
  subscriptionStatus?: string | null;
  attendedAt?: string | null;
  createdByMethod?: AttendanceCreationMethod | null;
  collectedByFirstName?: string | null;
  committedByFirstName?: string | null;
}

export interface AttendanceRegistrationResult {
  eventId: string;
  personId: string;
  attendedAt: string;
  category: AttendanceCategory;
}

export type OfflineAttendanceCommitStatus = 'CREATED' | 'STAGED' | 'DUPLICATE' | 'CONFLICT' | 'FORBIDDEN' | 'FAILED';

export interface OfflineAttendanceCommitPayload {
  clientId: string;
  eventId: string;
  createdByMethod: Extract<AttendanceCreationMethod, 'SCANNER' | 'MANUAL_INPUT'>;
  code?: string;
  value?: string;
  location: AttendanceCollectionLocation;
  collectedAt: string;
  authorUserId?: string | null;
  authorName?: string | null;
  authorEmail?: string | null;
}

export interface OfflineAttendanceCommitResult {
  clientId: string;
  eventId: string;
  status: OfflineAttendanceCommitStatus;
  message?: string | null;
  attendance?: AttendanceRegistrationResult | null;
  stagedSubmission?: {
    id: string;
    eventId: string;
    status: 'PENDING' | 'COMMITTED' | 'REJECTED';
  } | null;
}

type GraphqlVariables = Record<string, unknown>;

interface GraphqlResponse<TData> {
  data?: TData;
  errors?: Array<{ message: string }>;
}

const PUBLIC_EVENT_FIELDS = `
  id
  name
  startDate
  endDate
  emoji
  type
  locationDescription
  onlineAttendanceStartDate
  onlineAttendanceEndDate
  majorEventId
  eventGroupId
  majorEvent {
    id
    name
  }
  eventGroup {
    id
    name
  }
`;

@Injectable({ providedIn: 'root' })
export class AttendanceCollectionApiService {
  private readonly http = inject(HttpClient);

  listCollectionEvents(): Observable<AttendanceCollectionEvent[]> {
    return this.query<{ currentUserAttendanceCollectionEvents: AttendanceCollectionEvent[] }>(
      `
        query CurrentUserAttendanceCollectionEvents {
          currentUserAttendanceCollectionEvents {
            eventId
            event {
              ${PUBLIC_EVENT_FIELDS}
            }
          }
        }
      `,
    ).pipe(map((data) => data.currentUserAttendanceCollectionEvents));
  }

  listFeed(eventId: string): Observable<AttendanceScannerFeedItem[]> {
    return this.query<{ currentUserAttendanceCollectionFeed: AttendanceScannerFeedItem[] }>(
      `
        query CurrentUserAttendanceCollectionFeed($eventId: String!) {
          currentUserAttendanceCollectionFeed(eventId: $eventId) {
            personId
            eventId
            fullName
            unespRole
            subscriptionStatus
            attendedAt
            createdByMethod
            collectedByFirstName
            committedByFirstName
          }
        }
      `,
      { eventId },
    ).pipe(map((data) => data.currentUserAttendanceCollectionFeed));
  }

  watchFeed(eventId: string): Observable<AttendanceScannerFeedItem[]> {
    return watchReplayableEventSource(`/api/attendance-collection/events/${encodeURIComponent(eventId)}/feed/events`, {
      decode: (event) =>
        decodeTypedSseEvent<AttendanceScannerFeedItem[], 'attendances'>(
          event,
          'event-attendance-scanner-feed',
          'attendances',
        ),
      errorMessage: 'Não foi possível acompanhar as presenças em tempo real.',
    });
  }

  registerScannerCode(
    eventId: string,
    code: string,
    location: AttendanceCollectionLocation,
  ): Observable<AttendanceRegistrationResult> {
    return this.query<{ collectCurrentUserAttendanceFromScannerCode: AttendanceRegistrationResult }>(
      `
        mutation CollectCurrentUserAttendanceFromScannerCode($input: EventAttendanceScannerCodeInput!) {
          collectCurrentUserAttendanceFromScannerCode(input: $input) {
            eventId
            personId
            attendedAt
            category
          }
        }
      `,
      { input: { eventId, code, location } },
    ).pipe(map((data) => data.collectCurrentUserAttendanceFromScannerCode));
  }

  registerManual(
    eventId: string,
    value: string,
    location: AttendanceCollectionLocation,
  ): Observable<AttendanceRegistrationResult> {
    return this.query<{ collectCurrentUserManualAttendance: AttendanceRegistrationResult }>(
      `
        mutation CollectCurrentUserManualAttendance($input: EventAttendanceManualInput!) {
          collectCurrentUserManualAttendance(input: $input) {
            eventId
            personId
            attendedAt
            category
          }
        }
      `,
      { input: { eventId, value, location } },
    ).pipe(map((data) => data.collectCurrentUserManualAttendance));
  }

  commitOfflineAttendances(items: readonly OfflineAttendanceCommitPayload[]): Observable<OfflineAttendanceCommitResult[]> {
    return this.query<{ commitCurrentUserOfflineAttendances: OfflineAttendanceCommitResult[] }>(
      `
        mutation CommitCurrentUserOfflineAttendances($input: CommitOfflineEventAttendancesInput!) {
          commitCurrentUserOfflineAttendances(input: $input) {
            clientId
            eventId
            status
            message
            attendance {
              eventId
              personId
              attendedAt
              category
            }
            stagedSubmission {
              id
              eventId
              status
            }
          }
        }
      `,
      { input: { attendances: items } },
    ).pipe(map((data) => data.commitCurrentUserOfflineAttendances));
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
