import { Service, inject } from '@angular/core';
import type { EventMaterial } from '@cacic-fct/shared-event-preparation';
import { firstValueFrom } from 'rxjs';
import { GraphqlHttpService } from '../graphql/graphql-http.service';

export type ContentReviewDecision = 'APPROVE' | 'REJECT';

export interface ContentReviewItem {
  key: string;
  authorName: string;
  authorEditingBlocked?: boolean | null;
  fields: { key: string; before: string | null; after: string | null }[];
  beforeMaterial: EventMaterial | null;
  afterMaterial: EventMaterial | null;
}

export interface ContentReviewGroup {
  id: string;
  revision: number;
  updatedAt: string;
  targetName: string;
  isProfile: boolean;
  profileEditingBlocked?: boolean | null;
  items: ContentReviewItem[];
}

export interface ContentReviewPage {
  groups: ContentReviewGroup[];
  hasNextPage: boolean;
}

@Service()
export class ContentReviewsApi {
  private readonly graphql = inject(GraphqlHttpService);

  async list(page: number, id: string | null): Promise<ContentReviewPage> {
    const { contentReviews } = await firstValueFrom(
      this.graphql.request<{ contentReviews: ContentReviewPage }>(
        `query ContentReviews($page: Int!, $id: String) {
        contentReviews(page: $page, id: $id) {
          hasNextPage
          groups {
            id revision updatedAt targetName isProfile profileEditingBlocked
            items {
              key authorName authorEditingBlocked fields { key before after }
              beforeMaterial { title url releaseAfterEvent }
              afterMaterial { title url releaseAfterEvent }
            }
          }
        }
      }`,
        { page, id },
      ),
    );
    return contentReviews;
  }

  async blockEditing(group: ContentReviewGroup, key: string | null): Promise<void> {
    await firstValueFrom(
      this.graphql.request<{ blockContentReviewEditing: boolean }>(
        `mutation BlockContentReviewEditing($id: String!, $revision: Int!, $key: String) {
          blockContentReviewEditing(id: $id, revision: $revision, key: $key)
        }`,
        { id: group.id, revision: group.revision, key },
      ),
    );
  }

  async decide(group: ContentReviewGroup, keys: string[], decision: ContentReviewDecision): Promise<void> {
    await firstValueFrom(
      this.graphql.request<{ decideContentReview: boolean }>(
        `mutation DecideContentReview($id: String!, $revision: Int!, $keys: [String!]!, $decision: ContentReviewDecision!) {
        decideContentReview(id: $id, revision: $revision, keys: $keys, decision: $decision)
      }`,
        { id: group.id, revision: group.revision, keys, decision },
      ),
    );
  }
}
