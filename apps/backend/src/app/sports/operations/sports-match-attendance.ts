import {
  Prisma,
  SportsEligibilityStatus,
  SportsMatchState,
  SportsParticipantStatus,
  SportsRegistrationStatus,
  SportsRosterEntryStatus,
  SportsRosterStatus,
  SportsTeamMemberStatus,
} from '@prisma/client';

type SportsAttendanceTransaction = Prisma.TransactionClient & {
  sportsMatch?: Prisma.TransactionClient['sportsMatch'];
  sportsMatchRosterEntry?: Prisma.TransactionClient['sportsMatchRosterEntry'];
};

export interface SportsMatchAttendanceMutationPublisher {
  publishAttendanceMutation(eventId: string): Promise<void>;
}

export interface SportsMatchAttendanceCheckInPreview {
  matchId: string;
  state: SportsMatchState;
  canonicalState: SportsMatchState;
  revision: number;
  willTransition: boolean;
}

export async function notifySportsMatchAttendanceMutation(
  publisher: SportsMatchAttendanceMutationPublisher | undefined,
  attendance: { eventId: string },
): Promise<void> {
  if (!publisher) {
    return;
  }

  try {
    await publisher.publishAttendanceMutation(attendance.eventId);
  } catch {
    // The transaction is authoritative; realtime delivery is best effort.
  }
}

/**
 * Starts check-in when a present attendance belongs to an approved athlete in
 * this match. The scheduled-state predicate is intentional: attendance
 * corrections must never move a live, paused, or terminal match backwards.
 */
type SportsMatchAttendanceCheckInInput = {
  tx: Prisma.TransactionClient;
  eventId: string;
  personId: string;
  updatedById?: string | null;
};

export function startSportsMatchCheckInFromAthleteAttendance(
  input: SportsMatchAttendanceCheckInInput & { dryRun: true },
): Promise<SportsMatchAttendanceCheckInPreview | null>;
export function startSportsMatchCheckInFromAthleteAttendance(
  input: SportsMatchAttendanceCheckInInput & { dryRun?: false },
): Promise<boolean>;
export async function startSportsMatchCheckInFromAthleteAttendance(
  input: SportsMatchAttendanceCheckInInput & { dryRun?: boolean },
): Promise<boolean | SportsMatchAttendanceCheckInPreview | null> {
  const tx = input.tx as SportsAttendanceTransaction;
  if (!tx.sportsMatch || !tx.sportsMatchRosterEntry) {
    return input.dryRun ? null : false;
  }

  const match = await tx.sportsMatch.findFirst({
    where: {
      eventId: input.eventId,
      deletedAt: null,
    },
    select: {
      id: true,
      state: true,
      canonicalState: true,
      revision: true,
    },
  });
  if (!match) {
    return input.dryRun ? null : false;
  }
  const preview = (willTransition: boolean): SportsMatchAttendanceCheckInPreview => ({
    matchId: match.id,
    state: match.state,
    canonicalState: match.canonicalState,
    revision: match.revision,
    willTransition,
  });
  if (match.state !== SportsMatchState.SCHEDULED) {
    return input.dryRun ? preview(false) : false;
  }

  const athlete = await tx.sportsMatchRosterEntry.findFirst({
    where: {
      deletedAt: null,
      status: SportsRosterEntryStatus.APPROVED,
      roster: {
        matchId: match.id,
        status: SportsRosterStatus.APPROVED,
        deletedAt: null,
      },
      registrationMember: {
        deletedAt: null,
        eligibility: SportsEligibilityStatus.ELIGIBLE,
        registration: {
          deletedAt: null,
          status: {
            in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
          },
        },
        teamMember: {
          deletedAt: null,
          status: SportsTeamMemberStatus.APPROVED,
          participant: {
            personId: input.personId,
            deletedAt: null,
            status: SportsParticipantStatus.ACTIVE,
          },
        },
      },
    },
    select: { id: true },
  });
  if (!athlete) {
    return input.dryRun ? preview(false) : false;
  }
  if (input.dryRun) {
    return preview(true);
  }

  const updated = await tx.sportsMatch.updateMany({
    where: {
      id: match.id,
      deletedAt: null,
      state: SportsMatchState.SCHEDULED,
      revision: match.revision,
    },
    data: {
      state: SportsMatchState.CHECK_IN,
      canonicalState:
        match.canonicalState === SportsMatchState.SCHEDULED ? SportsMatchState.CHECK_IN : match.canonicalState,
      revision: { increment: 1 },
      ...(input.updatedById ? { updatedById: input.updatedById } : {}),
    },
  });

  return updated.count === 1;
}
