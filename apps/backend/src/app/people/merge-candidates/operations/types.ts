import {
  AttendanceCategory,
  AttendanceCreationMethod,
  AttendanceCurrentAssessment,
  EventAttendanceStatus,
  SportsOfficialRole,
} from '@prisma/client';

export type MergeMatchMethod = 'CPF' | 'EMAIL' | 'NORMALIZED_NAME';

export type CandidateMatch = {
  personAId: string;
  personBId: string;
  pairKey: string;
  method: MergeMatchMethod;
  matchValue: string;
  score: number;
};

export type MatchablePerson = {
  id: string;
  identityDocument: string | null;
  email: string | null;
  name: string;
};

export type PersonSnapshot = {
  name: string;
  email: string | null;
  secondaryEmails: string[];
  identityDocument: string | null;
  academicId: string | null;
  userId: string | null;
  externalRef: string | null;
  mergedIntoId: string | null;
  deletedAt: string | null;
};

export type AttendanceSnapshot = {
  eventId: string;
  status: EventAttendanceStatus;
  category: AttendanceCategory;
  currentAssessment: AttendanceCurrentAssessment | null;
  attendedAt: string;
  createdAt: string;
  createdById: string | null;
  committedById: string | null;
  createdByMethod: AttendanceCreationMethod;
  collectedLatitude: number | null;
  collectedLongitude: number | null;
  collectedAccuracyMeters: number | null;
};

export type SportsTeamRepresentativeSnapshot = {
  id: string;
  teamId: string;
  personId: string;
  active: boolean;
  assignedAt: string;
  assignedById: string;
  revokedAt: string | null;
  revokedById: string | null;
  createdAt: string;
  mergeRevokedAt: string | null;
  mergeRevokedById: string | null;
  mergeTargetRepresentativeId: string | null;
};

export type SportsTournamentParticipantSnapshot = {
  id: string;
  tournamentId: string;
  personId: string;
  deletedAt: string | null;
};

export type SportsOfficialAssignmentSnapshot = {
  id: string;
  tournamentId: string;
  categoryId: string | null;
  matchId: string | null;
  personId: string;
  role: SportsOfficialRole;
  active: boolean;
  assignedAt: string;
  assignedById: string;
  revokedAt: string | null;
  revokedById: string | null;
  revision: number;
  createdAt: string;
};

export type LectureSnapshot = {
  eventId: string;
  createdAt: string;
  createdById: string | null;
};

export type RoleAssignmentSnapshot = {
  id: string;
  personId: string | null;
  validFrom: string | null;
  validUntil: string | null;
  unlimited: boolean;
  archivedAt: string | null;
  archivedReason: string | null;
};

export type RoleAssignmentScopeSnapshot = {
  id: string;
  assignmentId: string;
  validFrom: string | null;
  validUntil: string | null;
  unlimited: boolean;
  archivedAt: string | null;
  archivedReason: string | null;
};

export type PermissionGroupMembershipSnapshot = {
  id: string;
  personId: string;
  validFrom: string | null;
  validUntil: string | null;
  unlimited: boolean;
  archivedAt: string | null;
  archivedReason: string | null;
};

export type MovedRelationsSnapshot = {
  sourceAttendances: AttendanceSnapshot[];
  sourceLectures: LectureSnapshot[];
  insertedAttendanceEventIds: string[];
  insertedLectureEventIds: string[];
  movedEventSubscriptionIds: string[];
  movedEventGroupSubscriptionIds: string[];
  movedMajorEventSubscriptionIds: string[];
  movedRoleAssignmentIds: string[];
  archivedRoleAssignmentIds: string[];
  movedPermissionGroupMembershipIds: string[];
  archivedPermissionGroupMembershipIds: string[];
  roleAssignmentSnapshots: RoleAssignmentSnapshot[];
  roleAssignmentScopeSnapshots: RoleAssignmentScopeSnapshot[];
  permissionGroupMembershipSnapshots: PermissionGroupMembershipSnapshot[];
  movedSportsTeamRepresentativeIds: string[];
  revokedSportsTeamRepresentativeIds: string[];
  sportsTeamRepresentativeSnapshots: SportsTeamRepresentativeSnapshot[];
  movedSportsTournamentParticipantIds: string[];
  sportsTournamentParticipantSnapshots: SportsTournamentParticipantSnapshot[];
  movedSportsOfficialAssignmentIds: string[];
  sportsOfficialAssignmentSnapshots: SportsOfficialAssignmentSnapshot[];
};
