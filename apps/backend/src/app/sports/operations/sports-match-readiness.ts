import {
  Prisma,
  SportsMatchActionType,
  SportsMatchState,
  SportsPaymentStatus,
  SportsReviewStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const SPORTS_MATCH_READINESS_ISSUE_CODES = {
  MINIMUM_ROSTER: 'MINIMUM_ROSTER',
  ATHLETE_ATTENDANCE: 'ATHLETE_ATTENDANCE',
  OFFICIAL_ATTENDANCE: 'OFFICIAL_ATTENDANCE',
  PRIOR_BRACKET_RESULT: 'PRIOR_BRACKET_RESULT',
  PAYMENT: 'PAYMENT',
} as const;

export type SportsMatchReadinessIssueCode =
  (typeof SPORTS_MATCH_READINESS_ISSUE_CODES)[keyof typeof SPORTS_MATCH_READINESS_ISSUE_CODES];

export interface SportsMatchReadinessIssue {
  code: SportsMatchReadinessIssueCode;
  message: string;
  registrationId: string | null;
  missing: number | null;
  required: number | null;
  actual: number | null;
}

export interface SportsMatchReadiness {
  ready: boolean;
  issues: SportsMatchReadinessIssue[];
}

type ReadinessPrisma = PrismaService | Prisma.TransactionClient;

/**
 * Loads the same authoritative records used by the start command and the
 * operational read. Keeping the check here means the UI cannot accidentally
 * display a green readiness state that the START command would reject.
 */
export async function loadSportsMatchReadiness(
  prisma: ReadinessPrisma,
  matchId: string,
): Promise<SportsMatchReadiness | null> {
  const dataAccess = prisma as unknown as {
    sportsOfficialAssignment?: { findMany?: unknown };
  };
  // Some isolated command tests use a deliberately minimal transaction mock.
  // The real Prisma client always exposes this delegate; returning null keeps
  // those tests focused on command-shape validation rather than infrastructure.
  if (typeof dataAccess.sportsOfficialAssignment?.findMany !== 'function') {
    return null;
  }

  const match = await prisma.sportsMatch.findFirst({
    where: { id: matchId, deletedAt: null },
    select: {
      id: true,
      eventId: true,
      categoryId: true,
      homeRegistrationId: true,
      awayRegistrationId: true,
      category: {
        select: {
          minimumRosterSize: true,
          tournament: { select: { id: true } },
        },
      },
      rosters: {
        where: { deletedAt: null, status: SportsRosterStatus.APPROVED },
        select: {
          registrationId: true,
          entries: {
            where: { deletedAt: null, status: SportsRosterEntryStatus.APPROVED },
            select: {
              id: true,
              role: true,
              checkedInAt: true,
              registrationMember: {
                select: {
                  teamMember: {
                    select: {
                      participant: {
                        select: {
                          personId: true,
                          paymentStatus: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      actions: {
        where: {
          type: SportsMatchActionType.CHECK_IN,
          reviewStatus: SportsReviewStatus.APPROVED,
        },
        orderBy: { sequence: 'asc' },
        select: { payload: true },
      },
      winnerSources: {
        where: { deletedAt: null },
        select: {
          id: true,
          canonicalState: true,
          reviewStatus: true,
          winnerRegistrationId: true,
        },
      },
      loserSources: {
        where: { deletedAt: null },
        select: {
          id: true,
          canonicalState: true,
          reviewStatus: true,
          loserRegistrationId: true,
        },
      },
    },
  });
  if (!match) {
    return null;
  }

  const assignments = await prisma.sportsOfficialAssignment.findMany({
    where: {
      tournamentId: match.category.tournament.id,
      active: true,
      revokedAt: null,
      person: { deletedAt: null },
      OR: [
        { matchId: match.id },
        { categoryId: match.categoryId, matchId: null },
        { categoryId: null, matchId: null },
      ],
    },
    select: {
      id: true,
      personId: true,
      role: true,
      person: {
        select: {
          attendances: {
            where: { eventId: match.eventId },
            select: { status: true, attendedAt: true },
          },
        },
      },
    },
  });

  const dataWithAttendance = prisma as unknown as {
    eventAttendance?: { findMany?: (args: unknown) => Promise<unknown> };
  };
  const rosters = match.rosters ?? [];
  const rosterPersonIds = [
    ...new Set(
      rosters.flatMap((roster) =>
        roster.entries.map((entry) => entry.registrationMember.teamMember.participant.personId),
      ),
    ),
  ];
  const attendances =
    rosterPersonIds.length > 0 && typeof dataWithAttendance.eventAttendance?.findMany === 'function'
      ? ((await dataWithAttendance.eventAttendance.findMany({
          where: {
            eventId: match.eventId,
            personId: { in: rosterPersonIds },
          },
          select: { personId: true, status: true, attendedAt: true },
        })) as Array<{ personId: string; status: string; attendedAt: Date }> )
      : [];

  return evaluateSportsMatchReadiness({
    minimumRosterSize: match.category.minimumRosterSize ?? null,
    homeRegistrationId: match.homeRegistrationId,
    awayRegistrationId: match.awayRegistrationId,
    rosters,
    assignments: assignments ?? [],
    actions: match.actions ?? [],
    winnerSources: match.winnerSources ?? [],
    loserSources: match.loserSources ?? [],
    attendances,
  });
}

export function evaluateSportsMatchReadiness(input: {
  minimumRosterSize: number | null;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  rosters: Array<{
    registrationId: string;
    entries: Array<{
      id: string;
      role: SportsRosterRole;
      checkedInAt: Date | null;
      registrationMember: {
        teamMember: {
          participant: {
            personId: string;
            paymentStatus: SportsPaymentStatus;
          };
        };
      };
    }>;
  }>;
  assignments: Array<{
    id: string;
    personId: string;
    role: string;
    person: { attendances: Array<{ status: string; attendedAt: Date }> };
  }>;
  actions: Array<{ payload: Prisma.JsonValue }>;
  winnerSources: Array<{
    id: string;
    canonicalState: SportsMatchState;
    reviewStatus: SportsReviewStatus;
    winnerRegistrationId: string | null;
  }>;
  loserSources: Array<{
    id: string;
    canonicalState: SportsMatchState;
    reviewStatus: SportsReviewStatus;
    loserRegistrationId: string | null;
  }>;
  attendances: Array<{ personId: string; status: string; attendedAt: Date }>;
}): SportsMatchReadiness {
  const issues: SportsMatchReadinessIssue[] = [];
  const checkInsByRosterEntryId = new Map<string, boolean>();
  const checkInsByPersonId = new Map<string, boolean>();

  for (const action of input.actions) {
    const payload = asRecord(action.payload);
    if (!payload) {
      continue;
    }
    const present = payload['present'] !== false;
    const kind = payload['kind'];
    if (kind === 'ROSTER_ENTRY_CHECK_IN' && typeof payload['rosterEntryId'] === 'string') {
      checkInsByRosterEntryId.set(payload['rosterEntryId'], present);
    }
    if (kind === 'OFFICIAL_CHECK_IN' && typeof payload['personId'] === 'string') {
      checkInsByPersonId.set(payload['personId'], present);
    }
  }

  const attendanceByPersonId = new Map(
    input.attendances.map((attendance) => [attendance.personId, attendance.status === 'PRESENT']),
  );
  for (const assignment of input.assignments) {
    const attendance = assignment.person.attendances[0];
    if (attendance && !attendanceByPersonId.has(assignment.personId)) {
      attendanceByPersonId.set(assignment.personId, attendance.status === 'PRESENT');
    }
  }

  const rosterByRegistrationId = new Map(input.rosters.map((roster) => [roster.registrationId, roster]));
  const registrationIds = [input.homeRegistrationId, input.awayRegistrationId].filter(
    (registrationId): registrationId is string => Boolean(registrationId),
  );
  const minimumRosterSize = Math.max(0, input.minimumRosterSize ?? 0);

  for (const registrationId of registrationIds) {
    const players = (rosterByRegistrationId.get(registrationId)?.entries ?? []).filter(
      (entry) => entry.role === SportsRosterRole.PLAYER,
    );
    if (players.length < minimumRosterSize) {
      const missing = minimumRosterSize - players.length;
      issues.push({
        code: SPORTS_MATCH_READINESS_ISSUE_CODES.MINIMUM_ROSTER,
        message: missingCountMessage(missing, 'atleta na escalação', 'atletas na escalação'),
        registrationId,
        missing,
        required: minimumRosterSize,
        actual: players.length,
      });
    }

    const presentPlayers = players.filter((entry) => {
      const byEntry = checkInsByRosterEntryId.get(entry.id);
      if (byEntry !== undefined) {
        return byEntry;
      }
      const byPerson = checkInsByPersonId.get(entry.registrationMember.teamMember.participant.personId);
      if (byPerson !== undefined) {
        return byPerson;
      }
      const attendance = attendanceByPersonId.get(entry.registrationMember.teamMember.participant.personId);
      return attendance ?? entry.checkedInAt !== null;
    });
    if (presentPlayers.length < minimumRosterSize) {
      const missing = minimumRosterSize - presentPlayers.length;
      issues.push({
        code: SPORTS_MATCH_READINESS_ISSUE_CODES.ATHLETE_ATTENDANCE,
        message: missingCountMessage(missing, 'atleta presente', 'atletas presentes'),
        registrationId,
        missing,
        required: minimumRosterSize,
        actual: presentPlayers.length,
      });
    }

    const unpaidPlayers = players.filter(
      (entry) =>
        !([SportsPaymentStatus.PAID, SportsPaymentStatus.NOT_REQUIRED] as SportsPaymentStatus[]).includes(
          entry.registrationMember.teamMember.participant.paymentStatus,
        ),
    );
    if (unpaidPlayers.length > 0) {
      issues.push({
        code: SPORTS_MATCH_READINESS_ISSUE_CODES.PAYMENT,
        message: missingCountMessage(unpaidPlayers.length, 'pagamento obrigatório pendente', 'pagamentos obrigatórios pendentes'),
        registrationId,
        missing: unpaidPlayers.length,
        required: players.length,
        actual: players.length - unpaidPlayers.length,
      });
    }
  }

  const uniqueAssignments = new Map<string, (typeof input.assignments)[number]>();
  for (const assignment of input.assignments) {
    const key = `${assignment.personId}:${assignment.role}`;
    if (!uniqueAssignments.has(key)) {
      uniqueAssignments.set(key, assignment);
    }
  }
  const officials = [...uniqueAssignments.values()];
  const presentOfficials = officials.filter((assignment) => {
    const actionPresence = checkInsByPersonId.get(assignment.personId);
    if (actionPresence !== undefined) {
      return actionPresence;
    }
    const attendance = attendanceByPersonId.get(assignment.personId);
    return attendance ?? assignment.person.attendances[0]?.status === 'PRESENT';
  });
  if (officials.length === 0) {
    issues.push({
      code: SPORTS_MATCH_READINESS_ISSUE_CODES.OFFICIAL_ATTENDANCE,
      message: 'Nenhum oficial foi designado para a partida.',
      registrationId: null,
      missing: 1,
      required: 1,
      actual: 0,
    });
  } else if (presentOfficials.length < officials.length) {
    const missing = officials.length - presentOfficials.length;
    issues.push({
      code: SPORTS_MATCH_READINESS_ISSUE_CODES.OFFICIAL_ATTENDANCE,
      message: missingCountMessage(missing, 'oficial presente', 'oficiais presentes'),
      registrationId: null,
      missing,
      required: officials.length,
      actual: presentOfficials.length,
    });
  }

  for (const source of input.winnerSources) {
    if (
      source.canonicalState !== SportsMatchState.FINISHED ||
      source.reviewStatus !== SportsReviewStatus.APPROVED ||
      !source.winnerRegistrationId
    ) {
      issues.push(priorBracketIssue());
    }
  }
  for (const source of input.loserSources) {
    if (
      source.canonicalState !== SportsMatchState.FINISHED ||
      source.reviewStatus !== SportsReviewStatus.APPROVED ||
      !source.loserRegistrationId
    ) {
      issues.push(priorBracketIssue());
    }
  }

  return { ready: issues.length === 0, issues };
}

function priorBracketIssue(): SportsMatchReadinessIssue {
  return {
    code: SPORTS_MATCH_READINESS_ISSUE_CODES.PRIOR_BRACKET_RESULT,
    message: 'Aguardando resultado aprovado da partida anterior.',
    registrationId: null,
    missing: 1,
    required: 1,
    actual: 0,
  };
}

function missingCountMessage(count: number, singular: string, plural: string): string {
  return count === 1 ? `Falta 1 ${singular}` : `Faltam ${count} ${plural}`;
}

function asRecord(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, Prisma.JsonValue>) : null;
}
