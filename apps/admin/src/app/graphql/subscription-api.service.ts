import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { SubscriptionStatus, WorkspaceEventSubscription, WorkspaceMajorEventSubscription } from './models';
import { PERSON_EXPORT_FIELDS } from './graphql-query-fragments';

const WORKSPACE_EVENT_SUBSCRIPTION_FIELDS = `
  id
  eventId
  personId
  eventGroupSubscriptionId
  majorEventSubscriptionId
  createdAt
  createdById
  createdByMethod
  isLecturerSubscription
  person {
    ${PERSON_EXPORT_FIELDS}
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
    id
    name
  }
  person {
    ${PERSON_EXPORT_FIELDS}
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

  listEventSubscriptions(eventId: string, filters?: { skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{ workspaceEventSubscriptions: WorkspaceEventSubscription[] }>(
        `query WorkspaceEventSubscriptions($eventId: String!, $skip: Int, $take: Int) {
          workspaceEventSubscriptions(eventId: $eventId, skip: $skip, take: $take) {
            ${WORKSPACE_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { eventId, skip: filters?.skip, take: filters?.take },
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

  listMajorEventSubscriptions(majorEventId: string, filters?: { skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{
        workspaceMajorEventSubscriptions: WorkspaceMajorEventSubscription[];
      }>(
        `query WorkspaceMajorEventSubscriptions($majorEventId: String!, $skip: Int, $take: Int) {
          workspaceMajorEventSubscriptions(majorEventId: $majorEventId, skip: $skip, take: $take) {
            ${WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { majorEventId, skip: filters?.skip, take: filters?.take },
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
