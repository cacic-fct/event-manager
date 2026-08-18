export type PermissionScope = 'GLOBAL' | 'EVENT' | 'MAJOR_EVENT' | 'EVENT_GROUP';

export interface PermissionRoleScope {
  id: string;
  scope: PermissionScope;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
  targetLabel?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  unlimited: boolean;
  archivedAt?: string | null;
}

export interface PermissionRoleAssignment {
  id: string;
  personId?: string | null;
  groupId?: string | null;
  subjectName: string;
  subjectHasLinkedUser: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  unlimited: boolean;
  archivedAt?: string | null;
  scopes: PermissionRoleScope[];
}

export interface PermissionRole {
  id: string;
  systemKey?: string | null;
  name: string;
  description: string;
  emoji: string;
  isSystem: boolean;
  isExternal: boolean;
  assignable: boolean;
  version: number;
  permissions: string[];
  inheritedPermissions: string[];
  parentRoleIds: string[];
  assignments: PermissionRoleAssignment[];
  directPeopleCount: number;
  groupPeopleCount: number;
  archivedAt?: string | null;
  updatedAt: string;
}

export interface PermissionGroupMember {
  id: string;
  person: {
    id: string;
    name: string;
    email?: string | null;
    hasLinkedUser: boolean;
  };
  validFrom?: string | null;
  validUntil?: string | null;
  unlimited: boolean;
  archivedAt?: string | null;
}

export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  emoji: string;
  version: number;
  members: PermissionGroupMember[];
  assignedRoleIds: string[];
  archivedAt?: string | null;
  updatedAt: string;
}

export interface PermissionScopeTarget {
  id: string;
  label: string;
  description?: string | null;
  emoji?: string | null;
  parentId?: string | null;
}

export interface PermissionRoleSaveInput {
  id?: string | null;
  expectedVersion?: number | null;
  name: string;
  description: string;
  emoji: string;
  permissions: string[];
  parentRoleIds: string[];
  assignments: Array<{
    personId?: string | null;
    groupId?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
    unlimited: boolean;
    scopes: Array<{
      scope: PermissionScope;
      eventId?: string | null;
      majorEventId?: string | null;
      eventGroupId?: string | null;
      validFrom?: string | null;
      validUntil?: string | null;
      unlimited: boolean;
    }>;
  }>;
}

export interface PermissionGroupSaveInput {
  id?: string | null;
  expectedVersion?: number | null;
  name: string;
  description: string;
  emoji: string;
  members: Array<{
    personId: string;
    validFrom?: string | null;
    validUntil?: string | null;
    unlimited: boolean;
  }>;
}
