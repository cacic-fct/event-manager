import {
  EVENT_MANAGER_PERMISSION_SET,
  EVENT_MANAGER_SYSTEM_ROLE_BY_KEY,
  EVENT_MANAGER_SYSTEM_ROLES,
  Permission,
  expandHardPermissionDependencies,
  getMissingContextPermissionDependencies,
  isPermissionGrantScopeCompatible,
  type EventManagerSystemRoleKey,
} from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLogActorType,
  AuditLogEntityType,
  AuditLogOperation,
  EventManagerPermissionArchiveReason,
  EventManagerPermissionScope,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationPolicyService } from './authorization-policy.service';
import {
  PermissionGroup,
  PermissionGroupSaveInput,
  PermissionRole,
  PermissionRoleAssignmentInput,
  PermissionRoleSaveInput,
  PermissionScopeTarget,
} from './permission-management.models';

const roleSelect = {
  id: true,
  systemKey: true,
  name: true,
  description: true,
  emoji: true,
  position: true,
  isSystem: true,
  version: true,
  archivedAt: true,
  updatedAt: true,
  permissions: { select: { permission: true } },
  parentLinks: {
    where: { archivedAt: null },
    select: { parentRoleId: true },
  },
  assignments: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      personId: true,
      groupId: true,
      validFrom: true,
      validUntil: true,
      unlimited: true,
      archivedAt: true,
      person: { select: { name: true, userId: true } },
      group: {
        select: {
          name: true,
          members: { where: { archivedAt: null }, select: { personId: true } },
        },
      },
      scopes: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          scope: true,
          eventId: true,
          majorEventId: true,
          eventGroupId: true,
          validFrom: true,
          validUntil: true,
          unlimited: true,
          archivedAt: true,
          event: { select: { name: true } },
          majorEvent: { select: { name: true } },
          eventGroup: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.EventManagerRoleSelect;

type RoleRecord = Prisma.EventManagerRoleGetPayload<{ select: typeof roleSelect }>;

const groupSelect = {
  id: true,
  name: true,
  description: true,
  emoji: true,
  version: true,
  archivedAt: true,
  updatedAt: true,
  members: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      validFrom: true,
      validUntil: true,
      unlimited: true,
      archivedAt: true,
      person: { select: { id: true, name: true, email: true, userId: true } },
    },
  },
  assignments: {
    where: { archivedAt: null, role: { archivedAt: null } },
    select: { roleId: true },
  },
} satisfies Prisma.EventManagerPermissionGroupSelect;

type GroupRecord = Prisma.EventManagerPermissionGroupGetPayload<{ select: typeof groupSelect }>;

@Injectable()
export class PermissionManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly authorization: AuthorizationPolicyService,
  ) {}

  async listRoles(includeArchived = false): Promise<PermissionRole[]> {
    await this.archiveExpiredAccess();
    const records = await this.prisma.eventManagerRole.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      select: roleSelect,
      orderBy: [{ isSystem: 'desc' }, { position: 'asc' }, { name: 'asc' }],
    });
    return this.mapRoles(records, includeArchived);
  }

  async listGroups(includeArchived = false): Promise<PermissionGroup[]> {
    await this.archiveExpiredAccess();
    const groups = await this.prisma.eventManagerPermissionGroup.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      select: groupSelect,
      orderBy: { name: 'asc' },
    });
    return groups.map((group) => this.mapGroup(group, includeArchived));
  }

  async listScopeTargets(scope: EventManagerPermissionScope, skip = 0, take = 100): Promise<PermissionScopeTarget[]> {
    const resolvedSkip = Math.max(Math.trunc(skip), 0);
    const resolvedTake = Math.min(Math.max(Math.trunc(take), 1), 200);
    if (scope === EventManagerPermissionScope.GLOBAL) return [];
    if (scope === EventManagerPermissionScope.MAJOR_EVENT) {
      return this.prisma.majorEvent.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, emoji: true },
        orderBy: { startDate: 'desc' },
        skip: resolvedSkip,
        take: resolvedTake,
      }).then((items) => items.map((item) => ({ ...item, label: item.name, description: 'Grande evento' })));
    }
    if (scope === EventManagerPermissionScope.EVENT_GROUP) {
      return this.prisma.eventGroup.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, emoji: true, majorEventId: true, majorEvent: { select: { name: true } } },
        orderBy: { name: 'asc' },
        skip: resolvedSkip,
        take: resolvedTake,
      }).then((items) => items.map((item) => ({
        id: item.id,
        label: item.name,
        emoji: item.emoji,
        parentId: item.majorEventId,
        description: item.majorEvent?.name ?? 'Grupo de eventos independente',
      })));
    }
    return this.prisma.event.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        emoji: true,
        majorEventId: true,
        eventGroupId: true,
        majorEvent: { select: { name: true } },
        eventGroup: { select: { name: true } },
      },
      orderBy: { startDate: 'desc' },
      skip: resolvedSkip,
      take: resolvedTake,
    }).then((items) => items.map((item) => ({
      id: item.id,
      label: item.name,
      emoji: item.emoji,
      parentId: item.eventGroupId ?? item.majorEventId,
      description: item.eventGroup?.name ?? item.majorEvent?.name ?? 'Evento independente',
    })));
  }

  async saveRole(input: PermissionRoleSaveInput, actor: AuthenticatedUser): Promise<PermissionRole> {
    const normalized = this.normalizeRoleInput(input);
    const existing = input.id
      ? await this.prisma.eventManagerRole.findFirst({ where: { id: input.id, archivedAt: null }, select: roleSelect })
      : null;
    if (input.id && !existing) throw new NotFoundException('Cargo não encontrado.');
    await this.authorization.assertPermissions(actor, [
      existing ? Permission.PermissionGrant.Update : Permission.PermissionGrant.Create,
    ]);
    if (existing && input.expectedVersion !== existing.version) {
      throw new ConflictException('Este cargo foi alterado por outra pessoa. Recarregue antes de salvar.');
    }

    const systemDefinition = existing?.systemKey
      ? EVENT_MANAGER_SYSTEM_ROLE_BY_KEY.get(existing.systemKey as EventManagerSystemRoleKey)
      : null;
    if (systemDefinition?.external) throw new ForbiddenException('O cargo de superadministrador é externo.');
    if (systemDefinition) {
      normalized.name = systemDefinition.name;
      normalized.description = systemDefinition.description;
      normalized.emoji = systemDefinition.emoji;
      normalized.permissions = [...systemDefinition.permissions];
      normalized.parentRoleIds = existing?.parentLinks.map((link) => link.parentRoleId) ?? [];
    }

    const roleId = existing?.id ?? crypto.randomUUID();
    await this.assertRoleInheritance(roleId, normalized.parentRoleIds);
    const effectivePermissions = await this.resolveInputEffectivePermissions(normalized.permissions, normalized.parentRoleIds);
    this.assertContextDependencies(effectivePermissions);
    await this.assertAssignments(normalized.assignments, effectivePermissions);
    await this.assertDelegation(actor, effectivePermissions, normalized.assignments);
    if (existing) await this.assertDescendantDelegation(actor, roleId, effectivePermissions);

    const actorId = actor.sub;
    const savedId = await this.prisma.$transaction(async (tx) => {
      const before = existing;
      const saved = existing
        ? await tx.eventManagerRole.update({
            where: { id: roleId, version: existing.version },
            data: {
              name: normalized.name,
              description: normalized.description,
              emoji: normalized.emoji,
              version: { increment: 1 },
              updatedById: actorId,
            },
            select: roleSelect,
          })
        : await tx.eventManagerRole.create({
            data: {
              id: roleId,
              name: normalized.name,
              description: normalized.description,
              emoji: normalized.emoji,
              createdById: actorId,
              updatedById: actorId,
            },
            select: roleSelect,
          });

      if (!systemDefinition) {
        await tx.eventManagerRolePermission.deleteMany({ where: { roleId } });
        if (normalized.permissions.length) {
          await tx.eventManagerRolePermission.createMany({
            data: normalized.permissions.map((permission) => ({ roleId, permission, createdById: actorId })),
          });
        }
        await tx.eventManagerRoleInheritance.updateMany({
          where: { childRoleId: roleId, archivedAt: null },
          data: { archivedAt: new Date() },
        });
        if (normalized.parentRoleIds.length) {
          await tx.eventManagerRoleInheritance.createMany({
            data: normalized.parentRoleIds.map((parentRoleId) => ({
              id: crypto.randomUUID(), childRoleId: roleId, parentRoleId, createdById: actorId,
            })),
          });
        }
      }

      const archivedAt = new Date();
      const oldAssignments = await tx.eventManagerRoleAssignment.findMany({
        where: { roleId, archivedAt: null },
        select: { id: true },
      });
      const oldAssignmentIds = oldAssignments.map((assignment) => assignment.id);
      if (oldAssignmentIds.length) {
        await tx.eventManagerRoleAssignmentScope.updateMany({
          where: { assignmentId: { in: oldAssignmentIds }, archivedAt: null },
          data: { archivedAt, archivedReason: EventManagerPermissionArchiveReason.MANUAL, updatedById: actorId },
        });
        await tx.eventManagerRoleAssignment.updateMany({
          where: { id: { in: oldAssignmentIds } },
          data: { archivedAt, archivedReason: EventManagerPermissionArchiveReason.MANUAL, updatedById: actorId },
        });
      }

      for (const assignment of normalized.assignments) {
        await tx.eventManagerRoleAssignment.create({
          data: {
            id: crypto.randomUUID(),
            roleId,
            personId: assignment.personId,
            groupId: assignment.groupId,
            validFrom: assignment.validFrom,
            validUntil: assignment.validUntil,
            unlimited: assignment.unlimited,
            createdById: actorId,
            updatedById: actorId,
            scopes: {
              create: assignment.scopes.map((scope) => ({
                id: crypto.randomUUID(),
                scope: scope.scope,
                eventId: scope.eventId,
                majorEventId: scope.majorEventId,
                eventGroupId: scope.eventGroupId,
                validFrom: scope.validFrom,
                validUntil: scope.validUntil,
                unlimited: scope.unlimited,
                createdById: actorId,
                updatedById: actorId,
              })),
            },
          },
        });
      }

      const after = await tx.eventManagerRole.findUniqueOrThrow({ where: { id: roleId }, select: roleSelect });
      await this.auditLog.record({
        entityType: AuditLogEntityType.PERMISSION_ROLE,
        entityId: roleId,
        entityLabel: after.name,
        operation: existing ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
        actor,
        before,
        after,
        scope: { permission: existing ? Permission.PermissionGrant.Update : Permission.PermissionGrant.Create },
        summary: existing ? 'Cargo e atribuições atualizados.' : 'Cargo criado.',
      }, tx);
      return saved.id;
    });

    const roles = await this.listRoles();
    const savedRole = roles.find((role) => role.id === savedId);
    if (!savedRole) throw new NotFoundException('Cargo salvo não foi encontrado.');
    return savedRole;
  }

  async saveGroup(input: PermissionGroupSaveInput, actor: AuthenticatedUser): Promise<PermissionGroup> {
    const name = input.name.trim();
    const description = input.description.trim();
    const emoji = input.emoji.trim() || '👥';
    if (!name) throw new BadRequestException('Informe o nome do grupo.');
    const members = this.normalizeMembers(input.members);
    const existing = input.id
      ? await this.prisma.eventManagerPermissionGroup.findFirst({ where: { id: input.id, archivedAt: null }, select: groupSelect })
      : null;
    if (input.id && !existing) throw new NotFoundException('Grupo não encontrado.');
    await this.authorization.assertPermissions(actor, [
      existing ? Permission.PermissionGrant.Update : Permission.PermissionGrant.Create,
    ]);
    if (existing && input.expectedVersion !== existing.version) {
      throw new ConflictException('Este grupo foi alterado por outra pessoa. Recarregue antes de salvar.');
    }

    await this.assertGroupMembers(members);
    if (existing) await this.assertGroupDelegation(actor, existing);

    const groupId = existing?.id ?? crypto.randomUUID();
    const actorId = actor.sub;
    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.eventManagerPermissionGroup.update({
          where: { id: groupId, version: existing.version },
          data: { name, description, emoji, version: { increment: 1 }, updatedById: actorId },
        });
      } else {
        await tx.eventManagerPermissionGroup.create({
          data: { id: groupId, name, description, emoji, createdById: actorId, updatedById: actorId },
        });
      }
      await tx.eventManagerPermissionGroupMember.updateMany({
        where: { groupId, archivedAt: null },
        data: { archivedAt: new Date(), archivedReason: EventManagerPermissionArchiveReason.MANUAL, updatedById: actorId },
      });
      if (members.length) {
        await tx.eventManagerPermissionGroupMember.createMany({
          data: members.map((member) => ({
            id: crypto.randomUUID(), groupId, personId: member.personId, validFrom: member.validFrom,
            validUntil: member.validUntil, unlimited: member.unlimited, createdById: actorId, updatedById: actorId,
          })),
        });
      }
      const after = await tx.eventManagerPermissionGroup.findUniqueOrThrow({ where: { id: groupId }, select: groupSelect });
      await this.auditLog.record({
        entityType: AuditLogEntityType.PERMISSION_GROUP,
        entityId: groupId,
        entityLabel: after.name,
        operation: existing ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
        actor,
        before: existing,
        after,
        scope: { permission: existing ? Permission.PermissionGrant.Update : Permission.PermissionGrant.Create },
        summary: existing ? 'Grupo de permissões atualizado.' : 'Grupo de permissões criado.',
      }, tx);
    });

    const group = (await this.listGroups()).find((item) => item.id === groupId);
    if (!group) throw new NotFoundException('Grupo salvo não foi encontrado.');
    return group;
  }

  async archiveRole(id: string, actor: AuthenticatedUser): Promise<boolean> {
    const role = await this.prisma.eventManagerRole.findFirst({ where: { id, archivedAt: null }, select: roleSelect });
    if (!role) throw new NotFoundException('Cargo não encontrado.');
    if (role.isSystem) throw new ForbiddenException('Cargos predefinidos não podem ser arquivados.');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventManagerRole.update({ where: { id }, data: { archivedAt: now, updatedById: actor.sub } });
      await tx.eventManagerRoleAssignment.updateMany({
        where: { roleId: id, archivedAt: null },
        data: { archivedAt: now, archivedReason: EventManagerPermissionArchiveReason.ROLE_ARCHIVED, updatedById: actor.sub },
      });
      await tx.eventManagerRoleInheritance.updateMany({
        where: { parentRoleId: id, archivedAt: null },
        data: { archivedAt: now, updatedById: actor.sub },
      });
      await this.auditLog.record({
        entityType: AuditLogEntityType.PERMISSION_ROLE, entityId: id, entityLabel: role.name,
        operation: AuditLogOperation.DELETE, actor, before: role, after: { ...role, archivedAt: now },
        scope: { permission: Permission.PermissionGrant.Delete }, summary: 'Cargo arquivado.', force: true,
      }, tx);
    });
    return true;
  }

  async archiveGroup(id: string, actor: AuthenticatedUser): Promise<boolean> {
    const group = await this.prisma.eventManagerPermissionGroup.findFirst({ where: { id, archivedAt: null }, select: groupSelect });
    if (!group) throw new NotFoundException('Grupo não encontrado.');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventManagerPermissionGroup.update({ where: { id }, data: { archivedAt: now, updatedById: actor.sub } });
      await tx.eventManagerPermissionGroupMember.updateMany({
        where: { groupId: id, archivedAt: null },
        data: { archivedAt: now, archivedReason: EventManagerPermissionArchiveReason.GROUP_ARCHIVED, updatedById: actor.sub },
      });
      await this.auditLog.record({
        entityType: AuditLogEntityType.PERMISSION_GROUP, entityId: id, entityLabel: group.name,
        operation: AuditLogOperation.DELETE, actor, before: group, after: { ...group, archivedAt: now },
        scope: { permission: Permission.PermissionGrant.Delete }, summary: 'Grupo de permissões arquivado.', force: true,
      }, tx);
    });
    return true;
  }

  private async archiveExpiredAccess(): Promise<void> {
    const now = new Date();
    const [scopes, assignments, members] = await this.prisma.$transaction([
      this.prisma.eventManagerRoleAssignmentScope.updateMany({
        where: { archivedAt: null, unlimited: false, validUntil: { lte: now } },
        data: { archivedAt: now, archivedReason: EventManagerPermissionArchiveReason.EXPIRED },
      }),
      this.prisma.eventManagerRoleAssignment.updateMany({
        where: { archivedAt: null, unlimited: false, validUntil: { lte: now } },
        data: { archivedAt: now, archivedReason: EventManagerPermissionArchiveReason.EXPIRED },
      }),
      this.prisma.eventManagerPermissionGroupMember.updateMany({
        where: { archivedAt: null, unlimited: false, validUntil: { lte: now } },
        data: { archivedAt: now, archivedReason: EventManagerPermissionArchiveReason.EXPIRED },
      }),
    ]);
    const expiredCount = scopes.count + assignments.count + members.count;
    if (expiredCount > 0) {
      await this.auditLog.record({
        entityType: AuditLogEntityType.SYSTEM,
        entityId: `permission-expiry:${now.toISOString()}`,
        entityLabel: 'Expiração automática de permissões',
        operation: AuditLogOperation.UPDATE,
        actor: { name: 'Sistema', type: AuditLogActorType.SYSTEM },
        before: { expired: 0 },
        after: { expired: expiredCount, scopes: scopes.count, assignments: assignments.count, members: members.count },
        summary: 'Acessos expirados foram arquivados automaticamente.',
        force: true,
      });
    }
  }

  private normalizeRoleInput(input: PermissionRoleSaveInput) {
    const name = input.name.trim();
    const description = input.description.trim();
    const emoji = input.emoji.trim() || '🔐';
    if (!name) throw new BadRequestException('Informe o nome do cargo.');
    const selected = new Set<Permission>();
    for (const rawPermission of input.permissions) {
      const permission = rawPermission.trim();
      if (!EVENT_MANAGER_PERMISSION_SET.has(permission as Permission)) {
        throw new BadRequestException(`Permissão inválida: ${permission}.`);
      }
      selected.add(permission as Permission);
    }
    const permissions = [...expandHardPermissionDependencies(selected)];
    const parentRoleIds = [...new Set(input.parentRoleIds.map((id) => id.trim()).filter(Boolean))];
    const assignments = this.normalizeAssignments(input.assignments);
    return { name, description, emoji, permissions, parentRoleIds, assignments };
  }

  private normalizeAssignments(assignments: PermissionRoleAssignmentInput[]) {
    const subjects = new Set<string>();
    return assignments.map((assignment) => {
      const personId = assignment.personId?.trim() || null;
      const groupId = assignment.groupId?.trim() || null;
      if (Number(Boolean(personId)) + Number(Boolean(groupId)) !== 1) {
        throw new BadRequestException('Cada atribuição deve indicar uma pessoa ou um grupo.');
      }
      const subjectKey = personId ? `person:${personId}` : `group:${groupId}`;
      if (subjects.has(subjectKey)) throw new BadRequestException('A mesma pessoa ou grupo foi atribuído duas vezes.');
      subjects.add(subjectKey);
      const validity = this.normalizeValidity(assignment.validFrom, assignment.validUntil, assignment.unlimited);
      if (assignment.scopes.length === 0) throw new BadRequestException('Cada atribuição precisa de ao menos um escopo.');
      const scopes = assignment.scopes.map((scope) => ({
        ...this.normalizeScopeTarget(scope.scope, scope.eventId, scope.majorEventId, scope.eventGroupId),
        ...this.normalizeValidity(scope.validFrom, scope.validUntil, scope.unlimited),
      }));
      return { personId, groupId, ...validity, scopes };
    });
  }

  private normalizeMembers(members: PermissionGroupSaveInput['members']) {
    const personIds = new Set<string>();
    return members.map((member) => {
      const personId = member.personId.trim();
      if (!personId) throw new BadRequestException('Selecione a pessoa do grupo.');
      if (personIds.has(personId)) throw new BadRequestException('A mesma pessoa aparece duas vezes no grupo.');
      personIds.add(personId);
      return { personId, ...this.normalizeValidity(member.validFrom, member.validUntil, member.unlimited) };
    });
  }

  private async assertGroupMembers(members: ReturnType<PermissionManagementService['normalizeMembers']>): Promise<void> {
    const activePeopleCount = members.length
      ? await this.prisma.people.count({ where: { id: { in: members.map((member) => member.personId) }, deletedAt: null } })
      : 0;
    if (activePeopleCount !== members.length) {
      throw new BadRequestException('Uma pessoa do grupo não existe mais ou foi excluída.');
    }
  }

  private async assertGroupDelegation(actor: AuthenticatedUser, group: GroupRecord): Promise<void> {
    if (this.authorization.isSuperAdmin(actor) || group.assignments.length === 0) return;
    const roles = await this.prisma.eventManagerRole.findMany({
      where: { id: { in: group.assignments.map((assignment) => assignment.roleId) }, archivedAt: null },
      select: roleSelect,
    });
    const actorPermissions = await this.authorization.grantedPermissionSet(actor);
    for (const role of this.mapRoles(roles, false)) {
      const permissions = [...new Set([...role.permissions, ...role.inheritedPermissions])] as Permission[];
      const outsideCeiling = permissions.filter((permission) => !actorPermissions.has(permission));
      if (outsideCeiling.length) throw new ForbiddenException(`Você não pode delegar permissões que não possui: ${outsideCeiling.join(', ')}.`);
      for (const assignment of role.assignments.filter((item) => item.groupId === group.id)) {
        for (const scope of assignment.scopes) {
          await this.authorization.assertPermissions(actor, permissions, {
            eventId: scope.eventId ?? undefined,
            majorEventId: scope.majorEventId ?? undefined,
            eventGroupId: scope.eventGroupId ?? undefined,
          });
        }
      }
    }
  }

  private normalizeValidity(validFrom: Date | null | undefined, validUntil: Date | null | undefined, unlimited: boolean) {
    const from = validFrom ? new Date(validFrom) : null;
    const until = validUntil ? new Date(validUntil) : null;
    if (!unlimited && !until) throw new BadRequestException('Informe a expiração ou marque Sem limite de tempo.');
    if (unlimited && until) throw new BadRequestException('Acesso sem limite de tempo não pode ter expiração.');
    if (until && until <= new Date()) throw new BadRequestException('A expiração deve estar no futuro.');
    if (from && until && from >= until) throw new BadRequestException('A expiração deve ser posterior ao início.');
    return { validFrom: from, validUntil: unlimited ? null : until, unlimited };
  }

  private normalizeScopeTarget(
    scope: EventManagerPermissionScope,
    eventId?: string | null,
    majorEventId?: string | null,
    eventGroupId?: string | null,
  ) {
    const normalized = {
      scope,
      eventId: eventId?.trim() || null,
      majorEventId: majorEventId?.trim() || null,
      eventGroupId: eventGroupId?.trim() || null,
    };
    const targetCount = Number(Boolean(normalized.eventId)) + Number(Boolean(normalized.majorEventId)) + Number(Boolean(normalized.eventGroupId));
    if (scope === EventManagerPermissionScope.GLOBAL ? targetCount !== 0 : targetCount !== 1) {
      throw new BadRequestException('O alvo informado não corresponde ao tipo de escopo.');
    }
    if (scope === EventManagerPermissionScope.EVENT && !normalized.eventId) throw new BadRequestException('Selecione o evento.');
    if (scope === EventManagerPermissionScope.MAJOR_EVENT && !normalized.majorEventId) throw new BadRequestException('Selecione o grande evento.');
    if (scope === EventManagerPermissionScope.EVENT_GROUP && !normalized.eventGroupId) throw new BadRequestException('Selecione o grupo de eventos.');
    return normalized;
  }

  private async resolveInputEffectivePermissions(direct: Permission[], parentRoleIds: string[]): Promise<Permission[]> {
    const roles = await this.prisma.eventManagerRole.findMany({
      where: { archivedAt: null },
      select: { id: true, systemKey: true, permissions: { select: { permission: true } }, parentLinks: { where: { archivedAt: null }, select: { parentRoleId: true } } },
    });
    const byId = new Map(roles.map((role) => [role.id, role] as const));
    const result = new Set(direct);
    const visit = (id: string, visiting = new Set<string>()) => {
      if (visiting.has(id)) return;
      const role = byId.get(id);
      if (!role) throw new BadRequestException('Cargo pai não encontrado.');
      const definition = role.systemKey ? EVENT_MANAGER_SYSTEM_ROLE_BY_KEY.get(role.systemKey as EventManagerSystemRoleKey) : null;
      const permissions = definition?.permissions ?? role.permissions.map((item) => item.permission as Permission);
      permissions.forEach((permission) => result.add(permission as Permission));
      const next = new Set(visiting).add(id);
      role.parentLinks.forEach((link) => visit(link.parentRoleId, next));
    };
    parentRoleIds.forEach((id) => visit(id));
    return [...expandHardPermissionDependencies(result)];
  }

  private assertContextDependencies(permissions: Permission[]): void {
    const missing = getMissingContextPermissionDependencies(permissions);
    if (missing.length) {
      throw new BadRequestException(
        `Confirme e inclua as permissões relacionadas antes de salvar: ${missing.map((item) => `${item.permission} → ${item.requires.join(', ')}`).join('; ')}.`,
      );
    }
  }

  private async assertRoleInheritance(roleId: string, parents: string[]): Promise<void> {
    if (parents.includes(roleId)) throw new BadRequestException('Um cargo não pode herdar de si mesmo.');
    const links = await this.prisma.eventManagerRoleInheritance.findMany({
      where: { archivedAt: null, childRoleId: { not: roleId } },
      select: { childRoleId: true, parentRoleId: true },
    });
    const parentsByChild = new Map<string, string[]>();
    for (const link of links) parentsByChild.set(link.childRoleId, [...(parentsByChild.get(link.childRoleId) ?? []), link.parentRoleId]);
    parentsByChild.set(roleId, parents);
    const visit = (id: string, visiting: Set<string>, visited: Set<string>) => {
      if (visiting.has(id)) throw new BadRequestException('A herança de cargos formaria um ciclo.');
      if (visited.has(id)) return;
      const next = new Set(visiting).add(id);
      for (const parent of parentsByChild.get(id) ?? []) visit(parent, next, visited);
      visited.add(id);
    };
    visit(roleId, new Set(), new Set());
  }

  private async assertAssignments(assignments: ReturnType<PermissionManagementService['normalizeAssignments']>, permissions: Permission[]) {
    const personIds = assignments.flatMap((assignment) => assignment.personId ? [assignment.personId] : []);
    const groupIds = assignments.flatMap((assignment) => assignment.groupId ? [assignment.groupId] : []);
    const [peopleCount, groupCount] = await Promise.all([
      personIds.length ? this.prisma.people.count({ where: { id: { in: personIds }, deletedAt: null } }) : 0,
      groupIds.length ? this.prisma.eventManagerPermissionGroup.count({ where: { id: { in: groupIds }, archivedAt: null } }) : 0,
    ]);
    if (peopleCount !== personIds.length || groupCount !== groupIds.length) throw new BadRequestException('Uma pessoa ou grupo atribuído não existe mais.');

    const eventIds = [...new Set(assignments.flatMap((assignment) => assignment.scopes.flatMap((scope) => scope.eventId ? [scope.eventId] : [])))];
    const majorEventIds = [...new Set(assignments.flatMap((assignment) => assignment.scopes.flatMap((scope) => scope.majorEventId ? [scope.majorEventId] : [])))];
    const eventGroupIds = [...new Set(assignments.flatMap((assignment) => assignment.scopes.flatMap((scope) => scope.eventGroupId ? [scope.eventGroupId] : [])))];
    const [eventCount, majorEventCount, eventGroupCount] = await Promise.all([
      eventIds.length ? this.prisma.event.count({ where: { id: { in: eventIds }, deletedAt: null } }) : 0,
      majorEventIds.length ? this.prisma.majorEvent.count({ where: { id: { in: majorEventIds }, deletedAt: null } }) : 0,
      eventGroupIds.length ? this.prisma.eventGroup.count({ where: { id: { in: eventGroupIds }, deletedAt: null } }) : 0,
    ]);
    if (eventCount !== eventIds.length || majorEventCount !== majorEventIds.length || eventGroupCount !== eventGroupIds.length) {
      throw new BadRequestException('Um alvo de escopo não existe mais ou foi excluído.');
    }

    for (const assignment of assignments) {
      for (const scope of assignment.scopes) {
        const incompatible = permissions.filter((permission) => !isPermissionGrantScopeCompatible(permission, scope.scope));
        if (incompatible.length) throw new BadRequestException(`O escopo ${scope.scope} não é compatível com: ${incompatible.join(', ')}.`);
      }
      await this.assertNoRedundantScopes(assignment);
    }
  }

  private async assertNoRedundantScopes(assignment: ReturnType<PermissionManagementService['normalizeAssignments']>[number]) {
    const scopes = assignment.scopes;
    const events = await this.prisma.event.findMany({
      where: { id: { in: scopes.flatMap((scope) => scope.eventId ? [scope.eventId] : []) }, deletedAt: null },
      select: { id: true, majorEventId: true, eventGroupId: true },
    });
    const groups = await this.prisma.eventGroup.findMany({
      where: { id: { in: scopes.flatMap((scope) => scope.eventGroupId ? [scope.eventGroupId] : []) }, deletedAt: null },
      select: { id: true, majorEventId: true },
    });
    const eventById = new Map(events.map((event) => [event.id, event] as const));
    const groupById = new Map(groups.map((group) => [group.id, group] as const));
    for (let leftIndex = 0; leftIndex < scopes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < scopes.length; rightIndex += 1) {
        const left = scopes[leftIndex];
        const right = scopes[rightIndex];
        if (!this.validityOverlaps(assignment, left, right)) continue;
        if (left.scope === EventManagerPermissionScope.GLOBAL || right.scope === EventManagerPermissionScope.GLOBAL) {
          throw new BadRequestException('O escopo global torna os demais escopos redundantes.');
        }
        const major = left.majorEventId ?? right.majorEventId;
        const child = left.majorEventId ? right : right.majorEventId ? left : null;
        if (major && child) {
          const childMajor = child.eventId ? eventById.get(child.eventId)?.majorEventId : child.eventGroupId ? groupById.get(child.eventGroupId)?.majorEventId : null;
          if (childMajor === major) throw new BadRequestException('Um grande evento já cobre este grupo ou evento filho no mesmo período.');
        }
        const group = left.eventGroupId ?? right.eventGroupId;
        const eventScope = left.eventGroupId ? right : right.eventGroupId ? left : null;
        if (group && eventScope?.eventId && eventById.get(eventScope.eventId)?.eventGroupId === group) {
          throw new BadRequestException('O grupo de eventos já cobre este evento filho no mesmo período.');
        }
      }
    }
  }

  private validityOverlaps(
    assignment: ReturnType<PermissionManagementService['normalizeAssignments']>[number],
    left: ReturnType<PermissionManagementService['normalizeAssignments']>[number]['scopes'][number],
    right: ReturnType<PermissionManagementService['normalizeAssignments']>[number]['scopes'][number],
  ): boolean {
    const start = (scope: typeof left) => Math.max(assignment.validFrom?.getTime() ?? -Infinity, scope.validFrom?.getTime() ?? -Infinity);
    const end = (scope: typeof left) => Math.min(assignment.validUntil?.getTime() ?? Infinity, scope.validUntil?.getTime() ?? Infinity);
    return start(left) < end(right) && start(right) < end(left);
  }

  private async assertDelegation(actor: AuthenticatedUser, permissions: Permission[], assignments: ReturnType<PermissionManagementService['normalizeAssignments']>) {
    if (this.authorization.isSuperAdmin(actor)) return;
    const actorPermissions = await this.authorization.grantedPermissionSet(actor);
    const outsideCeiling = permissions.filter((permission) => !actorPermissions.has(permission));
    if (outsideCeiling.length) throw new ForbiddenException(`Você não pode delegar permissões que não possui: ${outsideCeiling.join(', ')}.`);
    for (const assignment of assignments) {
      for (const scope of assignment.scopes) {
        const context = { eventId: scope.eventId ?? undefined, majorEventId: scope.majorEventId ?? undefined, eventGroupId: scope.eventGroupId ?? undefined };
        await this.authorization.assertPermissions(actor, permissions, context);
      }
    }
  }

  private async assertDescendantDelegation(actor: AuthenticatedUser, roleId: string, permissions: Permission[]): Promise<void> {
    if (this.authorization.isSuperAdmin(actor)) return;
    const links = await this.prisma.eventManagerRoleInheritance.findMany({
      where: { archivedAt: null },
      select: { parentRoleId: true, childRoleId: true },
    });
    const childrenByParent = new Map<string, string[]>();
    for (const link of links) {
      childrenByParent.set(link.parentRoleId, [...(childrenByParent.get(link.parentRoleId) ?? []), link.childRoleId]);
    }
    const descendants = new Set<string>();
    const pending = [...(childrenByParent.get(roleId) ?? [])];
    while (pending.length) {
      const childId = pending.pop();
      if (!childId || descendants.has(childId)) continue;
      descendants.add(childId);
      pending.push(...(childrenByParent.get(childId) ?? []));
    }
    if (descendants.size === 0) return;
    const actorPermissions = await this.authorization.grantedPermissionSet(actor);
    const outsideCeiling = permissions.filter((permission) => !actorPermissions.has(permission));
    if (outsideCeiling.length) throw new ForbiddenException(`Você não pode delegar permissões que não possui: ${outsideCeiling.join(', ')}.`);
    const assignments = await this.prisma.eventManagerRoleAssignment.findMany({
      where: { roleId: { in: [...descendants] }, archivedAt: null },
      select: {
        scopes: {
          where: { archivedAt: null },
          select: { eventId: true, majorEventId: true, eventGroupId: true },
        },
      },
    });
    for (const assignment of assignments) {
      for (const scope of assignment.scopes) {
        await this.authorization.assertPermissions(actor, permissions, {
          eventId: scope.eventId ?? undefined,
          majorEventId: scope.majorEventId ?? undefined,
          eventGroupId: scope.eventGroupId ?? undefined,
        });
      }
    }
  }

  private mapRoles(records: RoleRecord[], includeArchived: boolean): PermissionRole[] {
    const byId = new Map(records.map((role) => [role.id, role] as const));
    const inherited = (role: RoleRecord, visiting = new Set<string>()): Set<string> => {
      if (visiting.has(role.id)) return new Set();
      const result = new Set<string>();
      const next = new Set(visiting).add(role.id);
      for (const link of role.parentLinks) {
        const parent = byId.get(link.parentRoleId);
        if (!parent) continue;
        const definition = parent.systemKey ? EVENT_MANAGER_SYSTEM_ROLE_BY_KEY.get(parent.systemKey as EventManagerSystemRoleKey) : null;
        (definition?.permissions ?? parent.permissions.map((item) => item.permission)).forEach((permission) => result.add(permission));
        inherited(parent, next).forEach((permission) => result.add(permission));
      }
      return result;
    };
    const syntheticSuperAdmin = EVENT_MANAGER_SYSTEM_ROLES[0];
    const mapped: PermissionRole[] = records.map((role) => {
      const definition = role.systemKey ? EVENT_MANAGER_SYSTEM_ROLE_BY_KEY.get(role.systemKey as EventManagerSystemRoleKey) : null;
      const assignments = role.assignments
        .filter((assignment) => includeArchived || !assignment.archivedAt)
        .map((assignment) => ({
          id: assignment.id,
          personId: assignment.personId,
          groupId: assignment.groupId,
          subjectName: assignment.person?.name ?? assignment.group?.name ?? 'Atribuição arquivada',
          subjectHasLinkedUser: Boolean(assignment.person?.userId),
          validFrom: assignment.validFrom,
          validUntil: assignment.validUntil,
          unlimited: assignment.unlimited,
          archivedAt: assignment.archivedAt,
          scopes: assignment.scopes.filter((scope) => includeArchived || !scope.archivedAt).map((scope) => ({
            id: scope.id,
            scope: scope.scope,
            eventId: scope.eventId,
            majorEventId: scope.majorEventId,
            eventGroupId: scope.eventGroupId,
            targetLabel: scope.event?.name ?? scope.majorEvent?.name ?? scope.eventGroup?.name ?? 'Toda a plataforma',
            validFrom: scope.validFrom,
            validUntil: scope.validUntil,
            unlimited: scope.unlimited,
            archivedAt: scope.archivedAt,
          })),
        }));
      const groupMemberIdsByGroupId = new Map(
        role.assignments
          .flatMap((assignment) => assignment.groupId
            ? [[assignment.groupId, assignment.group?.members.map((member) => member.personId) ?? []] as const]
            : []),
      );
      return {
        id: role.id,
        systemKey: role.systemKey,
        name: definition?.name ?? role.name,
        description: definition?.description ?? role.description,
        emoji: definition?.emoji ?? role.emoji,
        isSystem: role.isSystem,
        isExternal: Boolean(definition?.external),
        assignable: definition?.assignable ?? true,
        version: role.version,
        permissions: [...expandHardPermissionDependencies(definition?.permissions ?? role.permissions.map((item) => item.permission as Permission))],
        inheritedPermissions: [...expandHardPermissionDependencies(inherited(role) as Set<Permission>)],
        parentRoleIds: role.parentLinks.map((link) => link.parentRoleId),
        assignments,
        directPeopleCount: assignments.filter((assignment) => Boolean(assignment.personId)).length,
        groupPeopleCount: new Set(
          assignments.flatMap((assignment) => assignment.groupId ? groupMemberIdsByGroupId.get(assignment.groupId) ?? [] : []),
        ).size,
        archivedAt: role.archivedAt,
        updatedAt: role.updatedAt,
      };
    });
    if (!mapped.some((role) => role.systemKey === syntheticSuperAdmin.key)) {
      mapped.unshift({
        id: 'keycloak:super-admin', systemKey: syntheticSuperAdmin.key, name: syntheticSuperAdmin.name,
        description: syntheticSuperAdmin.description, emoji: syntheticSuperAdmin.emoji, isSystem: true,
        isExternal: true, assignable: false, version: 1, permissions: [...syntheticSuperAdmin.permissions],
        inheritedPermissions: [], parentRoleIds: [], assignments: [], directPeopleCount: 0, groupPeopleCount: 0,
        archivedAt: null, updatedAt: new Date(0),
      });
    }
    return mapped;
  }

  private mapGroup(group: GroupRecord, includeArchived: boolean): PermissionGroup {
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      emoji: group.emoji,
      version: group.version,
      members: group.members.filter((member) => includeArchived || !member.archivedAt).map((member) => ({
        id: member.id,
        person: {
          id: member.person.id,
          name: member.person.name,
          email: member.person.email,
          hasLinkedUser: Boolean(member.person.userId),
        },
        validFrom: member.validFrom,
        validUntil: member.validUntil,
        unlimited: member.unlimited,
        archivedAt: member.archivedAt,
      })),
      assignedRoleIds: [...new Set(group.assignments.map((assignment) => assignment.roleId))],
      archivedAt: group.archivedAt,
      updatedAt: group.updatedAt,
    };
  }
}
