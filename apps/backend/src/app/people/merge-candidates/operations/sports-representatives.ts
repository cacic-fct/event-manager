import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  SportsOfficialAssignment,
  SportsTeamRepresentative,
  SportsTournamentParticipant,
} from '@prisma/client';
import {
  SportsOfficialAssignmentSnapshot,
  SportsTeamRepresentativeSnapshot,
  SportsTournamentParticipantSnapshot,
} from './types';

export type SportsRepresentativeMergeSnapshot = {
  movedSportsTeamRepresentativeIds: string[];
  revokedSportsTeamRepresentativeIds: string[];
  sportsTeamRepresentativeSnapshots: SportsTeamRepresentativeSnapshot[];
};

export type SportsPersonRelationsMergeSnapshot = SportsRepresentativeMergeSnapshot & {
  movedSportsTournamentParticipantIds: string[];
  sportsTournamentParticipantSnapshots: SportsTournamentParticipantSnapshot[];
  movedSportsOfficialAssignmentIds: string[];
  sportsOfficialAssignmentSnapshots: SportsOfficialAssignmentSnapshot[];
};

export async function moveSportsPersonRelations(
  tx: Prisma.TransactionClient,
  targetPersonId: string,
  sourcePersonId: string,
  revokedById: string | null = null,
): Promise<SportsPersonRelationsMergeSnapshot> {
  // These person ids represent current participation or authorization. Audit
  // actors and submitters elsewhere retain their original person id because
  // they describe who performed a historical action.
  const participants = await moveSportsTournamentParticipants(tx, targetPersonId, sourcePersonId);
  const officials = await moveSportsOfficialAssignments(tx, targetPersonId, sourcePersonId);
  const representatives = await moveSportsTeamRepresentatives(tx, targetPersonId, sourcePersonId, revokedById);

  return {
    ...participants,
    ...officials,
    ...representatives,
  };
}

async function moveSportsTournamentParticipants(
  tx: Prisma.TransactionClient,
  targetPersonId: string,
  sourcePersonId: string,
): Promise<
  Pick<
    SportsPersonRelationsMergeSnapshot,
    'movedSportsTournamentParticipantIds' | 'sportsTournamentParticipantSnapshots'
  >
> {
  const sourceParticipants = await tx.sportsTournamentParticipant.findMany({
    where: { personId: sourcePersonId },
  });
  if (sourceParticipants.length === 0) {
    return {
      movedSportsTournamentParticipantIds: [],
      sportsTournamentParticipantSnapshots: [],
    };
  }

  const tournamentIds = [...new Set(sourceParticipants.map((participant) => participant.tournamentId))];
  const targetParticipants = await tx.sportsTournamentParticipant.findMany({
    where: {
      personId: targetPersonId,
      tournamentId: { in: tournamentIds },
      deletedAt: null,
    },
    select: { tournamentId: true },
  });
  const targetTournamentIds = new Set(targetParticipants.map((participant) => participant.tournamentId));

  for (const sourceParticipant of sourceParticipants) {
    if (sourceParticipant.deletedAt === null && targetTournamentIds.has(sourceParticipant.tournamentId)) {
      throw new ConflictException(
        `Cannot merge active sports participant ${sourceParticipant.id} because the target person already participates in tournament ${sourceParticipant.tournamentId}.`,
      );
    }
  }

  const movedSportsTournamentParticipantIds: string[] = [];
  for (const sourceParticipant of sourceParticipants) {
    if (targetTournamentIds.has(sourceParticipant.tournamentId)) {
      continue;
    }
    await tx.sportsTournamentParticipant.update({
      where: { id: sourceParticipant.id },
      data: { personId: targetPersonId },
    });
    movedSportsTournamentParticipantIds.push(sourceParticipant.id);
  }

  return {
    movedSportsTournamentParticipantIds,
    sportsTournamentParticipantSnapshots: sourceParticipants.map(toSportsTournamentParticipantSnapshot),
  };
}

async function moveSportsOfficialAssignments(
  tx: Prisma.TransactionClient,
  targetPersonId: string,
  sourcePersonId: string,
): Promise<
  Pick<SportsPersonRelationsMergeSnapshot, 'movedSportsOfficialAssignmentIds' | 'sportsOfficialAssignmentSnapshots'>
> {
  const sourceAssignments = await tx.sportsOfficialAssignment.findMany({
    where: { personId: sourcePersonId },
  });
  if (sourceAssignments.length === 0) {
    return {
      movedSportsOfficialAssignmentIds: [],
      sportsOfficialAssignmentSnapshots: [],
    };
  }

  const tournamentIds = [...new Set(sourceAssignments.map((assignment) => assignment.tournamentId))];
  const targetAssignments = await tx.sportsOfficialAssignment.findMany({
    where: {
      personId: targetPersonId,
      tournamentId: { in: tournamentIds },
    },
  });
  const targetByScope = new Map<string, SportsOfficialAssignment[]>();
  for (const targetAssignment of targetAssignments) {
    const scopeAssignments = targetByScope.get(officialScopeKey(targetAssignment)) ?? [];
    scopeAssignments.push(targetAssignment);
    targetByScope.set(officialScopeKey(targetAssignment), scopeAssignments);
  }

  for (const sourceAssignment of sourceAssignments) {
    const targetScopeAssignments = targetByScope.get(officialScopeKey(sourceAssignment)) ?? [];
    if (targetScopeAssignments.length === 0 || !isEffectiveRepresentative(sourceAssignment)) {
      continue;
    }
    if (!targetScopeAssignments.some(isEffectiveRepresentative)) {
      throw new ConflictException(
        `Cannot merge active sports official assignment ${sourceAssignment.id} because the target person has a revoked assignment for the same scope.`,
      );
    }
  }

  const movedSportsOfficialAssignmentIds: string[] = [];
  const sportsOfficialAssignmentSnapshots = sourceAssignments.map(toSportsOfficialAssignmentSnapshot);

  for (const sourceAssignment of sourceAssignments) {
    const targetScopeAssignments = targetByScope.get(officialScopeKey(sourceAssignment)) ?? [];
    if (targetScopeAssignments.length === 0) {
      await tx.sportsOfficialAssignment.update({
        where: { id: sourceAssignment.id },
        data: { personId: targetPersonId },
      });
      movedSportsOfficialAssignmentIds.push(sourceAssignment.id);
      continue;
    }

    if (!isEffectiveRepresentative(sourceAssignment)) {
      continue;
    }

    await tx.sportsOfficialAssignment.update({
      where: { id: sourceAssignment.id },
      data: { personId: targetPersonId },
    });
    movedSportsOfficialAssignmentIds.push(sourceAssignment.id);
  }

  return {
    movedSportsOfficialAssignmentIds,
    sportsOfficialAssignmentSnapshots,
  };
}

export async function moveSportsTeamRepresentatives(
  tx: Prisma.TransactionClient,
  targetPersonId: string,
  sourcePersonId: string,
  revokedById: string | null = null,
): Promise<SportsRepresentativeMergeSnapshot> {
  const sourceRepresentatives = await tx.sportsTeamRepresentative.findMany({
    where: { personId: sourcePersonId },
  });
  if (sourceRepresentatives.length === 0) {
    return emptySportsRepresentativeMergeSnapshot();
  }

  const teamIds = [...new Set(sourceRepresentatives.map((representative) => representative.teamId))];
  const targetRepresentatives = await tx.sportsTeamRepresentative.findMany({
    where: {
      personId: targetPersonId,
      teamId: { in: teamIds },
    },
  });
  const targetByTeamId = new Map(
    targetRepresentatives.map((representative) => [representative.teamId, representative]),
  );

  for (const sourceRepresentative of sourceRepresentatives) {
    const targetRepresentative = targetByTeamId.get(sourceRepresentative.teamId);
    if (!targetRepresentative || !isEffectiveRepresentative(sourceRepresentative)) {
      continue;
    }

    if (!isEffectiveRepresentative(targetRepresentative)) {
      throw new ConflictException(
        `Cannot merge active sports representative ${sourceRepresentative.id} into team ${sourceRepresentative.teamId} because the target person has a revoked representative record.`,
      );
    }
  }

  const movedSportsTeamRepresentativeIds: string[] = [];
  const revokedSportsTeamRepresentativeIds: string[] = [];
  const sportsTeamRepresentativeSnapshots = sourceRepresentatives.map(toSportsTeamRepresentativeSnapshot);
  const snapshotsById = new Map(sportsTeamRepresentativeSnapshots.map((snapshot) => [snapshot.id, snapshot]));

  for (const sourceRepresentative of sourceRepresentatives) {
    const targetRepresentative = targetByTeamId.get(sourceRepresentative.teamId);
    if (!targetRepresentative) {
      await tx.sportsTeamRepresentative.update({
        where: { id: sourceRepresentative.id },
        data: { personId: targetPersonId },
      });
      movedSportsTeamRepresentativeIds.push(sourceRepresentative.id);
      continue;
    }

    if (isEffectiveRepresentative(sourceRepresentative) && isEffectiveRepresentative(targetRepresentative)) {
      const mergeRevokedAt = new Date();
      await tx.sportsTeamRepresentative.update({
        where: { id: sourceRepresentative.id },
        data: {
          active: false,
          revokedAt: mergeRevokedAt,
          revokedById,
        },
      });
      const snapshot = snapshotsById.get(sourceRepresentative.id);
      if (snapshot) {
        snapshot.mergeRevokedAt = mergeRevokedAt.toISOString();
        snapshot.mergeRevokedById = revokedById;
        snapshot.mergeTargetRepresentativeId = targetRepresentative.id;
      }
      revokedSportsTeamRepresentativeIds.push(sourceRepresentative.id);
    }
  }

  return {
    movedSportsTeamRepresentativeIds,
    revokedSportsTeamRepresentativeIds,
    sportsTeamRepresentativeSnapshots,
  };
}

export function emptySportsRepresentativeMergeSnapshot(): SportsRepresentativeMergeSnapshot {
  return {
    movedSportsTeamRepresentativeIds: [],
    revokedSportsTeamRepresentativeIds: [],
    sportsTeamRepresentativeSnapshots: [],
  };
}

function toSportsTournamentParticipantSnapshot(
  participant: SportsTournamentParticipant,
): SportsTournamentParticipantSnapshot {
  return {
    id: participant.id,
    tournamentId: participant.tournamentId,
    personId: participant.personId,
    deletedAt: participant.deletedAt?.toISOString() ?? null,
  };
}

function toSportsOfficialAssignmentSnapshot(assignment: SportsOfficialAssignment): SportsOfficialAssignmentSnapshot {
  return {
    id: assignment.id,
    tournamentId: assignment.tournamentId,
    categoryId: assignment.categoryId,
    matchId: assignment.matchId,
    personId: assignment.personId,
    role: assignment.role,
    active: assignment.active,
    assignedAt: assignment.assignedAt.toISOString(),
    assignedById: assignment.assignedById,
    revokedAt: assignment.revokedAt?.toISOString() ?? null,
    revokedById: assignment.revokedById,
    revision: assignment.revision,
    createdAt: assignment.createdAt.toISOString(),
  };
}

function officialScopeKey(
  assignment: Pick<SportsOfficialAssignment, 'tournamentId' | 'categoryId' | 'matchId' | 'role'>,
): string {
  return [assignment.tournamentId, assignment.categoryId ?? '', assignment.matchId ?? '', assignment.role].join(':');
}

export function toSportsTeamRepresentativeSnapshot(
  representative: SportsTeamRepresentative,
): SportsTeamRepresentativeSnapshot {
  return {
    id: representative.id,
    teamId: representative.teamId,
    personId: representative.personId,
    active: representative.active,
    assignedAt: representative.assignedAt.toISOString(),
    assignedById: representative.assignedById,
    revokedAt: representative.revokedAt?.toISOString() ?? null,
    revokedById: representative.revokedById,
    createdAt: representative.createdAt.toISOString(),
    mergeRevokedAt: null,
    mergeRevokedById: null,
    mergeTargetRepresentativeId: null,
  };
}

function isEffectiveRepresentative(representative: Pick<SportsTeamRepresentative, 'active' | 'revokedAt'>): boolean {
  return representative.active && representative.revokedAt === null;
}
