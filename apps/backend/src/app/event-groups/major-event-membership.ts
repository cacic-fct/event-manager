import { Prisma } from '@prisma/client';

export function eventGroupBelongsToMajorEventWhere(
  majorEventIds: string | readonly string[],
): Prisma.EventGroupWhereInput {
  const normalizedIds = [...new Set(
    (typeof majorEventIds === 'string' ? [majorEventIds] : majorEventIds)
      .map((id) => id.trim())
      .filter(Boolean),
  )];

  if (normalizedIds.length === 0) {
    return { id: { in: [] } };
  }

  if (normalizedIds.length === 1) {
    const [majorEventId] = normalizedIds;
    return {
      OR: [
        { majorEventId },
        { majorEventId: null, events: { some: { majorEventId, deletedAt: null } } },
      ],
    };
  }

  return {
    OR: [
      { majorEventId: { in: normalizedIds } },
      {
        majorEventId: null,
        events: { some: { majorEventId: { in: normalizedIds }, deletedAt: null } },
      },
    ],
  };
}
