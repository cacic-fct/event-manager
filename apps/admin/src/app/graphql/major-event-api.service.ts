import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { DeletionResult, MajorEvent, MajorEventCloneInput, MajorEventInput } from '@cacic-fct/event-manager-admin-contracts';
import { MAJOR_EVENT_DETAIL_FIELDS, MAJOR_EVENT_LIST_FIELDS } from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class MajorEventApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listMajorEvents(filters?: {
    query?: string;
    startDateFrom?: string;
    startDateUntil?: string;
    endDateFrom?: string;
    skip?: number;
    take?: number;
  }) {
    return this.graphqlHttp
      .request<{ majorEvents: MajorEvent[] }>(
        `query ListMajorEvents(
          $query: String
          $startDateFrom: DateTime
          $startDateUntil: DateTime
          $endDateFrom: DateTime
          $skip: Int
          $take: Int
        ) {
          majorEvents(
            query: $query
            startDateFrom: $startDateFrom
            startDateUntil: $startDateUntil
            endDateFrom: $endDateFrom
            skip: $skip
            take: $take
          ) {
            ${MAJOR_EVENT_LIST_FIELDS}
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
            ${MAJOR_EVENT_DETAIL_FIELDS}
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
            ${MAJOR_EVENT_DETAIL_FIELDS}
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
            ${MAJOR_EVENT_DETAIL_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateMajorEvent));
  }

  cloneMajorEvent(id: string, input: MajorEventCloneInput) {
    return this.graphqlHttp
      .request<{ cloneMajorEvent: MajorEvent }>(
        `mutation CloneMajorEvent($id: String!, $input: MajorEventCloneInput) {
          cloneMajorEvent(id: $id, input: $input) {
            ${MAJOR_EVENT_DETAIL_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.cloneMajorEvent));
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
}
