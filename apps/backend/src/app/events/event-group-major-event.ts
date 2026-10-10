import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';

export async function syncEventGroupMajorEvent(
  prisma: PrismaService | Prisma.TransactionClient,
  groupIds: readonly (string | null | undefined)[],
): Promise<void> {
  // Group membership is a database invariant: hidden children must participate
  // in this check after the caller has authorized the requested event change.
  return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
    const uniqueGroupIds = [...new Set(groupIds.filter((id): id is string => Boolean(id)))];
    if (uniqueGroupIds.length === 0) return;

    const groups = await prisma.eventGroup.findMany({
      where: { id: { in: uniqueGroupIds }, deletedAt: null },
      select: { id: true, majorEventId: true },
    });

    for (const group of groups) {
      const groupedEvents = await prisma.event.findMany({
        where: { eventGroupId: group.id, deletedAt: null },
        select: { majorEventId: true },
        distinct: ['majorEventId'],
        take: 2,
      });

      const childMajorEventIds = new Set(groupedEvents.map((event) => event.majorEventId));
      if (childMajorEventIds.size > 1) {
        throw new ConflictException('Os eventos deste grupo pertencem a grandes eventos diferentes.');
      }

      const childMajorEventId = groupedEvents[0]?.majorEventId ?? null;
      if (group.majorEventId !== null && groupedEvents.length > 0 && childMajorEventId !== group.majorEventId) {
        throw new ConflictException('Um evento vinculado ao grupo pertence a outro grande evento.');
      }

      // Explicit parents are canonical, including while the group has no children.
      // A null parent is the legacy representation and may adopt its first coherent child.
      const majorEventId = group.majorEventId ?? childMajorEventId;
      if (majorEventId !== group.majorEventId) {
        const updated = await prisma.eventGroup.updateMany({
          where: { id: group.id, deletedAt: null, majorEventId: null },
          data: { majorEventId },
        });
        if (updated.count !== 1) {
          throw new ConflictException('O vínculo do grupo com o grande evento foi alterado durante a operação.');
        }
      }
    }
  });
}
