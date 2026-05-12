import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { SubscriptionStatus, WorkspaceEventSubscription, WorkspaceMajorEventSubscription } from './models';
import { EVENT_FIELDS, MAJOR_EVENT_FIELDS, PERSON_FIELDS } from './graphql-query-fragments';

const WORKSPACE_EVENT_SUBSCRIPTION_FIELDS = `
  id
  eventId
  personId
  eventGroupSubscriptionId
  createdAt
  createdById
  createdByMethod
  isLecturerSubscription
  event {
    ${EVENT_FIELDS}
  }
  person {
    ${PERSON_FIELDS}
  }
`;

const WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS = `
  id
  majorEventId
  personId
  subscriptionStatus
  amountPaid
  paymentDate
  paymentTier
  createdAt
  createdById
  createdByMethod
  majorEvent {
    ${MAJOR_EVENT_FIELDS}
  }
  person {
    ${PERSON_FIELDS}
  }
  events {
    eventId
    eventName
    eventStartDate
    subscribed
    isLecturerSubscription
  }
`;

@Injectable({ providedIn: 'root' })
export class SubscriptionApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listEventSubscriptions(eventId: string) {
    return this.graphqlHttp
      .request<{ workspaceEventSubscriptions: WorkspaceEventSubscription[] }>(
        `query WorkspaceEventSubscriptions($eventId: String!) {
          workspaceEventSubscriptions(eventId: $eventId) {
            ${WORKSPACE_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { eventId },
      )
      .pipe(map((data) => data.workspaceEventSubscriptions));
  }

  createEventSubscription(input: { eventId: string; personId: string }) {
    return this.graphqlHttp
      .request<{
        createWorkspaceEventSubscription: WorkspaceEventSubscription;
      }>(
        `mutation CreateWorkspaceEventSubscription(
          $input: WorkspaceEventSubscriptionCreateInput!
        ) {
          createWorkspaceEventSubscription(input: $input) {
            ${WORKSPACE_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createWorkspaceEventSubscription));
  }

  listMajorEventSubscriptions(majorEventId: string) {
    return this.graphqlHttp
      .request<{
        workspaceMajorEventSubscriptions: WorkspaceMajorEventSubscription[];
      }>(
        `query WorkspaceMajorEventSubscriptions($majorEventId: String!) {
          workspaceMajorEventSubscriptions(majorEventId: $majorEventId) {
            ${WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { majorEventId },
      )
      .pipe(map((data) => data.workspaceMajorEventSubscriptions));
  }

  createMajorEventSubscription(input: {
    majorEventId: string;
    personId: string;
    subscriptionStatus?: SubscriptionStatus;
    amountPaid?: number | null;
    paymentDate?: string | null;
    paymentTier?: string | null;
    selectedEventIds: string[];
  }) {
    return this.graphqlHttp
      .request<{
        createWorkspaceMajorEventSubscription: WorkspaceMajorEventSubscription;
      }>(
        `mutation CreateWorkspaceMajorEventSubscription(
          $input: WorkspaceMajorEventSubscriptionCreateInput!
        ) {
          createWorkspaceMajorEventSubscription(input: $input) {
            ${WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createWorkspaceMajorEventSubscription));
  }

  updateMajorEventSubscription(
    id: string,
    input: {
      subscriptionStatus?: SubscriptionStatus;
      amountPaid?: number | null;
      paymentDate?: string | null;
      paymentTier?: string | null;
      selectedEventIds?: string[];
    },
  ) {
    return this.graphqlHttp
      .request<{
        updateWorkspaceMajorEventSubscription: WorkspaceMajorEventSubscription;
      }>(
        `mutation UpdateWorkspaceMajorEventSubscription(
          $id: String!
          $input: WorkspaceMajorEventSubscriptionUpdateInput!
        ) {
          updateWorkspaceMajorEventSubscription(id: $id, input: $input) {
            ${WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateWorkspaceMajorEventSubscription));
  }
}
