import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import {
  type EventFormTargetType,
  type GraphqlResponse,
  type PublicEventForm,
  type PublicEventFormResponse,
  type PublicEventFormResults,
  type RequiredSubscriptionFormInterruption,
  type SubmitPublicEventFormResponseInput,
} from '@cacic-fct/event-manager-public-contracts';
import { watchReplayableEventSource } from '@cacic-fct/shared-angular';
import { Observable, map, of } from 'rxjs';
import { graphqlError } from '../shared/rate-limit-error';

const PUBLIC_EVENT_FORM_FIELDS = `
  id
  name
  description
  descriptionImages {
    id
    url
    width
    height
    altText
    caption
  }
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
    priceTierIds
    target {
      type
      id
      name
      emoji
    }
    audiences
    insertInSubscriptionFlow
    requiredInSubscriptionFlow
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

@Service()
export class PublicEventFormApiService {
  private readonly http = inject(HttpClient);

  listCurrentUserFormsForMajorEvents(majorEventIds: readonly string[]): Observable<PublicEventForm[]> {
    const ids = [...new Set(majorEventIds)];
    if (ids.length === 0) return of([]);
    const variables = Object.fromEntries(ids.map((id, index) => [`majorEventId${index}`, id]));
    const declarations = ids.map((_, index) => `$majorEventId${index}: String!`).join(', ');
    const fields = ids.map((_, index) => `
      target${index}: currentUserEventForms(targetType: MAJOR_EVENT, majorEventId: $majorEventId${index}) {
        ${PUBLIC_EVENT_FORM_FIELDS}
      }
    `).join('\n');
    return this.query<Record<string, PublicEventForm[]>>(
      `query CurrentUserMajorEventForms(${declarations}) { ${fields} }`, variables,
    ).pipe(map((data) => Object.values(data).flat()));
  }

  listCurrentUserForms(input: {
    targetType: EventFormTargetType;
    eventId?: string | null;
    majorEventId?: string | null;
    subscriptionFlowOnly?: boolean;
    selectedPriceTierId?: string | null;
  }): Observable<PublicEventForm[]> {
    return this.query<{ currentUserEventForms: PublicEventForm[] }>(
      `
        query CurrentUserEventForms(
          $targetType: EventFormTargetType!
          $eventId: String
          $majorEventId: String
          $subscriptionFlowOnly: Boolean
          $selectedPriceTierId: String
        ) {
          currentUserEventForms(
            targetType: $targetType
            eventId: $eventId
            majorEventId: $majorEventId
            subscriptionFlowOnly: $subscriptionFlowOnly
            selectedPriceTierId: $selectedPriceTierId
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
    const params = new URLSearchParams({ targetType: input.targetType });
    if (input.eventId) {
      params.set('eventId', input.eventId);
    }
    if (input.majorEventId) {
      params.set('majorEventId', input.majorEventId);
    }

    return watchReplayableEventSource(
      `/api/event-forms/${encodeURIComponent(input.formId)}/current-user-results/events?${params.toString()}`,
      {
        decode: () => undefined,
        errorMessage: 'Não foi possível acompanhar os resultados em tempo real.',
      },
    );
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
