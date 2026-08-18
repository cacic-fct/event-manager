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
export async function startSportsMatchCheckInFromAthleteAttendance(input: {
  tx: Prisma.TransactionClient;
  eventId: string;
  personId: string;
  updatedById?: string | null;
}): Promise<boolean> {
  const tx = input.tx as SportsAttendanceTransaction;
  if (!tx.sportsMatch || !tx.sportsMatchRosterEntry) {
    return false;
  }

  const match = await tx.sportsMatch.findFirst({
    where: {
      eventId: input.eventId,
      deletedAt: null,
      state: SportsMatchState.SCHEDULED,
    },
    select: {
      id: true,
      state: true,
      canonicalState: true,
      revision: true,
    },
  });
  if (!match || match.state !== SportsMatchState.SCHEDULED) {
    return false;
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
    return false;
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
