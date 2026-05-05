import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { DeletionResult, Event, EventInput, EventLecturer } from './models';
import { EVENT_FIELDS, PERSON_FIELDS } from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class EventApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listEvents(filters?: {
    query?: string;
    startDateFrom?: string;
    startDateTo?: string;
    majorEventId?: string;
    eventGroupId?: string;
    isInGroup?: boolean;
    isInMajorEvent?: boolean;
    skip?: number;
    take?: number;
  }) {
    return this.graphqlHttp
      .request<{ events: Event[] }>(
        `query ListEvents(
          $query: String
          $startDateFrom: DateTime
          $startDateTo: DateTime
          $majorEventId: String
          $eventGroupId: String
          $isInGroup: Boolean
          $isInMajorEvent: Boolean
          $skip: Int
          $take: Int
        ) {
          events(
            query: $query
            startDateFrom: $startDateFrom
            startDateTo: $startDateTo
            majorEventId: $majorEventId
            eventGroupId: $eventGroupId
            isInGroup: $isInGroup
            isInMajorEvent: $isInMajorEvent
            skip: $skip
            take: $take
          ) {
            ${EVENT_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.events));
  }

  getEvent(id: string) {
    return this.graphqlHttp
      .request<{ event: Event }>(
        `query GetEvent($id: String!) {
          event(id: $id) {
            ${EVENT_FIELDS}
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.event));
  }

  createEvent(input: EventInput) {
    return this.graphqlHttp
      .request<{ createEvent: Event }>(
        `mutation CreateEvent($input: EventCreateInput!) {
          createEvent(input: $input) {
            ${EVENT_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createEvent));
  }

  updateEvent(id: string, input: EventInput) {
    return this.graphqlHttp
      .request<{ updateEvent: Event }>(
        `mutation UpdateEvent($id: String!, $input: EventUpdateInput!) {
          updateEvent(id: $id, input: $input) {
            ${EVENT_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateEvent));
  }

  deleteEvent(id: string) {
    return this.graphqlHttp
      .request<{ deleteEvent: DeletionResult }>(
        `mutation DeleteEvent($id: String!) {
          deleteEvent(id: $id) {
            deleted
            id
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.deleteEvent));
  }

  listEventLecturers(eventId: string) {
    return this.graphqlHttp
      .request<{ eventLecturers: EventLecturer[] }>(
        `query ListEventLecturers($eventId: String) {
          eventLecturers(eventId: $eventId) {
            eventId
            personId
            createdAt
            person {
              ${PERSON_FIELDS}
            }
          }
        }`,
        { eventId },
      )
      .pipe(map((data) => data.eventLecturers));
  }

  createEventLecturer(input: { eventId: string; personId: string }) {
    return this.graphqlHttp
      .request<{ createEventLecturer: EventLecturer }>(
        `mutation CreateEventLecturer($input: EventLecturerCreateInput!) {
          createEventLecturer(input: $input) {
            eventId
            personId
            createdAt
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createEventLecturer));
  }

  deleteEventLecturer(eventId: string, personId: string) {
    return this.graphqlHttp
      .request<{ deleteEventLecturer: DeletionResult }>(
        `mutation DeleteEventLecturer($eventId: String!, $personId: String!) {
          deleteEventLecturer(eventId: $eventId, personId: $personId) {
            deleted
            eventId
            personId
          }
        }`,
        { eventId, personId },
      )
      .pipe(map((data) => data.deleteEventLecturer));
  }
}
