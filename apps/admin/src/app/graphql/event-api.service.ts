import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  DeletionResult,
  Event,
  EventAttendanceCollector,
  EventCloneInput,
  EventDraft,
  EventInput,
  EventLecturer,
  EventSummary,
} from './models';
import {
  EVENT_DETAIL_FIELDS,
  EVENT_DRAFT_FIELDS,
  EVENT_LIST_FIELDS,
  PERSON_SEARCH_FIELDS,
} from './graphql-query-fragments';

@Injectable({ providedIn: 'root' })
export class EventApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listEvents(filters?: {
    query?: string;
    startDateFrom?: string;
    startDateUntil?: string;
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
          $startDateUntil: DateTime
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
            startDateUntil: $startDateUntil
            majorEventId: $majorEventId
            eventGroupId: $eventGroupId
            isInGroup: $isInGroup
            isInMajorEvent: $isInMajorEvent
            skip: $skip
            take: $take
          ) {
            ${EVENT_LIST_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.events));
  }

  listEventsSummary(filters?: { skip?: number; take?: number; isInGroup?: boolean }) {
    return this.graphqlHttp
      .request<{ events: EventSummary[] }>(
        `query ListEventsSummary($skip: Int, $take: Int, $isInGroup: Boolean) {
          events(skip: $skip, take: $take, isInGroup: $isInGroup) {
            id
            eventGroupId
            startDate
            endDate
            createdAt
            name
            majorEvent {
              id
              name
            }
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
            ${EVENT_DETAIL_FIELDS}
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.event));
  }

  createEvent(input: EventInput) {
    return this.graphqlHttp
      .request<{ createEvent: Pick<Event, 'id'> }>(
        `mutation CreateEvent($input: EventCreateInput!) {
          createEvent(input: $input) {
            id
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createEvent));
  }

  updateEvent(id: string, input: EventInput) {
    return this.graphqlHttp
      .request<{ updateEvent: Pick<Event, 'id'> }>(
        `mutation UpdateEvent($id: String!, $input: EventUpdateInput!) {
          updateEvent(id: $id, input: $input) {
            id
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateEvent));
  }

  listEventDrafts(filters: { sourceEventId?: string; sourceEventIds?: string[] }) {
    return this.graphqlHttp
      .request<{ eventDrafts: EventDraft[] }>(
        `query ListEventDrafts($sourceEventId: String, $sourceEventIds: [String!]) {
          eventDrafts(sourceEventId: $sourceEventId, sourceEventIds: $sourceEventIds) {
            ${EVENT_DRAFT_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.eventDrafts));
  }

  saveEventDraft(input: { sourceEventId: string; draftId?: string | null; input: EventInput }) {
    return this.graphqlHttp
      .request<{ saveEventDraft: EventDraft }>(
        `mutation SaveEventDraft($input: EventDraftSaveInput!) {
          saveEventDraft(input: $input) {
            ${EVENT_DRAFT_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.saveEventDraft));
  }

  applyEventDraft(draftId: string) {
    return this.graphqlHttp
      .request<{ applyEventDraft: Pick<Event, 'id'> }>(
        `mutation ApplyEventDraft($draftId: String!) {
          applyEventDraft(draftId: $draftId) {
            id
          }
        }`,
        { draftId },
      )
      .pipe(map((data) => data.applyEventDraft));
  }

  deleteEventDraft(draftId: string) {
    return this.graphqlHttp
      .request<{ deleteEventDraft: DeletionResult }>(
        `mutation DeleteEventDraft($draftId: String!) {
          deleteEventDraft(draftId: $draftId) {
            deleted
            id
            eventId
          }
        }`,
        { draftId },
      )
      .pipe(map((data) => data.deleteEventDraft));
  }

  deleteEventDraftsForEvent(sourceEventId: string) {
    return this.graphqlHttp
      .request<{ deleteEventDraftsForEvent: DeletionResult }>(
        `mutation DeleteEventDraftsForEvent($sourceEventId: String!) {
          deleteEventDraftsForEvent(sourceEventId: $sourceEventId) {
            deleted
            id
            eventId
          }
        }`,
        { sourceEventId },
      )
      .pipe(map((data) => data.deleteEventDraftsForEvent));
  }

  cloneEvent(id: string, input: EventCloneInput) {
    return this.graphqlHttp
      .request<{ cloneEvent: Pick<Event, 'id'> }>(
        `mutation CloneEvent($id: String!, $input: EventCloneInput) {
          cloneEvent(id: $id, input: $input) {
            id
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.cloneEvent));
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
              ${PERSON_SEARCH_FIELDS}
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

  listEventAttendanceCollectors(eventId: string) {
    return this.graphqlHttp
      .request<{ eventAttendanceCollectors: EventAttendanceCollector[] }>(
        `query ListEventAttendanceCollectors($eventId: String) {
          eventAttendanceCollectors(eventId: $eventId) {
            eventId
            personId
            createdAt
            person {
              ${PERSON_SEARCH_FIELDS}
            }
          }
        }`,
        { eventId },
      )
      .pipe(map((data) => data.eventAttendanceCollectors));
  }

  createEventAttendanceCollector(input: { eventId: string; personId: string }) {
    return this.graphqlHttp
      .request<{ createEventAttendanceCollector: EventAttendanceCollector }>(
        `mutation CreateEventAttendanceCollector($input: EventAttendanceCollectorCreateInput!) {
          createEventAttendanceCollector(input: $input) {
            eventId
            personId
            createdAt
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createEventAttendanceCollector));
  }

  deleteEventAttendanceCollector(eventId: string, personId: string) {
    return this.graphqlHttp
      .request<{ deleteEventAttendanceCollector: DeletionResult }>(
        `mutation DeleteEventAttendanceCollector($eventId: String!, $personId: String!) {
          deleteEventAttendanceCollector(eventId: $eventId, personId: $personId) {
            deleted
            eventId
            personId
          }
        }`,
        { eventId, personId },
      )
      .pipe(map((data) => data.deleteEventAttendanceCollector));
  }
}
