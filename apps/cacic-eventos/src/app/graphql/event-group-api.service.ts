import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { DeletionResult, EventGroup, EventGroupInput } from './models';
import { EVENT_GROUP_FIELDS } from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class EventGroupApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listEventGroups(filters?: { query?: string; skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{ eventGroups: EventGroup[] }>(
        `query ListEventGroups($query: String, $skip: Int, $take: Int) {
          eventGroups(query: $query, skip: $skip, take: $take) {
            ${EVENT_GROUP_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.eventGroups));
  }

  getEventGroup(id: string) {
    return this.graphqlHttp
      .request<{ eventGroup: EventGroup }>(
        `query GetEventGroup($id: String!) {
          eventGroup(id: $id) {
            ${EVENT_GROUP_FIELDS}
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.eventGroup));
  }

  createEventGroup(input: EventGroupInput) {
    return this.graphqlHttp
      .request<{ createEventGroup: EventGroup }>(
        `mutation CreateEventGroup($input: EventGroupCreateInput!) {
          createEventGroup(input: $input) {
            ${EVENT_GROUP_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createEventGroup));
  }

  updateEventGroup(id: string, input: EventGroupInput) {
    return this.graphqlHttp
      .request<{ updateEventGroup: EventGroup }>(
        `mutation UpdateEventGroup($id: String!, $input: EventGroupUpdateInput!) {
          updateEventGroup(id: $id, input: $input) {
            ${EVENT_GROUP_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateEventGroup));
  }

  deleteEventGroup(id: string) {
    return this.graphqlHttp
      .request<{ deleteEventGroup: DeletionResult }>(
        `mutation DeleteEventGroup($id: String!) {
          deleteEventGroup(id: $id) {
            deleted
            id
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.deleteEventGroup));
  }
}