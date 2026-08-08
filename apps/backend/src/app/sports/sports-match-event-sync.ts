import { Prisma } from '@prisma/client';

export async function syncSportsMatchEventName(
  tx: Prisma.TransactionClient,
  matchId: string,
  actorId: string,
): Promise<void> {
  const match = await tx.sportsMatch.findUniqueOrThrow({
    where: { id: matchId },
    select: {
      eventId: true,
      category: { select: { name: true } },
      homeRegistration: {
        select: { team: { select: { name: true } } },
      },
      awayRegistration: {
        select: { team: { select: { name: true } } },
      },
    },
  });
  const homeName = match.homeRegistration?.team.name ?? 'A definir';
  const awayName = match.awayRegistration?.team.name ?? 'A definir';
  await tx.event.update({
    where: { id: match.eventId },
    data: {
      name: `${match.category.name} — ${homeName} x ${awayName}`,
      updatedById: actorId,
    },
  });
}
