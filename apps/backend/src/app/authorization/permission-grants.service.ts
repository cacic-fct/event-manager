import {
  EVENT_MANAGER_PERMISSION_SET,
  Permission,
  requiresGlobalPermissionGrantScope,
} from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLogActorType,
  AuditLogEntityType,
  AuditLogOperation,
  EventManagerPermissionGrantScope,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EventManagerPermissionGrant,
  EventManagerPermissionGrantCreateInput,
  EventManagerPermissionGrantTarget,
  EventManagerPermissionGrantUpdateInput,
} from './permission-grants.models';

const GRANT_SELECT = {
  id: true,
  userId: true,
  personId: true,
  permission: true,
  scope: true,
  eventId: true,
  majorEventId: true,
  eventGroupId: true,
  event: {
    select: {
      name: true,
    },
  },
  majorEvent: {
    select: {
      name: true,
    },
  },
  eventGroup: {
    select: {
      name: true,
    },
  },
  validFrom: true,
  validUntil: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventManagerPermissionGrantSelect;

type GrantRecord = Prisma.EventManagerPermissionGrantGetPayload<{ select: typeof GRANT_SELECT }>;

@Injectable()
export class PermissionGrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
    } as unknown as AuditLogService,
  ) {}

  async listUserGrants(userId: string): Promise<EventManagerPermissionGrant[]> {
    const grants = await this.prisma.eventManagerPermissionGrant.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      select: GRANT_SELECT,
      orderBy: [{ permission: 'asc' }, { scope: 'asc' }, { createdAt: 'asc' }],
    });

    return grants.map((grant) => this.mapGrant(grant));
  }

  async listGrantTargets(
    scope: EventManagerPermissionGrantScope,
    take = 500,
  ): Promise<EventManagerPermissionGrantTarget[]> {
    const resolvedTake = Math.min(Math.max(Math.trunc(take), 1), 500);
    switch (scope) {
      case EventManagerPermissionGrantScope.EVENT:
        return this.listEventGrantTargets(resolvedTake);
      case EventManagerPermissionGrantScope.MAJOR_EVENT:
        return this.listMajorEventGrantTargets(resolvedTake);
      case EventManagerPermissionGrantScope.EVENT_GROUP:
        return this.listEventGroupGrantTargets(resolvedTake);
      case EventManagerPermissionGrantScope.GLOBAL:
        return [];
    }
  }

  async createGrant(
    input: EventManagerPermissionGrantCreateInput,
    actor?: AuthenticatedUser | string,
  ): Promise<EventManagerPermissionGrant> {
    const actorId = this.getActorId(actor);
    const data = await this.buildCreateData(input, actorId);
    const existingGrant = await this.findMatchingActiveGrant(data);
    if (existingGrant) {
      if (!this.hasSameValidityWindow(existingGrant, data)) {
        throw new ConflictException(
          'Essa permissão já foi concedida para esse escopo. Remova a concessão atual antes de alterar a validade.',
        );
      }

      return this.mapGrant(existingGrant);
    }

    try {
      const grant = await this.prisma.$transaction(async (tx) => {
        const created = await tx.eventManagerPermissionGrant.create({ data, select: GRANT_SELECT });
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.PERMISSION_GRANT,
            entityId: created.id,
            entityLabel: this.getGrantEntityLabel(created),
            operation: AuditLogOperation.CREATE,
            actor: this.getAuditActor(actor),
            after: created,
            scope: {
              permission: Permission.PermissionGrant.Create,
              eventId: created.eventId,
              majorEventId: created.majorEventId,
              eventGroupId: created.eventGroupId,
            },
            summary: 'Permissão concedida.',
          },
          tx,
        );
        return created;
      });

      return this.mapGrant(grant);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta permissão já foi concedida para esse escopo.');
      }

      throw error;
    }
  }

  async deleteGrant(id: string, actor?: AuthenticatedUser | string): Promise<void> {
    const actorId = this.getActorId(actor);
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const existingGrant = await tx.eventManagerPermissionGrant.findFirst({
        where: { id, deletedAt: null },
        select: GRANT_SELECT,
      });
      if (!existingGrant) throw new NotFoundException(`Permission grant ${id} was not found.`);
      const deleted = await tx.eventManagerPermissionGrant.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt, updatedById: actorId },
      });
      if (deleted.count !== 1) {
        throw new ConflictException('Essa permissão já foi removida.');
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.PERMISSION_GRANT,
          entityId: existingGrant.id,
          entityLabel: this.getGrantEntityLabel(existingGrant),
          operation: AuditLogOperation.DELETE,
          actor: this.getAuditActor(actor),
          before: existingGrant,
          after: { ...existingGrant, deletedAt, updatedById: actorId },
          scope: {
            permission: Permission.PermissionGrant.Delete,
            eventId: existingGrant.eventId,
            majorEventId: existingGrant.majorEventId,
            eventGroupId: existingGrant.eventGroupId,
          },
          summary: 'Permissão removida.',
          force: true,
        },
        tx,
      );
    });
  }

  async updateGrant(
    id: string,
    input: EventManagerPermissionGrantUpdateInput,
    actor?: AuthenticatedUser | string,
  ): Promise<EventManagerPermissionGrant> {
    const actorId = this.getActorId(actor);
    const existingGrant = await this.prisma.eventManagerPermissionGrant.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: GRANT_SELECT,
    });

    if (!existingGrant) {
      throw new NotFoundException(`Permission grant ${id} was not found.`);
    }

    const data = await this.buildGrantData(
      {
        userId: existingGrant.userId,
        personId: existingGrant.personId,
        ...input,
      },
      actorId,
      { includeCreatedBy: false, preserveUndefinedValidity: true },
    );
    const duplicateGrant = await this.findMatchingActiveGrant(data, id);
    if (duplicateGrant) {
      throw new ConflictException('Esta permissão já foi concedida para esse escopo.');
    }

    try {
      const grant = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.eventManagerPermissionGrant.update({
          where: { id, deletedAt: null },
          data,
          select: GRANT_SELECT,
        });
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.PERMISSION_GRANT,
            entityId: updated.id,
            entityLabel: this.getGrantEntityLabel(updated),
            operation: AuditLogOperation.UPDATE,
            actor: this.getAuditActor(actor),
            before: existingGrant,
            after: updated,
            scope: {
              permission: Permission.PermissionGrant.Update,
              eventId: updated.eventId,
              majorEventId: updated.majorEventId,
              eventGroupId: updated.eventGroupId,
            },
            summary: 'Permissão atualizada.',
          },
          tx,
        );
        return updated;
      });

      return this.mapGrant(grant);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta permissão já foi concedida para esse escopo.');
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Permission grant ${id} was not found.`);
      }

      throw error;
    }
  }

  private async buildCreateData(
    input: EventManagerPermissionGrantCreateInput,
    actorId?: string,
  ): Promise<Prisma.EventManagerPermissionGrantUncheckedCreateInput> {
    return this.buildGrantData(input, actorId, { includeCreatedBy: true, preserveUndefinedValidity: false });
  }

  private getActorId(actor: AuthenticatedUser | string | undefined): string | undefined {
    return typeof actor === 'string' ? actor : actor?.sub;
  }

  private getAuditActor(
    actor: AuthenticatedUser | string | undefined,
  ): AuthenticatedUser | { id: string; name: string; type: AuditLogActorType } | undefined {
    if (!actor) {
      return undefined;
    }

    if (typeof actor !== 'string') {
      return actor;
    }

    return {
      id: actor,
      name: actor,
      type: AuditLogActorType.USER,
    };
  }

  private getGrantEntityLabel(
    grant: Pick<GrantRecord, 'permission' | 'scope' | 'event' | 'majorEvent' | 'eventGroup'>,
  ): string {
    const targetLabel = grant.event?.name ?? grant.majorEvent?.name ?? grant.eventGroup?.name ?? null;
    return [grant.permission, grant.scope, targetLabel].filter(Boolean).join(' · ');
  }

  private async buildGrantData(
    input: EventManagerPermissionGrantCreateInput,
    actorId: string | undefined,
    options: { includeCreatedBy: boolean; preserveUndefinedValidity: boolean },
  ): Promise<Prisma.EventManagerPermissionGrantUncheckedCreateInput> {
    const userId = input.userId.trim();
    if (!userId) {
      throw new BadRequestException('Informe o usuário que receberá a permissão.');
    }

    const permission = input.permission.trim();
    if (!EVENT_MANAGER_PERMISSION_SET.has(permission as Permission)) {
      throw new BadRequestException(`Permissão inválida: ${permission}.`);
    }
    this.assertScopeAllowedForPermission(permission as Permission, input.scope);

    await this.ensureUserExists(userId);
    await this.ensurePersonMatchesUser(input.personId, userId);

    const data: Prisma.EventManagerPermissionGrantUncheckedCreateInput = {
      userId,
      personId: input.personId?.trim() || undefined,
      permission,
      scope: input.scope,
      eventId: null,
      majorEventId: null,
      eventGroupId: null,
      ...this.normalizeValidityWindow(input.validFrom, input.validUntil, {
        preserveUndefined: options.preserveUndefinedValidity,
      }),
      updatedById: actorId,
    };
    if (options.includeCreatedBy) {
      data.createdById = actorId;
    }

    switch (input.scope) {
      case EventManagerPermissionGrantScope.GLOBAL:
        this.assertNoScopedTargets(input);
        return data;
      case EventManagerPermissionGrantScope.EVENT:
        this.assertOnlyScopedTarget(input, 'eventId');
        data.eventId = await this.requireActiveEvent(input.eventId);
        return data;
      case EventManagerPermissionGrantScope.MAJOR_EVENT:
        this.assertOnlyScopedTarget(input, 'majorEventId');
        data.majorEventId = await this.requireActiveMajorEvent(input.majorEventId);
        return data;
      case EventManagerPermissionGrantScope.EVENT_GROUP:
        this.assertOnlyScopedTarget(input, 'eventGroupId');
        data.eventGroupId = await this.requireActiveEventGroup(input.eventGroupId);
        return data;
    }
  }

  private async findMatchingActiveGrant(
    data: Prisma.EventManagerPermissionGrantUncheckedCreateInput,
    exceptId?: string,
  ): Promise<GrantRecord | null> {
    return this.prisma.eventManagerPermissionGrant.findFirst({
      where: {
        ...(exceptId ? { id: { not: exceptId } } : {}),
        userId: data.userId,
        permission: data.permission,
        scope: data.scope,
        deletedAt: null,
        eventId: data.eventId ?? null,
        majorEventId: data.majorEventId ?? null,
        eventGroupId: data.eventGroupId ?? null,
      },
      select: GRANT_SELECT,
    });
  }

  private async listEventGrantTargets(take: number): Promise<EventManagerPermissionGrantTarget[]> {
    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        emoji: true,
        startDate: true,
        endDate: true,
        majorEvent: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        startDate: 'desc',
      },
      take,
    });

    return events.map((event) => ({
      id: event.id,
      label: event.name,
      description: event.majorEvent?.name ?? 'Evento sem grande evento',
      emoji: event.emoji,
      startDate: event.startDate,
      endDate: event.endDate,
    }));
  }

  private async listMajorEventGrantTargets(take: number): Promise<EventManagerPermissionGrantTarget[]> {
    const majorEvents = await this.prisma.majorEvent.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        emoji: true,
        startDate: true,
        endDate: true,
      },
      orderBy: {
        startDate: 'desc',
      },
      take,
    });

    return majorEvents.map((event) => ({
      id: event.id,
      label: event.name,
      description: 'Grande evento',
      emoji: event.emoji,
      startDate: event.startDate,
      endDate: event.endDate,
    }));
  }

  private async listEventGroupGrantTargets(take: number): Promise<EventManagerPermissionGrantTarget[]> {
    const eventGroups = await this.prisma.eventGroup.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        emoji: true,
        events: {
          where: {
            deletedAt: null,
          },
          select: {
            startDate: true,
            endDate: true,
          },
          orderBy: {
            startDate: 'asc',
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
      take,
    });

    return eventGroups.map((group) => ({
      id: group.id,
      label: group.name,
      description: 'Grupo de eventos',
      emoji: group.emoji,
      startDate: group.events[0]?.startDate ?? null,
      endDate:
        group.events.reduce<Date | null>(
          (latest, event) => (!latest || event.endDate > latest ? event.endDate : latest),
          null,
        ) ?? null,
    }));
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} was not found.`);
    }
  }

  private async ensurePersonMatchesUser(personId: string | null | undefined, userId: string): Promise<void> {
    const normalizedPersonId = personId?.trim();
    if (!normalizedPersonId) {
      return;
    }

    const person = await this.prisma.people.findFirst({
      where: {
        id: normalizedPersonId,
        deletedAt: null,
      },
      select: {
        userId: true,
      },
    });

    if (!person) {
      throw new NotFoundException(`Person ${normalizedPersonId} was not found.`);
    }

    if (person.userId !== userId) {
      throw new BadRequestException('A pessoa selecionada não está vinculada a esse usuário.');
    }
  }

  private assertScopeAllowedForPermission(permission: Permission, scope: EventManagerPermissionGrantScope): void {
    if (scope === EventManagerPermissionGrantScope.GLOBAL || !requiresGlobalPermissionGrantScope(permission)) {
      return;
    }

    throw new BadRequestException('Essa permissão só pode ser concedida com escopo global.');
  }

  private normalizeValidityWindow(
    validFrom: Date | string | null | undefined,
    validUntil: Date | string | null | undefined,
    options: { preserveUndefined: boolean },
  ): Pick<Prisma.EventManagerPermissionGrantUncheckedCreateInput, 'validFrom' | 'validUntil'> {
    const normalizedValidFrom = this.normalizeOptionalDate(validFrom, 'início da validade');
    const normalizedValidUntil = this.normalizeOptionalDate(validUntil, 'fim da validade');

    if (normalizedValidFrom && normalizedValidUntil && normalizedValidUntil.getTime() <= normalizedValidFrom.getTime()) {
      throw new BadRequestException('O fim da validade precisa ser posterior ao início.');
    }

    if (normalizedValidUntil && normalizedValidUntil.getTime() <= Date.now()) {
      throw new BadRequestException('O fim da validade precisa ser futuro.');
    }

    return {
      ...(options.preserveUndefined && validFrom === undefined ? {} : { validFrom: normalizedValidFrom }),
      ...(options.preserveUndefined && validUntil === undefined ? {} : { validUntil: normalizedValidUntil }),
    };
  }

  private normalizeOptionalDate(value: Date | string | null | undefined, fieldLabel: string): Date | null {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Informe uma data válida para ${fieldLabel}.`);
    }

    return date;
  }

  private hasSameValidityWindow(
    grant: Pick<GrantRecord, 'validFrom' | 'validUntil'>,
    data: Prisma.EventManagerPermissionGrantUncheckedCreateInput,
  ): boolean {
    return this.sameInstant(grant.validFrom, data.validFrom) && this.sameInstant(grant.validUntil, data.validUntil);
  }

  private sameInstant(left: Date | string | null | undefined, right: Date | string | null | undefined): boolean {
    const leftTime = left ? new Date(left).getTime() : null;
    const rightTime = right ? new Date(right).getTime() : null;
    return leftTime === rightTime;
  }

  private assertNoScopedTargets(input: EventManagerPermissionGrantCreateInput): void {
    if (input.eventId?.trim() || input.majorEventId?.trim() || input.eventGroupId?.trim()) {
      throw new BadRequestException('Permissões globais não podem ter alvo de escopo.');
    }
  }

  private assertOnlyScopedTarget(
    input: EventManagerPermissionGrantCreateInput,
    targetField: 'eventId' | 'majorEventId' | 'eventGroupId',
  ): void {
    const targets = {
      eventId: input.eventId?.trim(),
      majorEventId: input.majorEventId?.trim(),
      eventGroupId: input.eventGroupId?.trim(),
    };

    if (Object.entries(targets).some(([field, value]) => field !== targetField && Boolean(value))) {
      throw new BadRequestException('Informe apenas o alvo compatível com o escopo.');
    }
  }

  private async requireActiveEvent(eventId: string | null | undefined): Promise<string> {
    const normalizedId = eventId?.trim();
    if (!normalizedId) {
      throw new BadRequestException('Informe o evento do escopo.');
    }

    const event = await this.prisma.event.findFirst({
      where: {
        id: normalizedId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!event) {
      throw new NotFoundException(`Event ${normalizedId} was not found.`);
    }

    return event.id;
  }

  private async requireActiveMajorEvent(majorEventId: string | null | undefined): Promise<string> {
    const normalizedId = majorEventId?.trim();
    if (!normalizedId) {
      throw new BadRequestException('Informe o grande evento do escopo.');
    }

    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: normalizedId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${normalizedId} was not found.`);
    }

    return majorEvent.id;
  }

  private async requireActiveEventGroup(eventGroupId: string | null | undefined): Promise<string> {
    const normalizedId = eventGroupId?.trim();
    if (!normalizedId) {
      throw new BadRequestException('Informe o grupo de eventos do escopo.');
    }

    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: {
        id: normalizedId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!eventGroup) {
      throw new NotFoundException(`Event group ${normalizedId} was not found.`);
    }

    return eventGroup.id;
  }

  private mapGrant(grant: GrantRecord): EventManagerPermissionGrant {
    return {
      id: grant.id,
      userId: grant.userId,
      personId: grant.personId,
      permission: grant.permission,
      scope: grant.scope,
      eventId: grant.eventId,
      majorEventId: grant.majorEventId,
      eventGroupId: grant.eventGroupId,
      targetLabel: grant.event?.name ?? grant.majorEvent?.name ?? grant.eventGroup?.name ?? null,
      validFrom: grant.validFrom,
      validUntil: grant.validUntil,
      createdAt: grant.createdAt,
      createdById: grant.createdById,
      updatedAt: grant.updatedAt,
      updatedById: grant.updatedById,
    };
  }
}
