import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  DeletionResult,
  MajorEvent,
  MajorEventInput,
  MajorEventUserAttendance,
} from './models';
import { MAJOR_EVENT_FIELDS, PERSON_FIELDS } from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class MajorEventApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listMajorEvents(filters?: {
    query?: string;
    startDateFrom?: string;
    startDateTo?: string;
    skip?: number;
    take?: number;
  }) {
    return this.graphqlHttp
      .request<{ majorEvents: MajorEvent[] }>(
        `query ListMajorEvents(
          $query: String
          $startDateFrom: DateTime
          $startDateTo: DateTime
          $skip: Int
          $take: Int
        ) {
          majorEvents(
            query: $query
            startDateFrom: $startDateFrom
            startDateTo: $startDateTo
            skip: $skip
            take: $take
          ) {
            ${MAJOR_EVENT_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.majorEvents));
  }

  getMajorEvent(id: string) {
    return this.graphqlHttp
      .request<{ majorEvent: MajorEvent }>(
        `query GetMajorEvent($id: String!) {
          majorEvent(id: $id) {
            ${MAJOR_EVENT_FIELDS}
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.majorEvent));
  }

  createMajorEvent(input: MajorEventInput) {
    return this.graphqlHttp
      .request<{ createMajorEvent: MajorEvent }>(
        `mutation CreateMajorEvent($input: MajorEventCreateInput!) {
          createMajorEvent(input: $input) {
            ${MAJOR_EVENT_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createMajorEvent));
  }

  updateMajorEvent(id: string, input: MajorEventInput) {
    return this.graphqlHttp
      .request<{ updateMajorEvent: MajorEvent }>(
        `mutation UpdateMajorEvent($id: String!, $input: MajorEventUpdateInput!) {
          updateMajorEvent(id: $id, input: $input) {
            ${MAJOR_EVENT_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateMajorEvent));
  }

  deleteMajorEvent(id: string) {
    return this.graphqlHttp
      .request<{ deleteMajorEvent: DeletionResult }>(
        `mutation DeleteMajorEvent($id: String!) {
          deleteMajorEvent(id: $id) {
            deleted
            id
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.deleteMajorEvent));
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