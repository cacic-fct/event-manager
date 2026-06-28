import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import {
  EventForm,
  EventFormDraft,
  EventFormInput,
  EventFormResults,
} from '@cacic-fct/event-manager-admin-contracts';
import { GraphqlHttpService } from './graphql-http.service';

const EVENT_FORM_LINK_FIELDS = `
  id
  formId
  targetType
  eventId
  majorEventId
  target {
    type
    id
    name
    emoji
  }
  audience
  insertInSubscriptionFlow
  requiredInSubscriptionFlow
  enforceRequiredAnswers
  displayOrder
  availableFrom
  availableUntil
  notifyOnPublish
  allowLecturerManualPublish
  lastNotifiedAt
  responseCount
  createdAt
  updatedAt
`;

const EVENT_FORM_FIELDS = `
  id
  name
  description
  ownerEventId
  ownerMajorEventId
  owner {
    type
    id
    name
    emoji
  }
  elementsJson
  sigilo
  resultsPublic
  resultsLive
  publicationState
  scheduledPublishAt
  publishedAt
  unpublishedAt
  links {
    ${EVENT_FORM_LINK_FIELDS}
  }
  responseCount
  deletedAt
  createdAt
  createdById
  updatedAt
  updatedById
`;

const EVENT_FORM_DRAFT_FIELDS = `
  id
  sourceFormId
  name
  payloadJson
  createdById
  createdByName
  createdByEmail
  updatedById
  updatedByName
  updatedByEmail
  createdAt
  updatedAt
  expiresAt
`;

@Injectable({ providedIn: 'root' })
export class EventFormApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listForms(filters?: { query?: string; eventId?: string; majorEventId?: string }) {
    return this.graphqlHttp
      .request<{ eventForms: EventForm[] }>(
        `query EventForms($query: String, $eventId: String, $majorEventId: String) {
          eventForms(query: $query, eventId: $eventId, majorEventId: $majorEventId) {
            ${EVENT_FORM_FIELDS}
          }
        }`,
        filters,
      )
      .pipe(map((data) => data.eventForms));
  }

  getForm(formId: string) {
    return this.graphqlHttp
      .request<{ eventForm: EventForm }>(
        `query EventForm($formId: String!) {
          eventForm(formId: $formId) {
            ${EVENT_FORM_FIELDS}
          }
        }`,
        { formId },
      )
      .pipe(map((data) => data.eventForm));
  }

  saveForm(input: EventFormInput) {
    return this.graphqlHttp
      .request<{ saveEventForm: EventForm }>(
        `mutation SaveEventForm($input: EventFormInput!) {
          saveEventForm(input: $input) {
            ${EVENT_FORM_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.saveEventForm));
  }

  listDrafts(sourceFormId: string) {
    return this.graphqlHttp
      .request<{ eventFormDrafts: EventFormDraft[] }>(
        `query EventFormDrafts($sourceFormId: String!) {
          eventFormDrafts(sourceFormId: $sourceFormId) {
            ${EVENT_FORM_DRAFT_FIELDS}
          }
        }`,
        { sourceFormId },
      )
      .pipe(map((data) => data.eventFormDrafts));
  }

  saveDraft(input: { sourceFormId: string; draftId?: string | null; input: EventFormInput }) {
    return this.graphqlHttp
      .request<{ saveEventFormDraft: EventFormDraft }>(
        `mutation SaveEventFormDraft($input: EventFormDraftSaveInput!) {
          saveEventFormDraft(input: $input) {
            ${EVENT_FORM_DRAFT_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.saveEventFormDraft));
  }

  publishForm(input: { formId: string; scheduledPublishAt?: string | null }) {
    return this.graphqlHttp
      .request<{ publishEventForm: EventForm }>(
        `mutation PublishEventForm($input: PublishEventFormInput!) {
          publishEventForm(input: $input) {
            ${EVENT_FORM_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.publishEventForm));
  }

  unpublishForm(formId: string) {
    return this.graphqlHttp
      .request<{ unpublishEventForm: EventForm }>(
        `mutation UnpublishEventForm($formId: String!) {
          unpublishEventForm(formId: $formId) {
            ${EVENT_FORM_FIELDS}
          }
        }`,
        { formId },
      )
      .pipe(map((data) => data.unpublishEventForm));
  }

  deleteForm(formId: string) {
    return this.graphqlHttp
      .request<{ deleteEventForm: EventForm }>(
        `mutation DeleteEventForm($formId: String!) {
          deleteEventForm(formId: $formId) {
            ${EVENT_FORM_FIELDS}
          }
        }`,
        { formId },
      )
      .pipe(map((data) => data.deleteEventForm));
  }

  results(formId: string) {
    return this.graphqlHttp
      .request<{ eventFormResults: EventFormResults }>(
        `query EventFormResults($formId: String!) {
          eventFormResults(formId: $formId) {
            responseCount
            anonymous
            answersReleased
            summaryJson
            form {
              ${EVENT_FORM_FIELDS}
            }
            responses {
              id
              formId
              linkId
              targetType
              eventId
              majorEventId
              personId
              respondentName
              respondentEmail
              answersJson
              source
              submittedAt
              updatedAt
            }
          }
        }`,
        { formId },
      )
      .pipe(map((data) => data.eventFormResults));
  }
}
