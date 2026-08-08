import {
  Prisma,
  SportsRosterEntryStatus,
  SportsRosterStatus,
} from '@prisma/client';
import { SportsMatchRosterSupportService } from './sports-match-roster-support.service';

export abstract class SportsMatchRosterCopyService extends SportsMatchRosterSupportService {
  async copyApprovedRosterForWinner(
    tx: Prisma.TransactionClient,
    sourceMatchId: string,
    destinationMatchId: string,
    winnerRegistrationId: string,
    actorId: string,
  ): Promise<void> {
    const source = await tx.sportsMatchRoster.findFirst({
      where: {
        matchId: sourceMatchId,
        registrationId: winnerRegistrationId,
        status: SportsRosterStatus.APPROVED,
        deletedAt: null,
      },
      include: {
        entries: {
          where: {
            deletedAt: null,
            status: SportsRosterEntryStatus.APPROVED,
          },
        },
      },
    });
    if (!source) {
      return;
    }
    const existing = await tx.sportsMatchRoster.findFirst({
      where: {
        matchId: destinationMatchId,
        registrationId: winnerRegistrationId,
        deletedAt: null,
      },
      include: { entries: { where: { deletedAt: null } } },
    });
    if (existing?.manuallyEdited) {
      return;
    }
    if (existing) {
      await tx.sportsMatchRosterEntry.updateMany({
        where: { rosterId: existing.id, deletedAt: null },
        data: { deletedAt: new Date(), updatedById: actorId },
      });
    }
    const destination = existing
      ? await tx.sportsMatchRoster.update({
          where: { id: existing.id },
          data: {
            status: SportsRosterStatus.APPROVED,
            revision: { increment: 1 },
            copiedFromRosterId: source.id,
            updatedById: actorId,
          },
        })
      : await tx.sportsMatchRoster.create({
          data: {
            matchId: destinationMatchId,
            registrationId: winnerRegistrationId,
            status: SportsRosterStatus.APPROVED,
            copiedFromRosterId: source.id,
            createdById: actorId,
            updatedById: actorId,
          },
        });
    if (source.entries.length > 0) {
      await tx.sportsMatchRosterEntry.createMany({
        data: source.entries.map((entry) => ({
          rosterId: destination.id,
          registrationMemberId: entry.registrationMemberId,
          status: SportsRosterEntryStatus.APPROVED,
          role: entry.role,
          shirtNumber: entry.shirtNumber,
          roleMetadata:
            entry.roleMetadata === null
              ? Prisma.DbNull
              : (entry.roleMetadata as Prisma.InputJsonValue),
          createdById: actorId,
          updatedById: actorId,
        })),
      });
    }
  }
}

