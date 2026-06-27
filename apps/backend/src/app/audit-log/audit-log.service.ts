import { EventManagerKeycloakRole } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLogActorType,
  AuditLogEntry as PrismaAuditLogEntry,
  AuditLogEntityType,
  AuditLogOperation,
  AuditLogRevertMode,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenOperation, FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { findCurrentAuditEntityRecord, updateAuditEntityRecord } from './audit-log.entity-records';
import { mapAuditLogEntry, mapAuditLogExplorerEntry } from './audit-log.entry-mapper';
import { assertValidAuditLogExplorerDateRange, buildAuditLogSearchQuery, buildAuditLogSqlWhere, buildAuditLogTypesenseFilter } from './audit-log.explorer';
import { getAuditFieldLabel } from './audit-log.field-labels';
import { AuditLogEntry, AuditLogExplorerInput, AuditLogExplorerResult } from './audit-log.models';
import { getAuditLogRevertConfig, isReversibleAuditOperation } from './audit-log.revert-config';
import { applyAuditLogRevertInvariants } from './audit-log.revert-invariants';
import { synchronizeRevertedAuditEntity } from './audit-log.reverted-entity-sync';
import { diffAuditRecords, normalizeAuditSnapshot, readAuditSnapshot, toAuditJsonInput, toNullableAuditJsonInput } from './audit-log.snapshots';
import { synchronizeAuditLogEntry } from './audit-log.synchronization';
import { AuditActor, AuditPrismaClient, AuditRecordOptions, RevertEntityConfig, StoredAuditChange } from './audit-log.types';

const DEFAULT_SQUASH_WINDOW_MS = 2 * 60_000;

@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly typesenseSearch: TypesenseSearchService = {
      upsertEvent: async () => undefined,
      deleteEvent: async () => undefined,
      upsertMajorEvent: async () => undefined,
      deleteMajorEvent: async () => undefined,
      upsertEventGroup: async () => undefined,
      deleteEventGroup: async () => undefined,
      upsertPerson: async () => undefined,
      deletePerson: async () => undefined,
      upsertPlacePreset: async () => undefined,
      deletePlacePreset: async () => undefined,
      upsertAuditLogEntry: async () => undefined,
      searchAuditLogEntries: async () => ({ available: false, ids: [], found: 0 }),
    } as unknown as TypesenseSearchService,
    private readonly attendanceRealtime: CurrentUserOnlineAttendanceRealtimeService = {
      notifyAllConnectedPeople: async () => undefined,
    } as unknown as CurrentUserOnlineAttendanceRealtimeService,
    private readonly frozenResources: FrozenResourceService = {
      assertEventMutable: async () => undefined,
      assertEventUpdateMutable: async () => undefined,
      assertEventGroupMutable: async () => undefined,
      assertMajorEventMutable: async () => undefined,
    } as unknown as FrozenResourceService,
  ) {}

  async record(options: AuditRecordOptions, prisma: AuditPrismaClient = this.prisma): Promise<void> {
    const before = normalizeAuditSnapshot(options.before);
    const after = normalizeAuditSnapshot(options.after);
    const changes = diffAuditRecords(before, after);
    if (!options.force && changes.length === 0) {
      return;
    }

    const actor = await this.resolveActor(options.actor, prisma);
    const now = new Date();
    const squashWindowMs = options.squashWindowMs ?? DEFAULT_SQUASH_WINDOW_MS;
    const canSquash =
      squashWindowMs > 0 &&
      options.operation === AuditLogOperation.UPDATE &&
      options.entityType !== AuditLogEntityType.SYSTEM;

    if (canSquash) {
      const squashed = await this.trySquashUpdate(options, actor, before, after, changes, now, squashWindowMs, prisma);
      if (squashed) {
        return;
      }
    }

    const entry = await prisma.auditLogEntry.create({
      data: {
        entityType: options.entityType,
        entityId: options.entityId,
        entityLabel: options.entityLabel ?? null,
        operation: options.operation,
        summary: options.summary ?? null,
        actorId: actor.id ?? null,
        actorName: actor.name,
        actorEmail: actor.email ?? null,
        actorType: actor.type,
        permission: options.scope?.permission ?? null,
        eventId: options.scope?.eventId ?? null,
        majorEventId: options.scope?.majorEventId ?? null,
        eventGroupId: options.scope?.eventGroupId ?? null,
        before: toNullableAuditJsonInput(before),
        after: toNullableAuditJsonInput(after),
        changes: toAuditJsonInput(changes),
        changedFields: changes.map((change) => change.field),
        firstRecordedAt: now,
        lastRecordedAt: now,
        metadata: options.metadata ? toAuditJsonInput(options.metadata) : undefined,
      },
    });
    synchronizeAuditLogEntry(entry, prisma, this.prisma, this.typesenseSearch);
  }

  async listEntityHistory(
    entityType: AuditLogEntityType,
    entityId: string,
    actor: AuthenticatedUser | undefined,
    take = 80,
  ): Promise<AuditLogEntry[]> {
    await this.assertCanReadEntityHistory(entityType, entityId, actor);
    const entries = await this.prisma.auditLogEntry.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: [{ lastRecordedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      take: Math.min(Math.max(Math.trunc(take), 1), 150),
    });

    return entries.map((entry) => mapAuditLogEntry(entry, (auditEntry) => this.canRevertEntry(auditEntry)));
  }

  async exploreAuditLogs(
    input: AuditLogExplorerInput,
    actor: AuthenticatedUser | undefined,
  ): Promise<AuditLogExplorerResult> {
    this.assertCanExploreAuditLogs(actor);
    assertValidAuditLogExplorerDateRange(input.dateFrom, input.dateTo);

    const pagination = resolvePagination(input.skip ?? undefined, input.take ?? undefined);
    const skip = pagination.skip;
    const take = Math.min(pagination.take, 100);
    const searchResult = await this.typesenseSearch.searchAuditLogEntries(buildAuditLogSearchQuery(input), {
      filterBy: buildAuditLogTypesenseFilter(input),
      limit: take,
      offset: skip,
      sortBy: 'lastRecordedAt:desc,createdAt:desc,id:asc',
    });

    if (searchResult.available) {
      const entries = await this.findAuditLogEntriesByIds(searchResult.ids);
      return {
        entries: entries.map((entry) => mapAuditLogExplorerEntry(entry, (auditEntry) => this.canRevertEntry(auditEntry))),
        total: searchResult.found,
        skip,
        take,
        typesenseAvailable: true,
      };
    }

    const where = buildAuditLogSqlWhere(input);
    const [total, entries] = await Promise.all([
      this.prisma.auditLogEntry.count({ where }),
      this.prisma.auditLogEntry.findMany({
        where,
        orderBy: [{ lastRecordedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
    ]);

    return {
      entries: entries.map((entry) => mapAuditLogExplorerEntry(entry, (auditEntry) => this.canRevertEntry(auditEntry))),
      total,
      skip,
      take,
      typesenseAvailable: false,
    };
  }

  async revertEntry(
    input: { entryId: string; mode: AuditLogRevertMode },
    actor: AuthenticatedUser | undefined,
  ): Promise<AuditLogEntry> {
    this.assertSuperAdminAuditAccess(actor);

    const targetEntry = await this.prisma.auditLogEntry.findUnique({
      where: {
        id: input.entryId,
      },
    });

    if (!targetEntry) {
      throw new NotFoundException(`Audit log entry ${input.entryId} was not found.`);
    }

    if (targetEntry.revertedAt) {
      throw new ConflictException('Essa alteração já foi desfeita.');
    }

    if (!isReversibleAuditOperation(targetEntry.operation)) {
      throw new BadRequestException('Esse tipo de alteração não pode ser desfeito automaticamente.');
    }

    const config = getAuditLogRevertConfig(targetEntry.entityType);
    await this.assertCanRevert(targetEntry, config, actor);

    const entriesToRevert = await this.resolveEntriesToRevert(targetEntry, input.mode);
    const laterConflicts = input.mode === AuditLogRevertMode.ENTRY_ONLY
      ? await this.findLaterChangedFields(targetEntry)
      : [];
    if (laterConflicts.length > 0) {
      throw new ConflictException(
        `Campos alterados depois dessa entrada: ${laterConflicts.map((field) => getAuditFieldLabel(field)).join(', ')}. Use "desfazer daqui em diante".`,
      );
    }
    this.assertEntriesCanBeReverted(entriesToRevert);

    const currentRecord = await findCurrentAuditEntityRecord(this.prisma, targetEntry.entityType, targetEntry.entityId);
    if (!currentRecord && targetEntry.operation !== AuditLogOperation.CREATE) {
      throw new NotFoundException('O registro atual não foi encontrado para desfazer a alteração.');
    }

    const revertData = this.buildRevertData(entriesToRevert, input.mode, config);
    if (Object.keys(revertData).length === 0) {
      throw new BadRequestException('Não há campos reversíveis nessa alteração.');
    }
    await this.assertFrozenResourceCanRevert(targetEntry, revertData, actor);

    const resolvedActor = await this.resolveActor(actor);
    const now = new Date();
    const revertResult = await this.prisma.$transaction(async (tx) => {
      const updated = await updateAuditEntityRecord(tx, targetEntry.entityType, targetEntry.entityId, revertData);
      await applyAuditLogRevertInvariants(tx, targetEntry.entityType, updated);
      const changes = diffAuditRecords(normalizeAuditSnapshot(currentRecord), normalizeAuditSnapshot(updated));
      const revertLog = await tx.auditLogEntry.create({
        data: {
          entityType: targetEntry.entityType,
          entityId: targetEntry.entityId,
          entityLabel: targetEntry.entityLabel,
          operation: AuditLogOperation.REVERT,
          summary:
            input.mode === AuditLogRevertMode.ENTRY_AND_AFTER
              ? 'Alteração e entradas posteriores desfeitas.'
              : 'Alteração desfeita.',
          actorId: resolvedActor.id ?? null,
          actorName: resolvedActor.name,
          actorEmail: resolvedActor.email ?? null,
          actorType: resolvedActor.type,
          permission: targetEntry.permission,
          eventId: targetEntry.eventId,
          majorEventId: targetEntry.majorEventId,
          eventGroupId: targetEntry.eventGroupId,
          before: toNullableAuditJsonInput(normalizeAuditSnapshot(currentRecord)),
          after: toNullableAuditJsonInput(normalizeAuditSnapshot(updated)),
          changes: toAuditJsonInput(changes),
          changedFields: changes.map((change) => change.field),
          firstRecordedAt: now,
          lastRecordedAt: now,
          revertTargetId: targetEntry.id,
          revertMode: input.mode,
          metadata: toAuditJsonInput({
            revertedEntryIds: entriesToRevert.map((entry) => entry.id),
          }),
        },
      });

      const revertedEntries = await tx.auditLogEntry.updateMany({
        where: {
          id: {
            in: entriesToRevert.map((entry) => entry.id),
          },
          revertedAt: null,
        },
        data: {
          revertedAt: now,
          revertedById: resolvedActor.id ?? null,
          revertedByName: resolvedActor.name,
          revertedByEntryId: revertLog.id,
        },
      });
      if (revertedEntries.count !== entriesToRevert.length) {
        throw new ConflictException('Uma ou mais alterações já foram desfeitas por outra operação.');
      }

      return { revertLogId: revertLog.id, updated };
    });

    await synchronizeRevertedAuditEntity(
      this.typesenseSearch,
      this.attendanceRealtime,
      targetEntry.entityType,
      targetEntry.entityId,
      revertResult.updated,
    );

    const revertLog = await this.prisma.auditLogEntry.findUniqueOrThrow({
      where: {
        id: revertResult.revertLogId,
      },
    });
    const revertedEntries = await this.prisma.auditLogEntry.findMany({
      where: {
        revertedByEntryId: revertLog.id,
      },
    });
    for (const entry of [revertLog, ...revertedEntries]) {
      synchronizeAuditLogEntry(entry, this.prisma, this.prisma, this.typesenseSearch);
    }
    return mapAuditLogEntry(revertLog, (auditEntry) => this.canRevertEntry(auditEntry));
  }

  buildCompositeEntityId(parts: readonly string[]): string {
    return parts.map((part) => encodeURIComponent(part)).join(':');
  }

  private assertCanExploreAuditLogs(actor: AuthenticatedUser | undefined): void {
    if (!this.authorizationPolicy.isSuperAdmin(actor)) {
      throw new ForbiddenException('Somente super-admins podem consultar todos os logs de auditoria.');
    }
  }

  private async findAuditLogEntriesByIds(ids: readonly string[]): Promise<PrismaAuditLogEntry[]> {
    if (ids.length === 0) {
      return [];
    }

    const entries = await this.prisma.auditLogEntry.findMany({
      where: {
        id: {
          in: [...ids],
        },
      },
    });
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    return ids.flatMap((id) => {
      const entry = entriesById.get(id);
      return entry ? [entry] : [];
    });
  }

  private async trySquashUpdate(
    options: AuditRecordOptions,
    actor: AuditActor,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    changes: StoredAuditChange[],
    now: Date,
    squashWindowMs: number,
    prisma: AuditPrismaClient,
  ): Promise<boolean> {
    const lastEntry = await prisma.auditLogEntry.findFirst({
      where: {
        entityType: options.entityType,
        entityId: options.entityId,
        revertedAt: null,
        revertTargetId: null,
      },
      orderBy: [{ lastRecordedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });

    if (!lastEntry || !this.canSquashIntoEntry(lastEntry, options, actor, now, squashWindowMs)) {
      return false;
    }

    const originalBefore = readAuditSnapshot(lastEntry.before) ?? before;
    const squashedChanges = diffAuditRecords(originalBefore, after);
    if (squashedChanges.length === 0) {
      return false;
    }

    const updatedEntry = await prisma.auditLogEntry.update({
      where: {
        id: lastEntry.id,
      },
      data: {
        entityLabel: options.entityLabel ?? lastEntry.entityLabel,
        summary: options.summary ?? lastEntry.summary,
        after: toNullableAuditJsonInput(after),
        changes: toAuditJsonInput(squashedChanges),
        changedFields: squashedChanges.map((change) => change.field),
        groupedCount: {
          increment: 1,
        },
        lastRecordedAt: now,
      },
    });
    synchronizeAuditLogEntry(updatedEntry, prisma, this.prisma, this.typesenseSearch);

    return true;
  }

  private canSquashIntoEntry(
    entry: PrismaAuditLogEntry,
    options: AuditRecordOptions,
    actor: AuditActor,
    now: Date,
    squashWindowMs: number,
  ): boolean {
    return (
      entry.operation === options.operation &&
      (entry.actorId ?? null) === (actor.id ?? null) &&
      entry.actorName === actor.name &&
      (entry.permission ?? null) === (options.scope?.permission ?? null) &&
      (entry.eventId ?? null) === (options.scope?.eventId ?? null) &&
      (entry.majorEventId ?? null) === (options.scope?.majorEventId ?? null) &&
      (entry.eventGroupId ?? null) === (options.scope?.eventGroupId ?? null) &&
      entry.lastRecordedAt.getTime() >= now.getTime() - squashWindowMs
    );
  }

  private async resolveActor(
    actor: AuthenticatedUser | AuditActor | null | undefined,
    prisma: AuditPrismaClient = this.prisma,
  ): Promise<AuditActor> {
    if (!actor) {
      return {
        name: 'Sistema',
        type: AuditLogActorType.SYSTEM,
      };
    }

    if ('type' in actor) {
      return actor;
    }

    const actorId = actor.sub ?? null;
    const persistedUser = actorId
      ? await prisma.user.findUnique({
          where: {
            id: actorId,
          },
          select: {
            name: true,
            email: true,
          },
        })
      : null;
    const claimName = this.readStringClaim(actor.claims, 'name') ?? this.readStringClaim(actor.claims, 'preferred_username');

    return {
      id: actorId,
      name: persistedUser?.name ?? claimName ?? actor.preferredUsername ?? actor.email ?? actor.sub ?? 'Usuário autenticado',
      email: persistedUser?.email ?? actor.email ?? null,
      type: AuditLogActorType.USER,
    };
  }

  private readStringClaim(claims: Record<string, unknown>, key: string): string | null {
    const value = claims[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private async assertCanReadEntityHistory(
    entityType: AuditLogEntityType,
    entityId: string,
    actor: AuthenticatedUser | undefined,
  ): Promise<void> {
    this.assertSuperAdminAuditAccess(actor);
    const config = this.getAccessConfig(entityType);
    const context = await this.resolveAuthorizationContext(entityType, entityId);
    await this.authorizationPolicy.assertPermissions(actor, [config.readPermission], context);
  }

  private assertSuperAdminAuditAccess(actor: AuthenticatedUser | undefined): void {
    if (!this.authorizationPolicy.isSuperAdmin(actor)) {
      throw new ForbiddenException(`Missing required Keycloak role: ${EventManagerKeycloakRole.SuperAdmin}.`);
    }
  }

  private async assertCanRevert(
    entry: PrismaAuditLogEntry,
    config: RevertEntityConfig,
    actor: AuthenticatedUser | undefined,
  ): Promise<void> {
    this.assertSuperAdminAuditAccess(actor);
    const permission =
      entry.operation === AuditLogOperation.CREATE
        ? config.deletePermission ?? config.updatePermission
        : config.updatePermission;
    if (!permission) {
      throw new BadRequestException('Esse registro não tem uma permissão de reversão configurada.');
    }

    const context = await this.resolveAuthorizationContext(entry.entityType, entry.entityId, entry);
    await this.authorizationPolicy.assertPermissions(actor, [permission], context);
  }

  private getAccessConfig(entityType: AuditLogEntityType): Pick<RevertEntityConfig, 'readPermission'> {
    return getAuditLogRevertConfig(entityType);
  }

  private async resolveAuthorizationContext(
    entityType: AuditLogEntityType,
    entityId: string,
    entry?: Pick<PrismaAuditLogEntry, 'eventId' | 'majorEventId' | 'eventGroupId'>,
  ) {
    switch (entityType) {
      case AuditLogEntityType.EVENT:
        return { genericId: entityId, primaryResource: 'event', eventId: entityId };
      case AuditLogEntityType.MAJOR_EVENT:
        return { genericId: entityId, primaryResource: 'major-event', majorEventId: entityId };
      case AuditLogEntityType.EVENT_GROUP:
        return { genericId: entityId, primaryResource: 'event-group', eventGroupId: entityId };
      case AuditLogEntityType.EVENT_SUBSCRIPTION:
      case AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION:
      case AuditLogEntityType.MAJOR_EVENT_SUBSCRIPTION:
        return { genericId: entityId, primaryResource: 'subscription', subscriptionId: entityId };
      case AuditLogEntityType.EVENT_ATTENDANCE:
        return this.resolveEventAttendanceContext(entityId, entry);
      case AuditLogEntityType.EVENT_ATTENDANCE_COLLECTOR:
      case AuditLogEntityType.EVENT_LECTURER:
      case AuditLogEntityType.CERTIFICATE_CONFIG:
      case AuditLogEntityType.CERTIFICATE:
      case AuditLogEntityType.RECEIPT_VALIDATION:
        return {
          eventId: entry?.eventId ?? undefined,
          majorEventId: entry?.majorEventId ?? undefined,
          eventGroupId: entry?.eventGroupId ?? undefined,
        };
      default:
        return {};
    }
  }

  private async resolveEntriesToRevert(
    targetEntry: PrismaAuditLogEntry,
    mode: AuditLogRevertMode,
  ): Promise<PrismaAuditLogEntry[]> {
    if (mode === AuditLogRevertMode.ENTRY_ONLY) {
      return [targetEntry];
    }

    return this.prisma.auditLogEntry.findMany({
      where: {
        entityType: targetEntry.entityType,
        entityId: targetEntry.entityId,
        revertedAt: null,
        operation: {
          not: AuditLogOperation.REVERT,
        },
        lastRecordedAt: {
          gte: targetEntry.lastRecordedAt,
        },
      },
      orderBy: {
        lastRecordedAt: 'desc',
      },
    });
  }

  private async findLaterChangedFields(targetEntry: PrismaAuditLogEntry): Promise<string[]> {
    const targetFields = new Set(targetEntry.changedFields);
    const targetRootFields = new Set(targetEntry.changedFields.map((field) => field.split('.')[0]));
    const laterEntries = await this.prisma.auditLogEntry.findMany({
      where: {
        entityType: targetEntry.entityType,
        entityId: targetEntry.entityId,
        revertedAt: null,
        operation: {
          not: AuditLogOperation.REVERT,
        },
        lastRecordedAt: {
          gt: targetEntry.lastRecordedAt,
        },
      },
      select: {
        changedFields: true,
      },
    });

    return [
      ...new Set(
        laterEntries
          .flatMap((entry) => entry.changedFields)
          .filter((field) => targetFields.has(field) || targetRootFields.has(field.split('.')[0])),
      ),
    ];
  }

  private buildRevertData(
    entries: PrismaAuditLogEntry[],
    mode: AuditLogRevertMode,
    config: RevertEntityConfig,
  ): Record<string, unknown> {
    const mutableFields = new Set(config.mutableFields);
    const data: Record<string, unknown> = {};

    if (mode === AuditLogRevertMode.ENTRY_ONLY && entries[0]?.operation === AuditLogOperation.CREATE) {
      if (!config.supportsSoftDelete) {
        throw new BadRequestException('Criações desse tipo não podem ser desfeitas automaticamente.');
      }

      return { deletedAt: new Date() };
    }

    for (const entry of entries) {
      if (!isReversibleAuditOperation(entry.operation)) {
        throw new BadRequestException('Esse tipo de alteração não pode ser desfeito automaticamente.');
      }

      if (entry.operation === AuditLogOperation.CREATE) {
        if (config.supportsSoftDelete) {
          data['deletedAt'] = new Date();
        }
        continue;
      }

      const before = readAuditSnapshot(entry.before);
      if (!before) {
        continue;
      }

      for (const field of entry.changedFields) {
        const rootField = field.split('.')[0];
        if (!mutableFields.has(rootField)) {
          throw new BadRequestException(`O campo ${getAuditFieldLabel(field)} não pode ser desfeito automaticamente.`);
        }
        data[rootField] = before[rootField] ?? null;
      }
    }

    return data;
  }

  private assertEntriesCanBeReverted(entries: PrismaAuditLogEntry[]): void {
    const nonReversibleEntry = entries.find((entry) => !isReversibleAuditOperation(entry.operation));
    if (nonReversibleEntry) {
      throw new BadRequestException(
        `A entrada ${nonReversibleEntry.id} tem um tipo de alteração que não pode ser desfeito automaticamente.`,
      );
    }
  }

  private async assertFrozenResourceCanRevert(
    entry: PrismaAuditLogEntry,
    revertData: Record<string, unknown>,
    actor: AuthenticatedUser | undefined,
  ): Promise<void> {
    const operation: FrozenOperation = entry.operation === AuditLogOperation.CREATE ? 'delete' : 'edit';

    switch (entry.entityType) {
      case AuditLogEntityType.EVENT:
        if (operation === 'delete') {
          await this.frozenResources.assertEventMutable(entry.entityId, actor, operation, true);
          return;
        }

        await this.frozenResources.assertEventUpdateMutable(
          entry.entityId,
          {
            eventGroupId: this.readOptionalId(revertData['eventGroupId']),
            majorEventId: this.readOptionalId(revertData['majorEventId']),
          },
          actor,
          true,
        );
        return;
      case AuditLogEntityType.MAJOR_EVENT:
        await this.frozenResources.assertMajorEventMutable(entry.entityId, actor, operation, true);
        return;
      case AuditLogEntityType.EVENT_GROUP:
        await this.frozenResources.assertEventGroupMutable(entry.entityId, actor, operation, true);
        return;
      default:
        return;
    }
  }

  private readOptionalId(value: unknown): string | null | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (value === null) {
      return null;
    }

    return undefined;
  }

  private canRevertEntry(entry: PrismaAuditLogEntry): boolean {
    if (entry.revertedAt || !isReversibleAuditOperation(entry.operation)) {
      return false;
    }

    try {
      const config = getAuditLogRevertConfig(entry.entityType);
      if (entry.operation === AuditLogOperation.CREATE) {
        return Boolean(config.deletePermission && config.supportsSoftDelete);
      }

      if (!config.updatePermission || config.mutableFields.length === 0 || entry.changedFields.length === 0) {
        return false;
      }

      return this.changedFieldsAreReversible(entry.changedFields, config);
    } catch {
      return false;
    }
  }

  private changedFieldsAreReversible(changedFields: readonly string[], config: RevertEntityConfig): boolean {
    const mutableFields = new Set(config.mutableFields);
    return changedFields.every((field) => mutableFields.has(field.split('.')[0]));
  }

  private resolveEventAttendanceContext(
    entityId: string,
    entry?: Pick<PrismaAuditLogEntry, 'eventId' | 'majorEventId' | 'eventGroupId'>,
  ) {
    const decodedEventId = this.decodeCompositeEntityId(entityId)[1];
    return {
      eventId: entry?.eventId ?? decodedEventId,
      majorEventId: entry?.majorEventId ?? undefined,
      eventGroupId: entry?.eventGroupId ?? undefined,
    };
  }

  private decodeCompositeEntityId(entityId: string): string[] {
    return entityId.split(':').map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  }

}
