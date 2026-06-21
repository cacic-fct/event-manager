import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import {
  DeletionResult,
  EventManagerPermissionGrant,
  EventManagerPermissionGrantInput,
  EventManagerPermissionGrantScope,
  EventManagerPermissionGrantTarget,
  EventManagerPermissionGrantUpdateInput,
} from './models';

@Injectable({ providedIn: 'root' })
export class PermissionGrantsApiService {
  private readonly graphqlHttp = inject(GraphqlHttpService);

  listUserGrants(userId: string) {
    return this.graphqlHttp
      .request<{ eventManagerPermissionGrants: EventManagerPermissionGrant[] }>(
        `query EventManagerPermissionGrants($userId: String!) {
          eventManagerPermissionGrants(userId: $userId) {
            ${PERMISSION_GRANT_FIELDS}
          }
        }`,
        { userId },
      )
      .pipe(map((data) => data.eventManagerPermissionGrants));
  }

  listTargets(scope: EventManagerPermissionGrantScope, filters?: { take?: number }) {
    return this.graphqlHttp
      .request<{ eventManagerPermissionGrantTargets: EventManagerPermissionGrantTarget[] }>(
        `query EventManagerPermissionGrantTargets($scope: EventManagerPermissionGrantScope!, $take: Int) {
          eventManagerPermissionGrantTargets(scope: $scope, take: $take) {
            id
            label
            description
            emoji
            startDate
            endDate
          }
        }`,
        { scope, take: filters?.take },
      )
      .pipe(map((data) => data.eventManagerPermissionGrantTargets ?? []));
  }

  createGrant(input: EventManagerPermissionGrantInput) {
    return this.graphqlHttp
      .request<{ createEventManagerPermissionGrant: EventManagerPermissionGrant }>(
        `mutation CreateEventManagerPermissionGrant($input: EventManagerPermissionGrantCreateInput!) {
          createEventManagerPermissionGrant(input: $input) {
            ${PERMISSION_GRANT_FIELDS}
          }
        }`,
        { input },
      )
      .pipe(map((data) => data.createEventManagerPermissionGrant));
  }

  updateGrant(id: string, input: EventManagerPermissionGrantUpdateInput) {
    return this.graphqlHttp
      .request<{ updateEventManagerPermissionGrant: EventManagerPermissionGrant }>(
        `mutation UpdateEventManagerPermissionGrant($id: String!, $input: EventManagerPermissionGrantUpdateInput!) {
          updateEventManagerPermissionGrant(id: $id, input: $input) {
            ${PERMISSION_GRANT_FIELDS}
          }
        }`,
        { id, input },
      )
      .pipe(map((data) => data.updateEventManagerPermissionGrant));
  }

  deleteGrant(id: string) {
    return this.graphqlHttp
      .request<{ deleteEventManagerPermissionGrant: DeletionResult }>(
        `mutation DeleteEventManagerPermissionGrant($id: String!) {
          deleteEventManagerPermissionGrant(id: $id) {
            deleted
            id
          }
        }`,
        { id },
      )
      .pipe(map((data) => data.deleteEventManagerPermissionGrant));
  }
}

const PERMISSION_GRANT_FIELDS = `
  id
  userId
  personId
  permission
  scope
  eventId
  majorEventId
  eventGroupId
  targetLabel
  validFrom
  validUntil
  createdAt
  createdById
  updatedAt
  updatedById
`;
