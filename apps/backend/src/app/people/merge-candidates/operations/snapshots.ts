import { ConflictException } from '@nestjs/common';
import { People, Prisma } from '@prisma/client';
import { isRecord, readArray, readNullableString, readRequiredString, readStringArray } from './json-payload';
import {
  MovedRelationsSnapshot,
  PermissionGroupMembershipSnapshot,
  PersonSnapshot,
  RoleAssignmentScopeSnapshot,
  RoleAssignmentSnapshot,
} from './types';

export function toPersonSnapshot(person: People): PersonSnapshot {
  return {
    name: person.name,
    email: person.email,
    secondaryEmails: person.secondaryEmails,
    identityDocument: person.identityDocument,
    academicId: person.academicId,
    userId: person.userId,
    externalRef: person.externalRef,
    mergedIntoId: person.mergedIntoId,
    deletedAt: person.deletedAt ? person.deletedAt.toISOString() : null,
  };
}

export function toPersonUpdateData(snapshot: PersonSnapshot): Prisma.PeopleUncheckedUpdateInput {
  return {
    name: snapshot.name,
    email: snapshot.email,
    secondaryEmails: snapshot.secondaryEmails,
    identityDocument: snapshot.identityDocument,
    academicId: snapshot.academicId,
    userId: snapshot.userId,
    externalRef: snapshot.externalRef,
    mergedIntoId: snapshot.mergedIntoId,
    deletedAt: snapshot.deletedAt ? new Date(snapshot.deletedAt) : null,
  };
}

export function parsePersonSnapshot(value: Prisma.JsonValue, fieldName: string): PersonSnapshot {
  if (!isRecord(value)) {
    throw new ConflictException(`Invalid ${fieldName} payload.`);
  }

  const name = readRequiredString(value, 'name');
  return {
    name,
    email: readNullableString(value, 'email'),
    secondaryEmails: value.secondaryEmails === undefined ? [] : readStringArray(value, 'secondaryEmails'),
    identityDocument: readNullableString(value, 'identityDocument'),
    academicId: readNullableString(value, 'academicId'),
    userId: readNullableString(value, 'userId'),
    externalRef: readNullableString(value, 'externalRef'),
    mergedIntoId: readNullableString(value, 'mergedIntoId'),
    deletedAt: readNullableString(value, 'deletedAt'),
  };
}

export function parseMovedRelations(value: Prisma.JsonValue): MovedRelationsSnapshot {
  if (!isRecord(value)) {
    throw new ConflictException('Invalid movedRelations payload.');
  }

  const sourceAttendances = readArray(value, 'sourceAttendances').map((entry) => {
    if (!isRecord(entry)) {
      throw new ConflictException('Invalid sourceAttendances payload entry.');
    }
    return {
      eventId: readRequiredString(entry, 'eventId'),
      attendedAt: readRequiredString(entry, 'attendedAt'),
      createdAt: readRequiredString(entry, 'createdAt'),
      createdById: readNullableString(entry, 'createdById'),
      committedById: readNullableString(entry, 'committedById'),
    };
  });

  const sourceLectures = readArray(value, 'sourceLectures').map((entry) => {
    if (!isRecord(entry)) {
      throw new ConflictException('Invalid sourceLectures payload entry.');
    }

    return {
      eventId: readRequiredString(entry, 'eventId'),
      createdAt: readRequiredString(entry, 'createdAt'),
      createdById: readNullableString(entry, 'createdById'),
    };
  });

  return {
    sourceAttendances,
    sourceLectures,
    insertedAttendanceEventIds: readStringArray(value, 'insertedAttendanceEventIds'),
    insertedLectureEventIds: readStringArray(value, 'insertedLectureEventIds'),
    movedEventSubscriptionIds: readStringArray(value, 'movedEventSubscriptionIds'),
    movedEventGroupSubscriptionIds:
      value.movedEventGroupSubscriptionIds === undefined
        ? []
        : readStringArray(value, 'movedEventGroupSubscriptionIds'),
    movedMajorEventSubscriptionIds: readStringArray(value, 'movedMajorEventSubscriptionIds'),
    movedRoleAssignmentIds:
      value.movedRoleAssignmentIds === undefined ? [] : readStringArray(value, 'movedRoleAssignmentIds'),
    archivedRoleAssignmentIds:
      value.archivedRoleAssignmentIds === undefined ? [] : readStringArray(value, 'archivedRoleAssignmentIds'),
    movedPermissionGroupMembershipIds:
      value.movedPermissionGroupMembershipIds === undefined
        ? []
        : readStringArray(value, 'movedPermissionGroupMembershipIds'),
    archivedPermissionGroupMembershipIds:
      value.archivedPermissionGroupMembershipIds === undefined
        ? []
        : readStringArray(value, 'archivedPermissionGroupMembershipIds'),
    roleAssignmentSnapshots:
      value.roleAssignmentSnapshots === undefined ? [] : readRoleAssignmentSnapshots(value.roleAssignmentSnapshots),
    roleAssignmentScopeSnapshots:
      value.roleAssignmentScopeSnapshots === undefined
        ? []
        : readRoleAssignmentScopeSnapshots(value.roleAssignmentScopeSnapshots),
    permissionGroupMembershipSnapshots:
      value.permissionGroupMembershipSnapshots === undefined
        ? []
        : readPermissionGroupMembershipSnapshots(value.permissionGroupMembershipSnapshots),
  };
}

function readRoleAssignmentSnapshots(value: Prisma.JsonValue): RoleAssignmentSnapshot[] {
  return readArrayValue(value, 'roleAssignmentSnapshots').map((entry) => ({
    id: readRequiredString(entry, 'id'),
    personId: readNullableString(entry, 'personId'),
    validFrom: readNullableString(entry, 'validFrom'),
    validUntil: readNullableString(entry, 'validUntil'),
    unlimited: readBoolean(entry, 'unlimited'),
    archivedAt: readNullableString(entry, 'archivedAt'),
    archivedReason: readNullableString(entry, 'archivedReason'),
  }));
}

function readRoleAssignmentScopeSnapshots(value: Prisma.JsonValue): RoleAssignmentScopeSnapshot[] {
  return readArrayValue(value, 'roleAssignmentScopeSnapshots').map((entry) => ({
    id: readRequiredString(entry, 'id'),
    assignmentId: readRequiredString(entry, 'assignmentId'),
    validFrom: readNullableString(entry, 'validFrom'),
    validUntil: readNullableString(entry, 'validUntil'),
    unlimited: readBoolean(entry, 'unlimited'),
    archivedAt: readNullableString(entry, 'archivedAt'),
    archivedReason: readNullableString(entry, 'archivedReason'),
  }));
}

function readPermissionGroupMembershipSnapshots(value: Prisma.JsonValue): PermissionGroupMembershipSnapshot[] {
  return readArrayValue(value, 'permissionGroupMembershipSnapshots').map((entry) => ({
    id: readRequiredString(entry, 'id'),
    personId: readRequiredString(entry, 'personId'),
    validFrom: readNullableString(entry, 'validFrom'),
    validUntil: readNullableString(entry, 'validUntil'),
    unlimited: readBoolean(entry, 'unlimited'),
    archivedAt: readNullableString(entry, 'archivedAt'),
    archivedReason: readNullableString(entry, 'archivedReason'),
  }));
}

function readArrayValue(value: Prisma.JsonValue, fieldName: string): Record<string, Prisma.JsonValue>[] {
  return readArray({ [fieldName]: value }, fieldName).map((entry) => {
    if (!isRecord(entry)) {
      throw new ConflictException(`Invalid ${fieldName} payload entry.`);
    }
    return entry;
  });
}

function readBoolean(value: Record<string, Prisma.JsonValue>, fieldName: string): boolean {
  if (typeof value[fieldName] !== 'boolean') {
    throw new ConflictException(`Invalid ${fieldName} payload.`);
  }
  return value[fieldName] as boolean;
}
