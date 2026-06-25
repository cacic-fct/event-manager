import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  DeletionResult,
  EventAttendance,
  EventAttendanceScannerFeedItem,
  EventAttendanceCsvImportResult,
  MajorEventSubscriptionCsvImportResult,
  MajorEventUserAttendance,
  OfflineEventAttendanceSubmission,
  SubscriptionStatus,
} from './models';
import { PERSON_EXPORT_FIELDS, PERSON_SEARCH_FIELDS } from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class AttendanceApiService {
  private readonly http = inject(HttpClient);
  private readonly graphqlHttp = inject(GraphqlHttpService);
  private readonly zone = inject(NgZone);

  createEventAttendance(input: { eventId: string; personId: string }) {
    return this.graphqlHttp
      .request<{ createEventAttendance: EventAttendance }>(
        `mutation CreateEventAttendance($input: EventAttendanceCreateInput!) {
          createEventAttendance(input: $input) {
            eventId
            personId
            attendedAt
            category
            createdByMethod
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createEventAttendance));
  }

  createEventAttendanceFromAztecCode(input: { eventId: string; code: string }) {
    return this.graphqlHttp
      .request<{ createEventAttendanceFromAztecCode: EventAttendance }>(
        `mutation CreateEventAttendanceFromAztecCode($eventId: String!, $code: String!) {
          createEventAttendanceFromAztecCode(eventId: $eventId, code: $code) {
            eventId
            personId
            attendedAt
            category
            createdByMethod
          }
        }`,
        input,
      )
      .pipe(map((data) => data.createEventAttendanceFromAztecCode));
  }

  importEventAttendancesFromCsv(input: { eventId: string; csvContent: string; selectedHeader: string }) {
    return this.graphqlHttp
      .request<{
        importEventAttendancesFromCsv: EventAttendanceCsvImportResult;
      }>(
        `mutation ImportEventAttendancesFromCsv(
          $input: EventAttendanceCsvImportInput!
        ) {
          importEventAttendancesFromCsv(input: $input) {
            createdCount
            duplicateCount
            failedCount
            failedValues
            inferredMatchType
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.importEventAttendancesFromCsv));
  }

  importMajorEventSubscriptionsFromCsv(input: {
    majorEventId: string;
    csvContent: string;
    subscriptionStatus: SubscriptionStatus;
    columnMapping: {
      emailHeader?: string | null;
      fullNameHeader?: string | null;
      enrollmentNumberHeader?: string | null;
      identityDocumentHeader?: string | null;
      subscribedEventIdsHeader: string;
    };
  }) {
    return this.graphqlHttp
      .request<{
        importMajorEventSubscriptionsFromCsv: MajorEventSubscriptionCsvImportResult;
      }>(
        `mutation ImportMajorEventSubscriptionsFromCsv(
          $input: MajorEventSubscriptionCsvImportInput!
        ) {
          importMajorEventSubscriptionsFromCsv(input: $input) {
            createdSubscriptionCount
            updatedSubscriptionCount
            duplicateCount
            createdPeopleCount
            failedCount
            failedRows
            createdPeople {
              ${PERSON_SEARCH_FIELDS}
            }
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.importMajorEventSubscriptionsFromCsv));
  }

  listEventAttendances(eventId?: string, filters?: { skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{ eventAttendances: EventAttendance[] }>(
        `query ListEventAttendances($eventId: String, $skip: Int, $take: Int) {
          eventAttendances(eventId: $eventId, skip: $skip, take: $take) {
            eventId
            personId
            attendedAt
            createdAt
            createdById
            committedById
            category
            createdByMethod
            collectedByFullName
            committedByFullName
            collectedLatitude
            collectedLongitude
            collectedAccuracyMeters
            person {
              ${PERSON_EXPORT_FIELDS}
            }
            event {
              id
              name
              emoji
            }
          }
        }`,
        { eventId, skip: filters?.skip, take: filters?.take },
      )
      .pipe(map((data) => data.eventAttendances));
  }

  listOfflineEventAttendanceSubmissions(eventId?: string) {
    return this.graphqlHttp
      .request<{ offlineEventAttendanceSubmissions: OfflineEventAttendanceSubmission[] }>(
        `query OfflineEventAttendanceSubmissions($eventId: String) {
          offlineEventAttendanceSubmissions(eventId: $eventId) {
            id
            clientId
            eventId
            status
            createdByMethod
            scannerCode
            manualValue
            collectedAt
            authorUserId
            authorName
            authorEmail
            submittedById
            submittedByFullName
            submittedAt
            stagedReason
            resolutionError
            collectedLatitude
            collectedLongitude
            collectedAccuracyMeters
            event {
              id
              name
              emoji
              startDate
            }
            person {
              ${PERSON_EXPORT_FIELDS}
            }
          }
        }`,
        { eventId },
      )
      .pipe(map((data) => data.offlineEventAttendanceSubmissions));
  }

  approveOfflineEventAttendanceSubmission(submissionId: string) {
    return this.graphqlHttp
      .request<{ approveOfflineEventAttendanceSubmission: OfflineEventAttendanceSubmission }>(
        `mutation ApproveOfflineEventAttendanceSubmission($submissionId: String!) {
          approveOfflineEventAttendanceSubmission(submissionId: $submissionId) {
            id
            eventId
            personId
            status
            committedAt
            committedById
            committedByFullName
          }
        }`,
        { submissionId },
      )
      .pipe(map((data) => data.approveOfflineEventAttendanceSubmission));
  }

  approveOfflineEventAttendanceSubmissions(submissionIds: string[]) {
    return this.graphqlHttp
      .request<{ approveOfflineEventAttendanceSubmissions: OfflineEventAttendanceSubmission[] }>(
        `mutation ApproveOfflineEventAttendanceSubmissions($submissionIds: [String!]!) {
          approveOfflineEventAttendanceSubmissions(submissionIds: $submissionIds) {
            id
            eventId
            personId
            status
            committedAt
            committedById
            committedByFullName
          }
        }`,
        { submissionIds },
      )
      .pipe(map((data) => data.approveOfflineEventAttendanceSubmissions));
  }

  rejectOfflineEventAttendanceSubmission(submissionId: string, reason?: string | null) {
    return this.graphqlHttp
      .request<{ rejectOfflineEventAttendanceSubmission: OfflineEventAttendanceSubmission }>(
        `mutation RejectOfflineEventAttendanceSubmission($submissionId: String!, $reason: String) {
          rejectOfflineEventAttendanceSubmission(submissionId: $submissionId, reason: $reason) {
            id
            eventId
            status
            rejectedAt
            rejectedById
            rejectedByFullName
            rejectionReason
          }
        }`,
        { submissionId, reason },
      )
      .pipe(map((data) => data.rejectOfflineEventAttendanceSubmission));
  }

  rejectOfflineEventAttendanceSubmissions(submissionIds: string[], reason?: string | null) {
    return this.graphqlHttp
      .request<{ rejectOfflineEventAttendanceSubmissions: OfflineEventAttendanceSubmission[] }>(
        `mutation RejectOfflineEventAttendanceSubmissions($submissionIds: [String!]!, $reason: String) {
          rejectOfflineEventAttendanceSubmissions(submissionIds: $submissionIds, reason: $reason) {
            id
            eventId
            status
            rejectedAt
            rejectedById
            rejectedByFullName
            rejectionReason
          }
        }`,
        { submissionIds, reason },
      )
      .pipe(map((data) => data.rejectOfflineEventAttendanceSubmissions));
  }

  deleteEventAttendance(input: { eventId: string; personId: string }) {
    return this.graphqlHttp
      .request<{ deleteEventAttendance: DeletionResult }>(
        `mutation DeleteEventAttendance($eventId: String!, $personId: String!) {
          deleteEventAttendance(eventId: $eventId, personId: $personId) {
            deleted
            eventId
            personId
          }
        }`,
        input,
      )
      .pipe(map((data) => data.deleteEventAttendance));
  }

  listEventAttendanceScannerFeed(eventId: string) {
    return this.graphqlHttp
      .request<{ eventAttendanceScannerFeed: EventAttendanceScannerFeedItem[] }>(
        `query EventAttendanceScannerFeed($eventId: String!) {
          eventAttendanceScannerFeed(eventId: $eventId) {
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
        }`,
        { eventId },
      )
      .pipe(map((data) => data.eventAttendanceScannerFeed));
  }

  watchEventAttendanceScannerFeed(eventId: string): Observable<EventAttendanceScannerFeedItem[]> {
    return new Observable<EventAttendanceScannerFeedItem[]>((subscriber) => {
      const source = new EventSource(
        `/api/event-attendances/events/${encodeURIComponent(eventId)}/scanner-feed/events`,
        {
          withCredentials: true,
        },
      );

      source.onmessage = (event) => {
        this.zone.run(() => {
          const parsed = JSON.parse(event.data) as {
            type: string;
            attendances?: EventAttendanceScannerFeedItem[];
          };
          if (parsed.type === 'event-attendance-scanner-feed' && parsed.attendances) {
            subscriber.next(parsed.attendances);
          }
        });
      };

      source.onerror = () => {
        this.zone.run(() => subscriber.error(new Error('Não foi possível acompanhar as presenças em tempo real.')));
        source.close();
      };

      return () => source.close();
    });
  }

  createEventAttendanceFromScannerCode(input: { eventId: string; code: string }) {
    return this.graphqlHttp
      .request<{ createEventAttendanceFromScannerCode: EventAttendance }>(
        `mutation CreateEventAttendanceFromScannerCode($input: EventAttendanceScannerCodeInput!) {
          createEventAttendanceFromScannerCode(input: $input) {
            eventId
            personId
            attendedAt
            category
            createdByMethod
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createEventAttendanceFromScannerCode));
  }

  createEventAttendanceFromManualInput(input: { eventId: string; value: string }) {
    return this.graphqlHttp
      .request<{ createEventAttendanceFromManualInput: EventAttendance }>(
        `mutation CreateEventAttendanceFromManualInput($input: EventAttendanceManualInput!) {
          createEventAttendanceFromManualInput(input: $input) {
            eventId
            personId
            attendedAt
            category
            createdByMethod
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createEventAttendanceFromManualInput));
  }

  listMajorEventUserAttendances(
    majorEventId: string,
    filters?: {
      personId?: string;
      skip?: number;
      take?: number;
    },
  ) {
    return this.graphqlHttp
      .request<{ majorEventUserAttendances: MajorEventUserAttendance[] }>(
        `query ListMajorEventUserAttendances(
          $majorEventId: String!
          $personId: String
          $skip: Int
          $take: Int
        ) {
          majorEventUserAttendances(
            majorEventId: $majorEventId
            personId: $personId
            skip: $skip
            take: $take
          ) {
            majorEventId
            subscriptionId
            personId
            subscriptionStatus
            amountPaid
            paymentDate
            paymentTier
            person {
              ${PERSON_EXPORT_FIELDS}
            }
            attendances {
              eventId
              eventName
              eventStartDate
              attended
              attendedAt
              category
            }
          }
        }`,
        {
          majorEventId,
          personId: filters?.personId,
          skip: filters?.skip,
          take: filters?.take,
        },
      )
      .pipe(map((data) => data.majorEventUserAttendances));
  }
}
