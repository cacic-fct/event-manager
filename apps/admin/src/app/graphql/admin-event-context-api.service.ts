import { Service, inject } from '@angular/core';
import { AdminEventContextPage, AdminEventContextPageOptions } from '@cacic-fct/event-manager-admin-contracts';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';

@Service()
export class AdminEventContextApiService {
  private readonly graphql = inject(GraphqlHttpService);

  listPage(options: AdminEventContextPageOptions = {}) {
    return this.graphql.request<{ adminEventContextPage: AdminEventContextPage }>(
      `query AdminEventContextPage($parentKind: AdminEventContextKind, $parentId: String, $childKind: AdminEventContextKind, $query: String, $cursor: String, $take: Int, $startDateFrom: DateTime, $startDateUntil: DateTime, $isInGroup: Boolean, $isInMajorEvent: Boolean) {
        adminEventContextPage(parentKind: $parentKind, parentId: $parentId, childKind: $childKind, query: $query, cursor: $cursor, take: $take, startDateFrom: $startDateFrom, startDateUntil: $startDateUntil, isInGroup: $isInGroup, isInMajorEvent: $isInMajorEvent) {
          nodes {
            kind id name emoji startDate endDate eventType locationDescription publicationState hasChildren
            ancestors { kind id name emoji }
          }
          nextCursor
        }
      }`, { ...options },
    ).pipe(map((data) => data.adminEventContextPage));
  }
}
