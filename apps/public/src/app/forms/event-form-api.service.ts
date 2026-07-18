import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, inject } from '@angular/core';
import {
  type EventFormTargetType,
  type GraphqlResponse,
  type PublicEventForm,
  type PublicEventFormResponse,
  type PublicEventFormResults,
  type RequiredSubscriptionFormInterruption,
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
  responseMode
  resultsPublic
  resultsLive
  allowResponseEdits
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
    allowLecturerManualPublish
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

const PUBLIC_EVENT_FORM_RESULTS_FIELDS = `
  responseCount
  anonymous
  answersReleased
  summaryJson
  form {
    ${PUBLIC_EVENT_FORM_FIELDS}
  }
  responses {
    ${PUBLIC_EVENT_FORM_RESPONSE_FIELDS}
  }
`;

@Injectable({ providedIn: 'root' })
export class PublicEventFormApiService {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);

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

  listRequiredSubscriptionFormInterruptions(): Observable<RequiredSubscriptionFormInterruption[]> {
    return this.query<{ currentUserRequiredSubscriptionFormInterruptions: RequiredSubscriptionFormInterruption[] }>(
      `
        query CurrentUserRequiredSubscriptionFormInterruptions {
          currentUserRequiredSubscriptionFormInterruptions {
            formId
            linkId
            targetType
            eventId
            majorEventId
            displayOrder
          }
        }
      `,
    ).pipe(map((data) => data.currentUserRequiredSubscriptionFormInterruptions));
  }

  getCurrentUserResponse(input: {
    formId: string;
    linkId?: string | null;
    targetType: EventFormTargetType;
    eventId?: string | null;
    majorEventId?: string | null;
  }): Observable<PublicEventFormResponse | null> {
    return this.query<{ currentUserEventFormResponse: PublicEventFormResponse | null }>(
      `
        query CurrentUserEventFormResponse(
          $formId: String!
          $linkId: String
          $targetType: EventFormTargetType!
          $eventId: String
          $majorEventId: String
        ) {
          currentUserEventFormResponse(
            formId: $formId
            linkId: $linkId
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

  getCurrentUserResults(input: {
    formId: string;
    targetType: EventFormTargetType;
    eventId?: string | null;
    majorEventId?: string | null;
  }) {
    return this.query<{ currentUserEventFormResults: PublicEventFormResults }>(
      `
        query CurrentUserEventFormResults(
          $formId: String!
          $targetType: EventFormTargetType!
          $eventId: String
          $majorEventId: String
        ) {
          currentUserEventFormResults(
            formId: $formId
            targetType: $targetType
            eventId: $eventId
            majorEventId: $majorEventId
          ) {
            ${PUBLIC_EVENT_FORM_RESULTS_FIELDS}
          }
        }
      `,
      input,
    ).pipe(map((data) => data.currentUserEventFormResults));
  }

  watchCurrentUserResults(input: {
    formId: string;
    targetType: EventFormTargetType;
    eventId?: string | null;
    majorEventId?: string | null;
  }): Observable<void> {
    return new Observable<void>((subscriber) => {
      const params = new URLSearchParams({ targetType: input.targetType });
      if (input.eventId) {
        params.set('eventId', input.eventId);
      }
      if (input.majorEventId) {
        params.set('majorEventId', input.majorEventId);
      }

      const source = new EventSource(
        `/api/event-forms/${encodeURIComponent(input.formId)}/current-user-results/events?${params.toString()}`,
        { withCredentials: true },
      );

      source.onmessage = () => {
        this.zone.run(() => subscriber.next());
      };
      source.onerror = () => {
        this.zone.run(() => subscriber.error(new Error('Não foi possível acompanhar os resultados em tempo real.')));
        source.close();
      };

      return () => source.close();
    });
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
