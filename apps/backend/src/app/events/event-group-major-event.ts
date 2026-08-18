import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function syncEventGroupMajorEvent(
  prisma: PrismaService | Prisma.TransactionClient,
  groupIds: readonly (string | null | undefined)[],
): Promise<void> {
  for (const groupId of [...new Set(groupIds.filter((id): id is string => Boolean(id)))]) {
    const groupedEvents = await prisma.event.findMany({
      where: { eventGroupId: groupId, deletedAt: null },
      select: { majorEventId: true },
      distinct: ['majorEventId'],
      take: 2,
    });
    const majorEventIds = new Set(groupedEvents.map((event) => event.majorEventId));
    if (majorEventIds.size > 1) {
      throw new ConflictException('Os eventos deste grupo pertencem a grandes eventos diferentes.');
    }
    const majorEventId = groupedEvents[0]?.majorEventId ?? null;
    await prisma.eventGroup.updateMany({
      where: { id: groupId, deletedAt: null },
      data: { majorEventId },
    });
  }
}
