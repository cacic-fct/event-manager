import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  EventAttendance,
  EventAttendanceCsvImportResult,
  MajorEventSubscriptionCsvImportResult,
  MajorEventUserAttendance,
  SubscriptionStatus,
} from './models';
import { PERSON_FIELDS } from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class AttendanceApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  createEventAttendance(input: { eventId: string; personId: string }) {
    return this.graphqlHttp
      .request<{ createEventAttendance: EventAttendance }>(
        `mutation CreateEventAttendance($input: EventAttendanceCreateInput!) {
          createEventAttendance(input: $input) {
            eventId
            personId
            attendedAt
            createdByMethod
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createEventAttendance));
  }

  importEventAttendancesFromCsv(input: {
    eventId: string;
    csvContent: string;
    selectedHeader: string;
  }) {
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
              ${PERSON_FIELDS}
            }
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.importMajorEventSubscriptionsFromCsv));
  }

  listEventAttendances(eventId?: string) {
    return this.graphqlHttp
      .request<{ eventAttendances: EventAttendance[] }>(
        `query ListEventAttendances($eventId: String) {
          eventAttendances(eventId: $eventId) {
            eventId
            personId
            attendedAt
            createdByMethod
            person {
              ${PERSON_FIELDS}
            }
            event {
              id
              name
              emoji
            }
          }
        }`,
        { eventId },
      )
      .pipe(map((data) => data.eventAttendances));
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
              ${PERSON_FIELDS}
            }
            attendances {
              eventId
              eventName
              eventStartDate
              attended
              attendedAt
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
