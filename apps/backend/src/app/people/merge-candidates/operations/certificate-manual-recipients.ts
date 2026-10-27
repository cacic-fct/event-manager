import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export type ManualRecipientMergeSnapshot = {
  movedConfigIds: string[];
  reactivated: { configId: string; removedAt: string }[];
};

export async function moveManualRecipients(
  tx: Prisma.TransactionClient,
  sourcePersonId: string,
  targetPersonId: string,
): Promise<ManualRecipientMergeSnapshot> {
  const source = await tx.certificateManualRecipient.findMany({
    where: { personId: sourcePersonId, removedAt: null },
    select: { configId: true },
  });
  const snapshot: ManualRecipientMergeSnapshot = { movedConfigIds: [], reactivated: [] };
  for (const { configId } of source) {
    const target = await tx.certificateManualRecipient.findUnique({
      where: { configId_personId: { configId, personId: targetPersonId } },
    });
    if (!target) {
      await tx.certificateManualRecipient.update({
        where: { configId_personId: { configId, personId: sourcePersonId } },
        data: { personId: targetPersonId },
      });
      snapshot.movedConfigIds.push(configId);
    } else if (target.removedAt) {
      // Keep both original rows so undo can restore the previous selection.
      await tx.certificateManualRecipient.update({
        where: { configId_personId: { configId, personId: targetPersonId } },
        data: { removedAt: null },
      });
      snapshot.reactivated.push({ configId, removedAt: target.removedAt.toISOString() });
    }
  }
  return snapshot;
}

export async function restoreManualRecipients(
  tx: Prisma.TransactionClient,
  sourcePersonId: string,
  targetPersonId: string,
  snapshot: ManualRecipientMergeSnapshot,
): Promise<void> {
  for (const configId of snapshot.movedConfigIds) {
    const restored = await tx.certificateManualRecipient.updateMany({
      where: { configId, personId: targetPersonId, removedAt: null },
      data: { personId: sourcePersonId },
    });
    if (restored.count !== 1) throw new ConflictException('Manual certificate recipient changed after the merge.');
  }
  for (const { configId, removedAt } of snapshot.reactivated) {
    const restored = await tx.certificateManualRecipient.updateMany({
      where: { configId, personId: targetPersonId, removedAt: null },
      data: { removedAt: new Date(removedAt) },
    });
    if (restored.count !== 1) throw new ConflictException('Manual certificate recipient changed after the merge.');
  }
}
