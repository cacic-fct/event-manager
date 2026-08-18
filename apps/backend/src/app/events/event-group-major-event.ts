import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function syncEventGroupMajorEvent(
  prisma: PrismaService | Prisma.TransactionClient,
  groupIds: readonly (string | null | undefined)[],
): Promise<void> {
  for (const groupId of [...new Set(groupIds.filter((id): id is string => Boolean(id)))]) {
    const groupedEvent = await prisma.event.findFirst({
      where: { eventGroupId: groupId, deletedAt: null, majorEventId: { not: null } },
      select: { majorEventId: true },
    });
    const majorEventId = groupedEvent?.majorEventId ?? null;
    await prisma.event.updateMany({
      where: { eventGroupId: groupId, deletedAt: null },
      data: { majorEventId },
    });
    await prisma.eventGroup.updateMany({
      where: { id: groupId, deletedAt: null },
      data: { majorEventId },
    });
  }
}
