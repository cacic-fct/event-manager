import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  SubscriptionStatus,
  WorkspaceEventSubscription,
  WorkspaceMajorEventSubscription,
} from '@cacic-fct/event-manager-admin-contracts';
import { PERSON_EXPORT_FIELDS } from './graphql-query-fragments';
import { SubscriberCsvExportDialogOptions } from '../subscriptions/subscriber-csv-export';

export interface SubscriptionBadgeArchiveDownload {
  blob: Blob;
  fileName: string;
}

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
  private readonly http = inject(HttpClient);

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

  listMajorEventSubscriptions(majorEventId: string, filters?: { query?: string; skip?: number; take?: number }) {
    return this.graphqlHttp
      .request<{
        workspaceMajorEventSubscriptions: WorkspaceMajorEventSubscription[];
      }>(
        `query WorkspaceMajorEventSubscriptions($majorEventId: String!, $query: String, $skip: Int, $take: Int) {
          workspaceMajorEventSubscriptions(majorEventId: $majorEventId, query: $query, skip: $skip, take: $take) {
            ${WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { majorEventId, query: filters?.query, skip: filters?.skip, take: filters?.take },
      )
      .pipe(map((data) => data.workspaceMajorEventSubscriptions));
  }

  getMajorEventSubscription(majorEventId: string, subscriptionId: string) {
    return this.graphqlHttp
      .request<{
        workspaceMajorEventSubscription: WorkspaceMajorEventSubscription;
      }>(
        `query WorkspaceMajorEventSubscription($majorEventId: String!, $subscriptionId: String!) {
          workspaceMajorEventSubscription(majorEventId: $majorEventId, subscriptionId: $subscriptionId) {
            ${WORKSPACE_MAJOR_EVENT_SUBSCRIPTION_FIELDS}
          }
        }`,
        { majorEventId, subscriptionId },
      )
      .pipe(map((data) => data.workspaceMajorEventSubscription));
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

  downloadEventSubscriptionBadgeArchive(eventId: string, options: SubscriberCsvExportDialogOptions) {
    return this.downloadBadgeArchive(
      `/api/subscription-exports/events/${encodeURIComponent(eventId)}/badges.zip`,
      options,
    );
  }

  downloadMajorEventSubscriptionBadgeArchive(majorEventId: string, options: SubscriberCsvExportDialogOptions) {
    return this.downloadBadgeArchive(
      `/api/subscription-exports/major-events/${encodeURIComponent(majorEventId)}/badges.zip`,
      options,
    );
  }

  private downloadBadgeArchive(url: string, options: SubscriberCsvExportDialogOptions) {
    return this.http
      .post(
        url,
        {
          fields: options.fields,
          identityDocumentMode: options.identityDocumentMode,
          errorCorrectionLevel: options.badgeCodes.errorCorrectionLevel,
          format: options.badgeCodes.format,
          fileName: options.badgeCodes.fileName,
        },
        { observe: 'response', responseType: 'blob' },
      )
      .pipe(
        map((response): SubscriptionBadgeArchiveDownload => {
          if (!response.body) {
            throw new Error('O arquivo de códigos não foi retornado pelo servidor.');
          }

          return {
            blob: response.body,
            fileName: this.fileNameFromDisposition(response.headers.get('content-disposition')),
          };
        }),
      );
  }

  private fileNameFromDisposition(disposition: string | null): string {
    const encodedMatch = disposition?.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    const fileName = encodedMatch
      ? decodeURIComponent(encodedMatch[1])
      : disposition?.match(/filename="?([^";]+)"?/i)?.[1];
    return fileName?.replace(/[\\/]/g, '') || 'codigos-para-cracha.zip';
  }
}
