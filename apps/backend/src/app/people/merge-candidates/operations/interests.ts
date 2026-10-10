import { Prisma } from '@prisma/client';

type InterestTarget = { eventId: string | null; eventGroupId: string | null; majorEventId: string | null };

function targetKey(interest: InterestTarget): string {
  return JSON.stringify([interest.eventId, interest.eventGroupId, interest.majorEventId]);
}

/** Moves interests while preserving history and avoiding active duplicates. */
export async function moveEventInterests(
  tx: Prisma.TransactionClient,
  sourcePersonId: string,
  targetPersonId: string,
): Promise<{ movedIds: string[]; retiredIds: string[] }> {
  const select = { id: true, eventId: true, eventGroupId: true, majorEventId: true, deletedAt: true } as const;
  const source = await tx.eventInterest.findMany({ where: { personId: sourcePersonId }, select });
  if (!source.length) return { movedIds: [], retiredIds: [] };
  const target = await tx.eventInterest.findMany({ where: { personId: targetPersonId, deletedAt: null }, select });
  const existing = new Set(target.map(targetKey));
  const ids = source.filter((interest) => interest.deletedAt || !existing.has(targetKey(interest))).map(({ id }) => id);
  if (ids.length) {
    await tx.eventInterest.updateMany({ where: { id: { in: ids }, personId: sourcePersonId }, data: { personId: targetPersonId } });
  }
  const retiredIds = source.filter((interest) => !interest.deletedAt && existing.has(targetKey(interest))).map(({ id }) => id);
  if (retiredIds.length) {
    await tx.eventInterest.updateMany({
      where: { id: { in: retiredIds }, personId: sourcePersonId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
  return { movedIds: ids, retiredIds };
}
