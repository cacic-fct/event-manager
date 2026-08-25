import {
  EVENT_MANAGER_PERMISSION_SET,
  EVENT_MANAGER_SYSTEM_ROLE_BY_KEY,
  expandHardPermissionDependencies,
  type EventManagerSystemRoleKey,
  type Permission,
} from '@cacic-fct/shared-permissions';
import { EventManagerPermissionScope, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EffectiveRoleScope = {
  permission: Permission;
  scope: EventManagerPermissionScope;
  eventId: string | null;
  majorEventId: string | null;
  eventGroupId: string | null;
};

export async function findActiveRolePermissionScopes(
  prisma: PrismaService,
  userId: string | undefined,
  permissions?: readonly Permission[],
  now = new Date(),
): Promise<EffectiveRoleScope[]> {
  if (!userId) return [];
  const people = await prisma.people.findMany({ where: { userId, deletedAt: null }, select: { id: true }, take: 2 });
  if (people.length !== 1) return [];
  const activeWindow = {
    archivedAt: null,
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
    ],
  } satisfies Prisma.EventManagerRoleAssignmentWhereInput;
  const assignments = await prisma.eventManagerRoleAssignment.findMany({
    where: {
      ...activeWindow,
      role: { archivedAt: null },
      OR: [
        { personId: people[0].id },
        {
          group: {
            archivedAt: null,
            members: {
              some: {
                personId: people[0].id,
                archivedAt: null,
                AND: [
                  { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
                  { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
                ],
              },
            },
          },
        },
      ],
    },
    select: {
      roleId: true,
      scopes: {
        where: {
          archivedAt: null,
          AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
          ],
        },
        select: { scope: true, eventId: true, majorEventId: true, eventGroupId: true },
      },
    },
  });
  const rolePermissions = await resolveEffectiveRolePermissions(prisma);
  const filter = permissions ? new Set(permissions) : null;
  return assignments.flatMap((assignment) =>
    [...(rolePermissions.get(assignment.roleId) ?? [])].flatMap((permission) =>
      filter && !filter.has(permission) ? [] : assignment.scopes.map((scope) => ({ permission, ...scope })),
    ),
  );
}

export async function resolveRoleIdsForPermission(prisma: PrismaService, permission: Permission): Promise<string[]> {
  const effective = await resolveEffectiveRolePermissions(prisma);
  return [...effective.entries()].filter(([, permissions]) => permissions.has(permission)).map(([roleId]) => roleId);
}

async function resolveEffectiveRolePermissions(prisma: PrismaService): Promise<Map<string, Set<Permission>>> {
  const roles = await prisma.eventManagerRole.findMany({
    where: { archivedAt: null },
    select: {
      id: true,
      systemKey: true,
      permissions: { select: { permission: true } },
      parentLinks: { where: { archivedAt: null, parentRole: { archivedAt: null } }, select: { parentRoleId: true } },
    },
  });
  const byId = new Map(roles.map((role) => [role.id, role] as const));
  const resolved = new Map<string, Set<Permission>>();
  const visit = (roleId: string, visiting = new Set<string>()): Set<Permission> => {
    const cached = resolved.get(roleId);
    if (cached) return cached;
    if (visiting.has(roleId)) return new Set();
    const role = byId.get(roleId);
    if (!role) return new Set();
    const definition = role.systemKey
      ? EVENT_MANAGER_SYSTEM_ROLE_BY_KEY.get(role.systemKey as EventManagerSystemRoleKey)
      : null;
    const direct = (definition?.permissions ?? role.permissions.map((item) => item.permission)).filter(
      (permission): permission is Permission => EVENT_MANAGER_PERMISSION_SET.has(permission as Permission),
    );
    const permissions = new Set(direct);
    const next = new Set(visiting).add(roleId);
    role.parentLinks.forEach((link) =>
      visit(link.parentRoleId, next).forEach((permission) => permissions.add(permission)),
    );
    const expanded = expandHardPermissionDependencies(permissions);
    resolved.set(roleId, expanded);
    return expanded;
  };
  roles.forEach((role) => visit(role.id));
  return resolved;
}
