import { ConflictException } from '@nestjs/common';
import { People, Prisma } from '@prisma/client';
import {
  isRecord,
  readArray,
  readNullableNumber,
  readNullableString,
  readRequiredNumber,
  readRequiredString,
  readStringArray,
} from './json-payload';
import {
  AttendanceSnapshot,
  MovedRelationsSnapshot,
  PermissionGroupMembershipSnapshot,
  PersonSnapshot,
  RoleAssignmentScopeSnapshot,
  RoleAssignmentSnapshot,
  SportsOfficialAssignmentSnapshot,
  SportsTeamRepresentativeSnapshot,
  SportsTournamentParticipantSnapshot,
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
    const requiredFields = [
      'status',
      'category',
      'currentAssessment',
      'createdById',
      'committedById',
      'createdByMethod',
      'collectedLatitude',
      'collectedLongitude',
      'collectedAccuracyMeters',
    ];
    if (requiredFields.some((field) => !Object.prototype.hasOwnProperty.call(entry, field))) {
      throw new ConflictException('Attendance merge snapshot is incomplete and cannot be safely undone.');
    }
    return {
      eventId: readRequiredString(entry, 'eventId'),
      status: readRequiredString(entry, 'status') as AttendanceSnapshot['status'],
      category: readRequiredString(entry, 'category') as AttendanceSnapshot['category'],
      currentAssessment: readNullableString(entry, 'currentAssessment') as AttendanceSnapshot['currentAssessment'],
      attendedAt: readRequiredString(entry, 'attendedAt'),
      createdAt: readRequiredString(entry, 'createdAt'),
      createdById: readNullableString(entry, 'createdById'),
      committedById: readNullableString(entry, 'committedById'),
      createdByMethod: readRequiredString(entry, 'createdByMethod') as AttendanceSnapshot['createdByMethod'],
      collectedLatitude: readNullableNumber(entry, 'collectedLatitude'),
      collectedLongitude: readNullableNumber(entry, 'collectedLongitude'),
      collectedAccuracyMeters: readNullableNumber(entry, 'collectedAccuracyMeters'),
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
    movedSportsTeamRepresentativeIds:
      value.movedSportsTeamRepresentativeIds === undefined
        ? []
        : readStringArray(value, 'movedSportsTeamRepresentativeIds'),
    revokedSportsTeamRepresentativeIds:
      value.revokedSportsTeamRepresentativeIds === undefined
        ? []
        : readStringArray(value, 'revokedSportsTeamRepresentativeIds'),
    sportsTeamRepresentativeSnapshots:
      value.sportsTeamRepresentativeSnapshots === undefined
        ? []
        : readSportsTeamRepresentativeSnapshots(value.sportsTeamRepresentativeSnapshots),
    movedSportsTournamentParticipantIds:
      value.movedSportsTournamentParticipantIds === undefined
        ? []
        : readStringArray(value, 'movedSportsTournamentParticipantIds'),
    sportsTournamentParticipantSnapshots:
      value.sportsTournamentParticipantSnapshots === undefined
        ? []
        : readSportsTournamentParticipantSnapshots(value.sportsTournamentParticipantSnapshots),
    movedSportsOfficialAssignmentIds:
      value.movedSportsOfficialAssignmentIds === undefined
        ? []
        : readStringArray(value, 'movedSportsOfficialAssignmentIds'),
    sportsOfficialAssignmentSnapshots:
      value.sportsOfficialAssignmentSnapshots === undefined
        ? []
        : readSportsOfficialAssignmentSnapshots(value.sportsOfficialAssignmentSnapshots),
  };
}

function readSportsTournamentParticipantSnapshots(value: Prisma.JsonValue): SportsTournamentParticipantSnapshot[] {
  return readArrayValue(value, 'sportsTournamentParticipantSnapshots').map((entry) => ({
    id: readRequiredString(entry, 'id'),
    tournamentId: readRequiredString(entry, 'tournamentId'),
    personId: readRequiredString(entry, 'personId'),
    deletedAt: readNullableString(entry, 'deletedAt'),
  }));
}

function readSportsOfficialAssignmentSnapshots(value: Prisma.JsonValue): SportsOfficialAssignmentSnapshot[] {
  return readArrayValue(value, 'sportsOfficialAssignmentSnapshots').map((entry) => ({
    id: readRequiredString(entry, 'id'),
    tournamentId: readRequiredString(entry, 'tournamentId'),
    categoryId: readNullableString(entry, 'categoryId'),
    matchId: readNullableString(entry, 'matchId'),
    personId: readRequiredString(entry, 'personId'),
    role: readRequiredString(entry, 'role') as SportsOfficialAssignmentSnapshot['role'],
    active: readBoolean(entry, 'active'),
    assignedAt: readRequiredString(entry, 'assignedAt'),
    assignedById: readRequiredString(entry, 'assignedById'),
    revokedAt: readNullableString(entry, 'revokedAt'),
    revokedById: readNullableString(entry, 'revokedById'),
    revision: readRequiredNumber(entry, 'revision'),
    createdAt: readRequiredString(entry, 'createdAt'),
  }));
}

function readSportsTeamRepresentativeSnapshots(value: Prisma.JsonValue): SportsTeamRepresentativeSnapshot[] {
  return readArrayValue(value, 'sportsTeamRepresentativeSnapshots').map((entry) => ({
    id: readRequiredString(entry, 'id'),
    teamId: readRequiredString(entry, 'teamId'),
    personId: readRequiredString(entry, 'personId'),
    active: readBoolean(entry, 'active'),
    assignedAt: readRequiredString(entry, 'assignedAt'),
    assignedById: readRequiredString(entry, 'assignedById'),
    revokedAt: readNullableString(entry, 'revokedAt'),
    revokedById: readNullableString(entry, 'revokedById'),
    createdAt: readRequiredString(entry, 'createdAt'),
    mergeRevokedAt: readNullableString(entry, 'mergeRevokedAt'),
    mergeRevokedById: readNullableString(entry, 'mergeRevokedById'),
    mergeTargetRepresentativeId: readNullableString(entry, 'mergeTargetRepresentativeId'),
  }));
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
