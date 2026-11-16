import type { Permission } from '@cacic-fct/shared-permissions';
import { EventManagerPermissionScope, Prisma, UserRole } from '@prisma/client';
import { resolveRoleIdsForPermission } from './effective-role-scopes';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export async function findPermissionNotificationRecipients(params: {
  prisma: PrismaService;
  notifications: NovuNotificationsService;
  permissions: readonly Permission[];
  event?: { id: string; majorEventId?: string | null; eventGroupId?: string | null };
}) {
  const now = new Date();
  const scopedGrantMatches: Prisma.EventManagerRoleAssignmentScopeWhereInput[] = [
    { scope: EventManagerPermissionScope.GLOBAL },
  ];
  if (params.event) scopedGrantMatches.push({ scope: EventManagerPermissionScope.EVENT, eventId: params.event.id });
  if (params.event?.majorEventId) {
    scopedGrantMatches.push({
      scope: EventManagerPermissionScope.MAJOR_EVENT,
      majorEventId: params.event.majorEventId,
    });
  }
  if (params.event?.eventGroupId) {
    scopedGrantMatches.push({
      scope: EventManagerPermissionScope.EVENT_GROUP,
      eventGroupId: params.event.eventGroupId,
    });
  }

  const roleIds = new Set(
    (
      await Promise.all(params.permissions.map((permission) => resolveRoleIdsForPermission(params.prisma, permission)))
    ).flat(),
  );
  const assignments = await params.prisma.eventManagerRoleAssignment.findMany({
    where: {
      roleId: { in: [...roleIds] },
      archivedAt: null,
      OR: [{ validFrom: null }, { validFrom: { lte: now } }],
      AND: [
        { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        { OR: [{ person: { deletedAt: null } }, { group: { archivedAt: null } }] },
      ],
      scopes: {
        some: {
          archivedAt: null,
          OR: scopedGrantMatches,
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
          ],
        },
      },
    },
    select: {
      person: { select: { userId: true, deletedAt: true } },
      group: {
        select: {
          members: {
            where: {
              archivedAt: null,
              person: { deletedAt: null },
              OR: [{ validFrom: null }, { validFrom: { lte: now } }],
              AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
            },
            select: { person: { select: { userId: true } } },
          },
        },
      },
    },
  });
  const assignedUserIds = assignments.flatMap((assignment) => [
    ...(assignment.person && !assignment.person.deletedAt && assignment.person.userId
      ? [assignment.person.userId]
      : []),
    ...(assignment.group?.members.flatMap((member) => (member.person.userId ? [member.person.userId] : [])) ?? []),
  ]);
  const users = await params.prisma.user.findMany({
    where: { OR: [{ role: UserRole.ADMIN }, { id: { in: assignedUserIds } }] },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  const recipientsBySubscriberId = new Map<
    string,
    {
      subscriberId: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      data?: Record<string, unknown>;
    }
  >();
  for (const user of users) {
    const recipient = params.notifications.mapUserToRecipient(user);
    recipientsBySubscriberId.set(recipient.subscriberId, recipient);
  }

  return Array.from(recipientsBySubscriberId.values());
}
