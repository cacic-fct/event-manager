import { Prisma } from '@prisma/client';
import { DataSubjectResolution } from './lgpd-records';

export function buildEventDraftSubjectWhere(dataSubject: DataSubjectResolution): Prisma.EventDraftWhereInput | null {
  const conditions: Prisma.EventDraftWhereInput[] = [];
  if (dataSubject.userIds.length > 0) {
    conditions.push({ createdById: { in: dataSubject.userIds } });
    conditions.push({ updatedById: { in: dataSubject.userIds } });
  }
  for (const email of dataSubject.emails) {
    conditions.push({ createdByEmail: { equals: email, mode: 'insensitive' } });
    conditions.push({ updatedByEmail: { equals: email, mode: 'insensitive' } });
  }

  return conditions.length > 0 ? { OR: conditions } : null;
}

export async function anonymizeEventDrafts(
  tx: Prisma.TransactionClient,
  dataSubject: DataSubjectResolution,
  anonymizedSubjectId: string,
): Promise<number> {
  const where = buildEventDraftSubjectWhere(dataSubject);
  if (!where) {
    return 0;
  }

  const drafts = await tx.eventDraft.findMany({
    where,
    select: {
      id: true,
      createdById: true,
      createdByEmail: true,
      updatedById: true,
      updatedByEmail: true,
    },
  });
  const userIds = new Set(dataSubject.userIds);
  const emails = new Set(dataSubject.emails.map((email) => email.toLowerCase()));
  let updated = 0;

  for (const draft of drafts) {
    const data: Prisma.EventDraftUncheckedUpdateInput = {};
    const creatorMatches =
      (draft.createdById != null && userIds.has(draft.createdById)) ||
      (draft.createdByEmail != null && emails.has(draft.createdByEmail.toLowerCase()));
    const updaterMatches =
      (draft.updatedById != null && userIds.has(draft.updatedById)) ||
      (draft.updatedByEmail != null && emails.has(draft.updatedByEmail.toLowerCase()));

    if (creatorMatches) {
      data.createdById = anonymizedSubjectId;
      data.createdByName = 'Usuário anonimizado';
      data.createdByEmail = null;
    }
    if (updaterMatches) {
      data.updatedById = anonymizedSubjectId;
      data.updatedByName = 'Usuário anonimizado';
      data.updatedByEmail = null;
    }
    if (Object.keys(data).length === 0) {
      continue;
    }

    await tx.eventDraft.update({
      where: { id: draft.id },
      data,
    });
    updated += 1;
  }

  return updated;
}
