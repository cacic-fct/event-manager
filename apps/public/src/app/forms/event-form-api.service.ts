import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  type EventFormTargetType,
  type GraphqlResponse,
  type PublicEventForm,
  type PublicEventFormResponse,
  type SubmitPublicEventFormResponseInput,
} from '@cacic-fct/event-manager-public-contracts';
import { Observable, map } from 'rxjs';
import { graphqlError } from '../shared/rate-limit-error';

const PUBLIC_EVENT_FORM_FIELDS = `
  id
  name
  description
  elementsJson
  sigilo
  resultsPublic
  resultsLive
  publicationState
  links {
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
    lastNotifiedAt
    responseCount
    createdAt
    updatedAt
  }
  responseCount
  createdAt
  updatedAt
`;

const PUBLIC_EVENT_FORM_RESPONSE_FIELDS = `
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
`;

@Injectable({ providedIn: 'root' })
export class PublicEventFormApiService {
  private readonly http = inject(HttpClient);

  listCurrentUserForms(input: {
    targetType: EventFormTargetType;
    eventId?: string | null;
    majorEventId?: string | null;
    subscriptionFlowOnly?: boolean;
  }): Observable<PublicEventForm[]> {
    return this.query<{ currentUserEventForms: PublicEventForm[] }>(
      `
        query CurrentUserEventForms(
          $targetType: EventFormTargetType!
          $eventId: String
          $majorEventId: String
          $subscriptionFlowOnly: Boolean
        ) {
          currentUserEventForms(
            targetType: $targetType
            eventId: $eventId
            majorEventId: $majorEventId
            subscriptionFlowOnly: $subscriptionFlowOnly
          ) {
            ${PUBLIC_EVENT_FORM_FIELDS}
          }
        }
      `,
      input,
    ).pipe(map((data) => data.currentUserEventForms));
  }

  getCurrentUserResponse(input: {
    formId: string;
    targetType: EventFormTargetType;
    eventId?: string | null;
    majorEventId?: string | null;
  }): Observable<PublicEventFormResponse | null> {
    return this.query<{ currentUserEventFormResponse: PublicEventFormResponse | null }>(
      `
        query CurrentUserEventFormResponse(
          $formId: String!
          $targetType: EventFormTargetType!
          $eventId: String
          $majorEventId: String
        ) {
          currentUserEventFormResponse(
            formId: $formId
            targetType: $targetType
            eventId: $eventId
            majorEventId: $majorEventId
          ) {
            ${PUBLIC_EVENT_FORM_RESPONSE_FIELDS}
          }
        }
      `,
      input,
    ).pipe(map((data) => data.currentUserEventFormResponse));
  }

  submit(input: SubmitPublicEventFormResponseInput): Observable<PublicEventFormResponse> {
    return this.query<{ submitCurrentUserEventFormResponse: PublicEventFormResponse }>(
      `
        mutation SubmitCurrentUserEventFormResponse($input: SubmitEventFormResponseInput!) {
          submitCurrentUserEventFormResponse(input: $input) {
            ${PUBLIC_EVENT_FORM_RESPONSE_FIELDS}
          }
        }
      `,
      { input },
    ).pipe(map((data) => data.submitCurrentUserEventFormResponse));
  }

  private query<TData>(query: string, variables?: Record<string, unknown>): Observable<TData> {
    return this.http.post<GraphqlResponse<TData>>('/api/graphql', { query, variables }).pipe(
      map((response) => {
        if (response.errors?.length) {
          throw graphqlError(response.errors);
        }

        if (!response.data) {
          throw new Error('Resposta GraphQL sem dados.');
        }

        return response.data;
      }),
    );
  }
}
