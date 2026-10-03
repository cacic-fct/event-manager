import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type AudienceInvitationTargetType = 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';

export type AudienceInvitationSnapshot = {
  targetType: AudienceInvitationTargetType;
  coalesced?: boolean;
  targetId: string;
  personId: string;
  createdAt: string;
  createdById: string | null;
  notifiedAt: string | null;
  notificationAttemptedAt: string | null;
};

type InvitationRow = {
  targetId: string;
  personId: string;
  createdAt: Date;
  createdById: string | null;
  notifiedAt: Date | null;
  notificationAttemptedAt: Date | null;
};

export async function moveAudienceInvitations(
  tx: Prisma.TransactionClient,
  sourcePersonId: string,
  targetPersonId: string,
): Promise<AudienceInvitationSnapshot[]> {
  const snapshots: AudienceInvitationSnapshot[] = [];

  const eventRows = await tx.eventAudienceInvitation.findMany({
    where: { personId: sourcePersonId },
    select: {
      eventId: true,
      personId: true,
      createdAt: true,
      createdById: true,
      notifiedAt: true,
      notificationAttemptedAt: true,
    },
  });
  const eventTargetRows = await tx.eventAudienceInvitation.findMany({
    where: { personId: targetPersonId },
    select: { eventId: true },
  });
  snapshots.push(
    ...(await moveInvitationRows(
      eventRows.map((row) => ({ ...row, targetId: row.eventId })),
      eventTargetRows.map((row) => row.eventId),
      'EVENT',
      (row) =>
        tx.eventAudienceInvitation.update({
          where: {
            eventId_personId: {
              eventId: row.targetId,
              personId: sourcePersonId,
            },
          },
          data: { personId: targetPersonId },
        }),
      (row) => tx.eventAudienceInvitation.delete({
        where: { eventId_personId: { eventId: row.targetId, personId: sourcePersonId } },
      }),
    )));

  const eventGroupRows = await tx.eventGroupAudienceInvitation.findMany({
    where: { personId: sourcePersonId },
    select: {
      eventGroupId: true,
      personId: true,
      createdAt: true,
      createdById: true,
      notifiedAt: true,
      notificationAttemptedAt: true,
    },
  });
  const eventGroupTargetRows = await tx.eventGroupAudienceInvitation.findMany({
    where: { personId: targetPersonId },
    select: { eventGroupId: true },
  });
  snapshots.push(
    ...(await moveInvitationRows(
      eventGroupRows.map((row) => ({ ...row, targetId: row.eventGroupId })),
      eventGroupTargetRows.map((row) => row.eventGroupId),
      'EVENT_GROUP',
      (row) =>
        tx.eventGroupAudienceInvitation.update({
          where: {
            eventGroupId_personId: {
              eventGroupId: row.targetId,
              personId: sourcePersonId,
            },
          },
          data: { personId: targetPersonId },
        }),
      (row) => tx.eventGroupAudienceInvitation.delete({
        where: { eventGroupId_personId: { eventGroupId: row.targetId, personId: sourcePersonId } },
      }),
    )));

  const majorEventRows = await tx.majorEventAudienceInvitation.findMany({
    where: { personId: sourcePersonId },
    select: {
      majorEventId: true,
      personId: true,
      createdAt: true,
      createdById: true,
      notifiedAt: true,
      notificationAttemptedAt: true,
    },
  });
  const majorEventTargetRows = await tx.majorEventAudienceInvitation.findMany({
    where: { personId: targetPersonId },
    select: { majorEventId: true },
  });
  snapshots.push(
    ...(await moveInvitationRows(
      majorEventRows.map((row) => ({ ...row, targetId: row.majorEventId })),
      majorEventTargetRows.map((row) => row.majorEventId),
      'MAJOR_EVENT',
      (row) =>
        tx.majorEventAudienceInvitation.update({
          where: {
            majorEventId_personId: {
              majorEventId: row.targetId,
              personId: sourcePersonId,
            },
          },
          data: { personId: targetPersonId },
        }),
      (row) => tx.majorEventAudienceInvitation.delete({
        where: { majorEventId_personId: { majorEventId: row.targetId, personId: sourcePersonId } },
      }),
    )));

  return snapshots;
}

export async function restoreAudienceInvitations(
  tx: Prisma.TransactionClient,
  snapshots: readonly AudienceInvitationSnapshot[],
  sourcePersonId: string,
  targetPersonId: string,
): Promise<void> {
  for (const snapshot of snapshots) {
    if (snapshot.personId !== sourcePersonId) {
      throw new ConflictException(
        `Audience invitation ${snapshot.targetType}:${snapshot.targetId} has an unexpected source person.`,
      );
    }
    if (snapshot.coalesced) {
      const data = {
        personId: sourcePersonId,
        createdAt: new Date(snapshot.createdAt),
        createdById: snapshot.createdById,
        notifiedAt: snapshot.notifiedAt ? new Date(snapshot.notifiedAt) : null,
        notificationAttemptedAt: snapshot.notificationAttemptedAt ? new Date(snapshot.notificationAttemptedAt) : null,
      };
      switch (snapshot.targetType) {
        case 'EVENT': await tx.eventAudienceInvitation.create({ data: { ...data, eventId: snapshot.targetId } }); break;
        case 'EVENT_GROUP': await tx.eventGroupAudienceInvitation.create({ data: { ...data, eventGroupId: snapshot.targetId } }); break;
        case 'MAJOR_EVENT': await tx.majorEventAudienceInvitation.create({ data: { ...data, majorEventId: snapshot.targetId } }); break;
      }
      continue;
    }
    const result =
      snapshot.targetType === 'EVENT'
        ? await tx.eventAudienceInvitation.updateMany({
            where: { eventId: snapshot.targetId, personId: targetPersonId, createdAt: new Date(snapshot.createdAt) },
            data: { personId: sourcePersonId },
          })
        : snapshot.targetType === 'EVENT_GROUP'
          ? await tx.eventGroupAudienceInvitation.updateMany({
              where: { eventGroupId: snapshot.targetId, personId: targetPersonId, createdAt: new Date(snapshot.createdAt) },
              data: { personId: sourcePersonId },
            })
          : await tx.majorEventAudienceInvitation.updateMany({
              where: { majorEventId: snapshot.targetId, personId: targetPersonId, createdAt: new Date(snapshot.createdAt) },
              data: { personId: sourcePersonId },
            });
    if (result.count !== 1) {
      throw new ConflictException(
        `Audience invitation ${snapshot.targetType}:${snapshot.targetId} changed after the people merge.`,
      );
    }
  }
}

async function moveInvitationRows(
  sourceRows: readonly InvitationRow[],
  targetIds: readonly string[],
  targetType: AudienceInvitationTargetType,
  update: (row: InvitationRow) => Promise<unknown>,
  remove: (row: InvitationRow) => Promise<unknown>,
): Promise<AudienceInvitationSnapshot[]> {
  const targetIdSet = new Set(targetIds);
  const snapshots: AudienceInvitationSnapshot[] = [];
  for (const row of sourceRows) {
    const coalesced = targetIdSet.has(row.targetId);
    if (coalesced) await remove(row);
    else await update(row);
    snapshots.push({
      ...(coalesced ? { coalesced: true } : {}),
      targetType,
      targetId: row.targetId,
      personId: row.personId,
      createdAt: row.createdAt.toISOString(),
      createdById: row.createdById,
      notifiedAt: row.notifiedAt?.toISOString() ?? null,
      notificationAttemptedAt: row.notificationAttemptedAt?.toISOString() ?? null,
    });
  }
  return snapshots;
}
