import { Injectable, inject } from '@angular/core';
import type { DashboardInconsistency } from '@cacic-fct/shared-frontend-types';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { PublicationState, PublicationTargetType } from './models';

export type PublicationBulkOperation = 'PUBLISH_MISSING_CHILDREN' | 'SCHEDULE_BUNDLE' | 'UNPUBLISH_BUNDLE';

export interface PublicContentNode {
  targetType: PublicationTargetType;
  id: string;
  label: string;
  publicationState: PublicationState;
  statusLabel: string;
  scheduledPublishAt?: string | null;
  publishedAt?: string | null;
  unpublishedAt?: string | null;
  publiclyVisible?: boolean | null;
  parentLabel?: string | null;
  childCount: number;
  children: PublicContentNode[];
}

export interface PublicContentWorkspace {
  generatedAt: string;
  tree?: PublicContentNode[];
  items: PublicContentNode[];
  totalCount: number;
  skip: number;
  take: number;
  hasMore: boolean;
  query?: string | null;
  warnings: DashboardInconsistency[];
}

export interface PublicationActionResult {
  ok: boolean;
  message: string;
  affectedEventIds: string[];
  affectedMajorEventIds: string[];
}

export interface PublicContentPreviewResult {
  url: string;
  directPublicUrl: boolean;
  expiresAt?: string | null;
  message: string;
}

export interface PublicationStateInput {
  targetType: PublicationTargetType;
  targetId: string;
  state: PublicationState;
  scheduledPublishAt?: string | null;
}

export interface PublicationBulkInput {
  targetType: PublicationTargetType;
  targetId: string;
  operation: PublicationBulkOperation;
  scheduledPublishAt?: string | null;
}

export interface PublicContentPreviewInput {
  targetType: PublicationTargetType;
  targetId: string;
  previewAt?: string | null;
}

export interface PublicContentWorkspaceFilters {
  query?: string | null;
  skip?: number;
  take?: number;
  focusTargetType?: PublicationTargetType | null;
  focusTargetId?: string | null;
}

const PUBLIC_CONTENT_NODE_FIELDS = `
  targetType
  id
  label
  publicationState
  statusLabel
  scheduledPublishAt
  publishedAt
  unpublishedAt
  publiclyVisible
  parentLabel
  childCount
`;

@Injectable({ providedIn: 'root' })
export class PublicationApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  getWorkspace(filters?: PublicContentWorkspaceFilters) {
    const variables: Record<string, unknown> | undefined = filters
      ? {
          query: filters.query,
          skip: filters.skip,
          take: filters.take,
          focusTargetType: filters.focusTargetType,
          focusTargetId: filters.focusTargetId,
        }
      : undefined;

    return this.graphqlHttp
      .request<{ publicContentWorkspace: PublicContentWorkspace }>(
        `query PublicContentWorkspace(
          $query: String
          $skip: Int
          $take: Int
          $focusTargetType: PublicationTargetType
          $focusTargetId: String
        ) {
          publicContentWorkspace(
            query: $query
            skip: $skip
            take: $take
            focusTargetType: $focusTargetType
            focusTargetId: $focusTargetId
          ) {
            generatedAt
            totalCount
            skip
            take
            hasMore
            query
            warnings {
              type
              action
              targetId
              severity
              title
              description
              eventId
              relatedEventId
              personId
            }
            items {
              ${PUBLIC_CONTENT_NODE_FIELDS}
              children {
                ${PUBLIC_CONTENT_NODE_FIELDS}
              }
            }
          }
        }`,
        variables,
      )
      .pipe(map((data) => data.publicContentWorkspace));
  }

  setPublicationState(input: PublicationStateInput) {
    return this.graphqlHttp
      .request<{ setPublicationState: PublicationActionResult }>(
        `mutation SetPublicationState($input: PublicationStateInput!) {
          setPublicationState(input: $input) {
            ok
            message
            affectedEventIds
            affectedMajorEventIds
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.setPublicationState));
  }

  runBulkOperation(input: PublicationBulkInput) {
    return this.graphqlHttp
      .request<{ runPublicationBulkOperation: PublicationActionResult }>(
        `mutation RunPublicationBulkOperation($input: PublicationBulkInput!) {
          runPublicationBulkOperation(input: $input) {
            ok
            message
            affectedEventIds
            affectedMajorEventIds
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.runPublicationBulkOperation));
  }

  createPreview(input: PublicContentPreviewInput) {
    return this.graphqlHttp
      .request<{ createPublicContentPreview: PublicContentPreviewResult }>(
        `mutation CreatePublicContentPreview($input: PublicContentPreviewInput!) {
          createPublicContentPreview(input: $input) {
            url
            directPublicUrl
            expiresAt
            message
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createPublicContentPreview));
  }
}
