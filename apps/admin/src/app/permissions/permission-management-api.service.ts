import { Service, inject } from '@angular/core';
import type {
  PermissionGroup,
  PermissionGroupSaveInput,
  PermissionRole,
  PermissionRoleSaveInput,
  PermissionScope,
  PermissionScopeTarget,
  Person,
} from '@cacic-fct/event-manager-admin-contracts';
import { map } from 'rxjs';
import { GraphqlHttpService } from '../graphql/graphql-http.service';

@Service()
export class PermissionManagementApiService {
  private readonly graphql = inject(GraphqlHttpService);

  listRoles(includeArchived = false) {
    return this.graphql
      .request<{ permissionRoles: PermissionRole[] }>(
        `query PermissionRoles($includeArchived: Boolean) {
      permissionRoles(includeArchived: $includeArchived) {
        id systemKey name description emoji isSystem isExternal assignable version permissions inheritedPermissions
        parentRoleIds directPeopleCount groupPeopleCount archivedAt updatedAt
        assignments {
          id personId groupId subjectName subjectHasLinkedUser validFrom validUntil unlimited archivedAt
          scopes { id scope eventId majorEventId eventGroupId targetLabel validFrom validUntil unlimited archivedAt }
        }
      }
    }`,
        { includeArchived },
      )
      .pipe(map((data) => data.permissionRoles));
  }

  listGroups(includeArchived = false) {
    return this.graphql
      .request<{ permissionGroups: PermissionGroup[] }>(
        `query PermissionGroups($includeArchived: Boolean) {
      permissionGroups(includeArchived: $includeArchived) {
        id name description emoji version assignedRoleIds archivedAt updatedAt
        members {
          id validFrom validUntil unlimited archivedAt
          person { id name email hasLinkedUser }
        }
      }
    }`,
        { includeArchived },
      )
      .pipe(map((data) => data.permissionGroups));
  }

  listTargets(scope: PermissionScope, skip = 0, take = 100) {
    return this.graphql
      .request<{ permissionScopeTargets: PermissionScopeTarget[] }>(
        `query PermissionScopeTargets($scope: EventManagerPermissionScope!, $skip: Int, $take: Int) {
        permissionScopeTargets(scope: $scope, skip: $skip, take: $take) { id label description emoji parentId }
      }`,
        { scope, skip, take },
      )
      .pipe(map((data) => data.permissionScopeTargets));
  }

  searchPeople(query: string) {
    return this.graphql
      .request<{ people: Person[] }>(
        `query PermissionPeople($query: String!) {
        people(query: $query, take: 25) { id name email userId }
      }`,
        { query },
      )
      .pipe(map((data) => data.people));
  }

  getPerson(id: string) {
    return this.graphql
      .request<{ person: Person }>(
        `query PermissionPerson($id: String!) {
        person(id: $id) { id name email userId }
      }`,
        { id },
      )
      .pipe(map((data) => data.person));
  }

  saveRole(input: PermissionRoleSaveInput) {
    return this.graphql
      .request<{ savePermissionRole: PermissionRole }>(
        `mutation SavePermissionRole($input: PermissionRoleSaveInput!) {
        savePermissionRole(input: $input) {
          id systemKey name description emoji isSystem isExternal assignable version permissions inheritedPermissions
          parentRoleIds directPeopleCount groupPeopleCount archivedAt updatedAt
          assignments {
            id personId groupId subjectName subjectHasLinkedUser validFrom validUntil unlimited archivedAt
            scopes { id scope eventId majorEventId eventGroupId targetLabel validFrom validUntil unlimited archivedAt }
          }
        }
      }`,
        { input },
      )
      .pipe(map((data) => data.savePermissionRole));
  }

  saveGroup(input: PermissionGroupSaveInput) {
    return this.graphql
      .request<{ savePermissionGroup: PermissionGroup }>(
        `mutation SavePermissionGroup($input: PermissionGroupSaveInput!) {
        savePermissionGroup(input: $input) {
          id name description emoji version assignedRoleIds archivedAt updatedAt
          members { id validFrom validUntil unlimited archivedAt person { id name email hasLinkedUser } }
        }
      }`,
        { input },
      )
      .pipe(map((data) => data.savePermissionGroup));
  }

  archiveRole(id: string) {
    return this.graphql
      .request<{
        archivePermissionRole: boolean;
      }>(`mutation ArchivePermissionRole($id: String!) { archivePermissionRole(id: $id) }`, { id })
      .pipe(map((data) => data.archivePermissionRole));
  }

  archiveGroup(id: string) {
    return this.graphql
      .request<{
        archivePermissionGroup: boolean;
      }>(`mutation ArchivePermissionGroup($id: String!) { archivePermissionGroup(id: $id) }`, { id })
      .pipe(map((data) => data.archivePermissionGroup));
  }
}
