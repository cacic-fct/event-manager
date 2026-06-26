import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLogActorType,
  AuditLogEntry as PrismaAuditLogEntry,
  AuditLogEntityType,
  AuditLogOperation,
  AuditLogRevertMode,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenOperation, FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import {
  AuditLogEntry,
  AuditLogExplorerEntry,
  AuditLogExplorerInput,
  AuditLogExplorerResult,
  AuditLogExplorerRevertedStatus,
} from './audit-log.models';

type AuditActor = {
  id?: string | null;
  name: string;
  email?: string | null;
  type: AuditLogActorType;
};

type AuditScope = {
  permission?: Permission | string | null;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
};

type AuditRecordOptions = {
  entityType: AuditLogEntityType;
  entityId: string;
  entityLabel?: string | null;
  operation: AuditLogOperation;
  actor?: AuthenticatedUser | AuditActor | null;
  before?: unknown;
  after?: unknown;
  summary?: string | null;
  scope?: AuditScope;
  metadata?: Record<string, unknown>;
  force?: boolean;
  squashWindowMs?: number;
};

type AuditPrismaClient = PrismaService | Prisma.TransactionClient;

type StoredAuditChange = {
  field: string;
  label?: string;
  before: unknown;
  after: unknown;
};

type RevertEntityConfig = {
  readPermission: Permission;
  updatePermission?: Permission;
  deletePermission?: Permission;
  select: Record<string, unknown>;
  mutableFields: readonly string[];
  supportsSoftDelete: boolean;
};

const DEFAULT_SQUASH_WINDOW_MS = 2 * 60_000;
const IGNORED_AUDIT_FIELDS = new Set(['createdAt', 'updatedAt', 'updatedById']);
const AUDIT_LOG_ACTOR_FILTER_FIELDS = ['actorId', 'actorName', 'actorEmail'] as const;
const AUDIT_LOG_ENTITY_FILTER_FIELDS = ['entityId', 'entityLabel', 'eventId', 'majorEventId', 'eventGroupId'] as const;
const AUDIT_LOG_SYNC_RETRY_DELAYS_MS = [25, 100, 500, 1_000, 2_500] as const;
const NON_REVERSIBLE_OPERATIONS = new Set<AuditLogOperation>([
  AuditLogOperation.IMPORT,
  AuditLogOperation.ISSUE,
  AuditLogOperation.MERGE,
  AuditLogOperation.REISSUE,
  AuditLogOperation.SCAN,
  AuditLogOperation.UNDO,
  AuditLogOperation.REVERT,
]);

const FIELD_LABELS: Record<string, string> = {
  academicId: 'Matrícula',
  additionalPaymentInfo: 'Informações adicionais de pagamento',
  allowSubscription: 'Permitir inscrição',
  amountPaid: 'Valor pago',
  attendedAt: 'Data da presença',
  autoSubscribe: 'Inscrição automática',
  buttonLink: 'Link do botão',
  buttonText: 'Texto do botão',
  category: 'Categoria',
  contactInfo: 'Contato',
  contactType: 'Tipo de contato',
  committedById: 'Enviado por',
  createdById: 'Autor',
  createdByMethod: 'Origem',
  deletedAt: 'Exclusão',
  description: 'Descrição',
  desiredCourses: 'Minicursos desejados',
  desiredLectures: 'Palestras desejadas',
  desiredUncategorized: 'Outros eventos desejados',
  displayName: 'Nome público',
  email: 'E-mail',
  emoji: 'Emoji',
  endDate: 'Fim',
  eventGroupId: 'Grupo de eventos',
  eventId: 'Evento',
  externalRef: 'Referência externa',
  identityDocument: 'Documento',
  isActive: 'Ativa',
  isPaymentRequired: 'Exigir pagamento',
  latitude: 'Latitude',
  locationDescription: 'Local',
  longitude: 'Longitude',
  majorEventId: 'Grande evento',
  maxCoursesPerAttendee: 'Máximo de minicursos',
  maxLecturesPerAttendee: 'Máximo de palestras',
  maxUncategorizedPerAttendee: 'Máximo de outros eventos',
  mergedIntoId: 'Unificada em',
  name: 'Nome',
  onlineAttendanceCode: 'Código de presença online',
  onlineAttendanceEndDate: 'Fim da presença online',
  onlineAttendanceStartDate: 'Início da presença online',
  paymentDate: 'Data de pagamento',
  paymentTier: 'Faixa de pagamento',
  permission: 'Permissão',
  personId: 'Pessoa',
  phone: 'Telefone',
  publiclyVisible: 'Visível publicamente',
  publicationState: 'Estado da publicação',
  publishedAt: 'Publicado em',
  scheduledPublishAt: 'Publicação agendada',
  unpublishedAt: 'Despublicado em',
  publicationScheduledBy: 'Agendado por',
  publicationUpdatedBy: 'Publicação atualizada por',
  rankedSubscriptionEnabled: 'Inscrição por voto preferencial',
  receiptRejectionReason: 'Motivo de rejeição',
  receiptValidatedAt: 'Data da validação',
  receiptValidatedBy: 'Validador',
  scope: 'Escopo',
  secondaryEmails: 'E-mails secundários',
  selectedEventIds: 'Eventos selecionados',
  shortDescription: 'Descrição curta',
  shouldCollectAttendance: 'Coletar presença',
  shouldIssueCertificate: 'Emitir certificado',
  shouldIssueCertificateForEachEvent: 'Um certificado por evento',
  shouldIssueCertificateForNonPayingAttendees: 'Certificado para não pagantes',
  shouldIssueCertificateForNonSubscribedAttendees: 'Certificado para não inscritos',
  shouldIssuePartialCertificate: 'Permitir certificado parcial',
  shouldProvideSubscriberListToLecturer: 'Lista de inscritos para ministrante',
  slots: 'Vagas',
  startDate: 'Início',
  subscriptionEndDate: 'Fim das inscrições',
  subscriptionStartDate: 'Início das inscrições',
  subscriptionStatus: 'Status da inscrição',
  targetLabel: 'Alvo',
  type: 'Tipo',
  updatedById: 'Atualizado por',
  userId: 'Usuário',
  validFrom: 'Válida a partir de',
  validUntil: 'Válida até',
  whatsapp: 'WhatsApp',
  youtubeCode: 'YouTube',
};

const EVENT_MUTABLE_FIELDS = [
  'name',
  'creditMinutes',
  'startDate',
  'endDate',
  'type',
  'emoji',
  'description',
  'shortDescription',
  'latitude',
  'longitude',
  'locationDescription',
  'majorEventId',
  'eventGroupId',
  'allowSubscription',
  'subscriptionStartDate',
  'subscriptionEndDate',
  'slots',
  'autoSubscribe',
  'shouldIssueCertificate',
  'shouldIssueCertificateForNonPayingAttendees',
  'shouldIssueCertificateForNonSubscribedAttendees',
  'shouldCollectAttendance',
  'isOnlineAttendanceAllowed',
  'shouldProvideSubscriberListToLecturer',
  'onlineAttendanceCode',
  'onlineAttendanceStartDate',
  'onlineAttendanceEndDate',
  'publiclyVisible',
  'youtubeCode',
  'buttonText',
  'buttonLink',
  'deletedAt',
] as const;

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
    const before = this.normalizeSnapshot(options.before);
    const after = this.normalizeSnapshot(options.after);
    const changes = this.diffRecords(before, after);
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
        before: this.toNullableJsonInput(before),
        after: this.toNullableJsonInput(after),
        changes: this.toJsonInput(changes),
        changedFields: changes.map((change) => change.field),
        firstRecordedAt: now,
        lastRecordedAt: now,
        metadata: options.metadata ? this.toJsonInput(options.metadata) : undefined,
      },
    });
    this.synchronizeAuditLogEntry(entry, prisma);
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

    return entries.map((entry) => this.mapEntry(entry));
  }

  async exploreAuditLogs(
    input: AuditLogExplorerInput,
    actor: AuthenticatedUser | undefined,
  ): Promise<AuditLogExplorerResult> {
    this.assertCanExploreAuditLogs(actor);
    this.assertValidExplorerDateRange(input.dateFrom, input.dateTo);

    const pagination = resolvePagination(input.skip ?? undefined, input.take ?? undefined);
    const skip = pagination.skip;
    const take = Math.min(pagination.take, 100);
    const searchResult = await this.typesenseSearch.searchAuditLogEntries(this.buildAuditLogSearchQuery(input), {
      filterBy: this.buildAuditLogTypesenseFilter(input),
      limit: take,
      offset: skip,
      sortBy: 'lastRecordedAt:desc,createdAt:desc,id:asc',
    });

    if (searchResult.available) {
      const entries = await this.findAuditLogEntriesByIds(searchResult.ids);
      return {
        entries: entries.map((entry) => this.mapExplorerEntry(entry)),
        total: searchResult.found,
        skip,
        take,
        typesenseAvailable: true,
      };
    }

    const where = this.buildAuditLogSqlWhere(input);
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
      entries: entries.map((entry) => this.mapExplorerEntry(entry)),
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

    if (!this.isReversibleOperation(targetEntry.operation)) {
      throw new BadRequestException('Esse tipo de alteração não pode ser desfeito automaticamente.');
    }

    const config = this.getRevertConfig(targetEntry.entityType);
    await this.assertCanRevert(targetEntry, config, actor);

    const entriesToRevert = await this.resolveEntriesToRevert(targetEntry, input.mode);
    const laterConflicts = input.mode === AuditLogRevertMode.ENTRY_ONLY
      ? await this.findLaterChangedFields(targetEntry)
      : [];
    if (laterConflicts.length > 0) {
      throw new ConflictException(
        `Campos alterados depois dessa entrada: ${laterConflicts.map((field) => this.getFieldLabel(field)).join(', ')}. Use "desfazer daqui em diante".`,
      );
    }
    this.assertEntriesCanBeReverted(entriesToRevert);

    const currentRecord = await this.findCurrentEntityRecord(targetEntry.entityType, targetEntry.entityId);
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
      const updated = await this.updateEntityRecord(tx, targetEntry.entityType, targetEntry.entityId, revertData);
      await this.applyRevertInvariants(tx, targetEntry.entityType, updated);
      const changes = this.diffRecords(this.normalizeSnapshot(currentRecord), this.normalizeSnapshot(updated));
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
          before: this.toNullableJsonInput(this.normalizeSnapshot(currentRecord)),
          after: this.toNullableJsonInput(this.normalizeSnapshot(updated)),
          changes: this.toJsonInput(changes),
          changedFields: changes.map((change) => change.field),
          firstRecordedAt: now,
          lastRecordedAt: now,
          revertTargetId: targetEntry.id,
          revertMode: input.mode,
          metadata: this.toJsonInput({
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

    await this.synchronizeRevertedEntity(targetEntry.entityType, targetEntry.entityId, revertResult.updated);

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
      this.synchronizeAuditLogEntry(entry);
    }
    return this.mapEntry(revertLog);
  }

  buildCompositeEntityId(parts: readonly string[]): string {
    return parts.map((part) => encodeURIComponent(part)).join(':');
  }

  private assertCanExploreAuditLogs(actor: AuthenticatedUser | undefined): void {
    if (!this.authorizationPolicy.isSuperAdmin(actor)) {
      throw new ForbiddenException('Somente super-admins podem consultar todos os logs de auditoria.');
    }
  }

  private assertValidExplorerDateRange(dateFrom?: Date | null, dateTo?: Date | null): void {
    if (dateFrom && Number.isNaN(dateFrom.getTime())) {
      throw new BadRequestException('A data inicial do filtro de auditoria é inválida.');
    }
    if (dateTo && Number.isNaN(dateTo.getTime())) {
      throw new BadRequestException('A data final do filtro de auditoria é inválida.');
    }
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException('A data inicial deve ser anterior à data final.');
    }
  }

  private buildAuditLogSearchQuery(input: AuditLogExplorerInput): string {
    return input.query?.trim() ?? '';
  }

  private buildAuditLogTypesenseFilter(input: AuditLogExplorerInput): string {
    const filters: string[] = [];

    if (input.entityType) {
      filters.push(`entityType:=${this.escapeTypesenseFilterValue(input.entityType)}`);
    }
    if (input.operation) {
      filters.push(`operation:=${this.escapeTypesenseFilterValue(input.operation)}`);
    }
    if (input.dateFrom) {
      filters.push(`lastRecordedAt:>=${this.toTypesenseTimestamp(input.dateFrom)}`);
    }
    if (input.dateTo) {
      filters.push(`lastRecordedAt:<=${this.toTypesenseTimestamp(input.dateTo)}`);
    }
    if (input.revertedStatus === AuditLogExplorerRevertedStatus.REVERTED) {
      filters.push('reverted:=true');
    }
    if (input.revertedStatus === AuditLogExplorerRevertedStatus.NOT_REVERTED) {
      filters.push('reverted:=false');
    }
    const actorFilter = this.buildAuditLogTypesenseTextFilter(input.actor, AUDIT_LOG_ACTOR_FILTER_FIELDS);
    if (actorFilter) {
      filters.push(actorFilter);
    }
    const entityFilter = this.buildAuditLogTypesenseTextFilter(input.entity, AUDIT_LOG_ENTITY_FILTER_FIELDS);
    if (entityFilter) {
      filters.push(entityFilter);
    }

    return filters.join(' && ');
  }

  private buildAuditLogSqlWhere(input: AuditLogExplorerInput): Prisma.AuditLogEntryWhereInput {
    const conditions: Prisma.AuditLogEntryWhereInput[] = [];
    const recordedAt: Prisma.DateTimeFilter = {};

    if (input.entityType) {
      conditions.push({ entityType: input.entityType });
    }
    if (input.operation) {
      conditions.push({ operation: input.operation });
    }
    if (input.dateFrom) {
      recordedAt.gte = input.dateFrom;
    }
    if (input.dateTo) {
      recordedAt.lte = input.dateTo;
    }
    if (Object.keys(recordedAt).length > 0) {
      conditions.push({ lastRecordedAt: recordedAt });
    }
    if (input.revertedStatus === AuditLogExplorerRevertedStatus.REVERTED) {
      conditions.push({ revertedAt: { not: null } });
    }
    if (input.revertedStatus === AuditLogExplorerRevertedStatus.NOT_REVERTED) {
      conditions.push({ revertedAt: null });
    }

    const queryCondition = this.buildAuditLogTextCondition(input.query, [
      'entityId',
      'entityLabel',
      'summary',
      'actorId',
      'actorName',
      'actorEmail',
      'permission',
      'eventId',
      'majorEventId',
      'eventGroupId',
      'revertedById',
      'revertedByName',
      'revertedByEntryId',
      'revertTargetId',
    ]);
    if (queryCondition) {
      conditions.push(queryCondition);
    }

    const actorCondition = this.buildAuditLogTextCondition(input.actor, ['actorId', 'actorName', 'actorEmail']);
    if (actorCondition) {
      conditions.push(actorCondition);
    }

    const entityCondition = this.buildAuditLogTextCondition(input.entity, [
      'entityId',
      'entityLabel',
      'eventId',
      'majorEventId',
      'eventGroupId',
    ]);
    if (entityCondition) {
      conditions.push(entityCondition);
    }

    return conditions.length > 0 ? { AND: conditions } : {};
  }

  private buildAuditLogTextCondition(
    value: string | null | undefined,
    fields: readonly (keyof Prisma.AuditLogEntryWhereInput)[],
  ): Prisma.AuditLogEntryWhereInput | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    return {
      OR: fields.map((field) => ({
        [field]: {
          contains: normalized,
          mode: Prisma.QueryMode.insensitive,
        },
      })),
    };
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

  private escapeTypesenseFilterValue(value: string): string {
    return `\`${value.replace(/[`\\]/g, '\\$&')}\``;
  }

  private buildAuditLogTypesenseTextFilter(value: string | null | undefined, fields: readonly string[]): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    const escaped = this.escapeTypesenseFilterValue(normalized);
    return `(${fields.map((field) => `${field}:${escaped}`).join(' || ')})`;
  }

  private toTypesenseTimestamp(date: Date): number {
    return Math.floor(date.getTime() / 1000);
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

    const originalBefore = this.readSnapshot(lastEntry.before) ?? before;
    const squashedChanges = this.diffRecords(originalBefore, after);
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
        after: this.toNullableJsonInput(after),
        changes: this.toJsonInput(squashedChanges),
        changedFields: squashedChanges.map((change) => change.field),
        groupedCount: {
          increment: 1,
        },
        lastRecordedAt: now,
      },
    });
    this.synchronizeAuditLogEntry(updatedEntry, prisma);

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

  private diffRecords(before: Record<string, unknown>, after: Record<string, unknown>): StoredAuditChange[] {
    const changes: StoredAuditChange[] = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of [...keys].sort()) {
      if (IGNORED_AUDIT_FIELDS.has(key)) {
        continue;
      }

      const beforeValue = this.normalizeValueForComparison(before[key]);
      const afterValue = this.normalizeValueForComparison(after[key]);
      if (this.stableStringify(beforeValue) === this.stableStringify(afterValue)) {
        continue;
      }

      if (this.isPlainRecord(beforeValue) && this.isPlainRecord(afterValue)) {
        const childChanges = this.diffRecords(beforeValue, afterValue).map((change) => ({
          ...change,
          field: `${key}.${change.field}`,
          label: `${this.getFieldLabel(key)} · ${change.label}`,
        }));
        changes.push(...childChanges);
        continue;
      }

      changes.push({
        field: key,
        label: this.getFieldLabel(key),
        before: beforeValue,
        after: afterValue,
      });
    }

    return changes;
  }

  private normalizeSnapshot(value: unknown): Record<string, unknown> {
    if (!this.isPlainRecord(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .map(([key, child]) => [key, this.normalizeValueForComparison(child)]),
    );
  }

  private normalizeValueForComparison(value: unknown): unknown {
    if (value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeValueForComparison(item));
    }

    if (this.isPlainRecord(value)) {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, child]) => child !== undefined)
          .map(([key, child]) => [key, this.normalizeValueForComparison(child)]),
      );
    }

    return value ?? null;
  }

  private readSnapshot(value: Prisma.JsonValue | null): Record<string, unknown> | null {
    return this.isPlainRecord(value) ? value : null;
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date));
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    if (this.isPlainRecord(value)) {
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.stableStringify(value[key])}`)
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }

  private toNullableJsonInput(value: Record<string, unknown>): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (Object.keys(value).length === 0) {
      return Prisma.JsonNull;
    }

    return this.toJsonInput(value);
  }

  private toJsonInput(value: unknown): Prisma.InputJsonValue {
    return this.normalizeValueForComparison(value) as Prisma.InputJsonValue;
  }

  private mapEntry(entry: PrismaAuditLogEntry): AuditLogEntry {
    const changes = this.parseChanges(entry.changes);
    return {
      id: entry.id,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityLabel: entry.entityLabel,
      operation: entry.operation,
      summary: entry.summary,
      actorId: entry.actorId,
      actorName: entry.actorName,
      actorEmail: entry.actorEmail,
      actorType: entry.actorType,
      permission: entry.permission,
      eventId: entry.eventId,
      majorEventId: entry.majorEventId,
      eventGroupId: entry.eventGroupId,
      changes: changes.map((change) => ({
        field: change.field,
        label: change.label ?? this.getFieldLabel(change.field),
        beforeValue: this.formatValue(change.before),
        afterValue: this.formatValue(change.after),
      })),
      changedFields: entry.changedFields,
      groupedCount: entry.groupedCount,
      firstRecordedAt: entry.firstRecordedAt,
      lastRecordedAt: entry.lastRecordedAt,
      createdAt: entry.createdAt,
      revertedAt: entry.revertedAt,
      revertedById: entry.revertedById,
      revertedByName: entry.revertedByName,
      revertedByEntryId: entry.revertedByEntryId,
      revertTargetId: entry.revertTargetId,
      revertMode: entry.revertMode,
      canRevert: this.canRevertEntry(entry),
    };
  }

  private mapExplorerEntry(entry: PrismaAuditLogEntry): AuditLogExplorerEntry {
    return {
      ...this.mapEntry(entry),
      beforeJson: this.stringifyAuditJson(entry.before),
      afterJson: this.stringifyAuditJson(entry.after),
      metadataJson: this.stringifyAuditJson(entry.metadata),
    };
  }

  private stringifyAuditJson(value: Prisma.JsonValue | null): string | null {
    if (value === null) {
      return null;
    }

    return JSON.stringify(value, null, 2);
  }

  private synchronizeAuditLogEntry(entry: PrismaAuditLogEntry, prisma: AuditPrismaClient = this.prisma): void {
    if (prisma === this.prisma) {
      void this.typesenseSearch.upsertAuditLogEntry(entry).catch(() => undefined);
      return;
    }

    setImmediate(() => {
      void this.synchronizeCommittedAuditLogEntry(entry.id).catch(() => undefined);
    });
  }

  private async synchronizeCommittedAuditLogEntry(id: string, attempt = 0): Promise<void> {
    const entry = await this.prisma.auditLogEntry.findUnique({
      where: { id },
    });
    if (!entry) {
      this.scheduleCommittedAuditLogEntryRetry(id, attempt);
      return;
    }

    await this.typesenseSearch.upsertAuditLogEntry(entry);
  }

  private scheduleCommittedAuditLogEntryRetry(id: string, attempt: number): void {
    const delayMs = AUDIT_LOG_SYNC_RETRY_DELAYS_MS[attempt];
    if (delayMs === undefined) {
      return;
    }

    setTimeout(() => {
      void this.synchronizeCommittedAuditLogEntry(id, attempt + 1).catch(() => undefined);
    }, delayMs);
  }

  private parseChanges(value: Prisma.JsonValue): StoredAuditChange[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((entry) => {
      if (!this.isPlainRecord(entry) || typeof entry['field'] !== 'string') {
        return [];
      }

      return [
        {
          field: entry['field'],
          label: typeof entry['label'] === 'string' ? entry['label'] : undefined,
          before: entry['before'],
          after: entry['after'],
        },
      ];
    });
  }

  private formatValue(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'boolean') {
      return value ? 'Sim' : 'Não';
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.length === 0 ? '[]' : value.map((item) => this.formatValue(item) ?? 'vazio').join(', ');
    }

    return JSON.stringify(value);
  }

  private getFieldLabel(field: string): string {
    const exact = FIELD_LABELS[field];
    if (exact) {
      return exact;
    }

    const leaf = field.split('.').at(-1) ?? field;
    return FIELD_LABELS[leaf] ?? leaf.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
  }

  private async assertCanReadEntityHistory(
    entityType: AuditLogEntityType,
    entityId: string,
    actor: AuthenticatedUser | undefined,
  ): Promise<void> {
    const config = this.getAccessConfig(entityType);
    const context = await this.resolveAuthorizationContext(entityType, entityId);
    await this.authorizationPolicy.assertPermissions(actor, [config.readPermission], context);
  }

  private async assertCanRevert(
    entry: PrismaAuditLogEntry,
    config: RevertEntityConfig,
    actor: AuthenticatedUser | undefined,
  ): Promise<void> {
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
    return this.getRevertConfig(entityType);
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
      if (!this.isReversibleOperation(entry.operation)) {
        throw new BadRequestException('Esse tipo de alteração não pode ser desfeito automaticamente.');
      }

      if (entry.operation === AuditLogOperation.CREATE) {
        if (config.supportsSoftDelete) {
          data['deletedAt'] = new Date();
        }
        continue;
      }

      const before = this.readSnapshot(entry.before);
      if (!before) {
        continue;
      }

      for (const field of entry.changedFields) {
        const rootField = field.split('.')[0];
        if (!mutableFields.has(rootField)) {
          throw new BadRequestException(`O campo ${this.getFieldLabel(field)} não pode ser desfeito automaticamente.`);
        }
        data[rootField] = before[rootField] ?? null;
      }
    }

    return data;
  }

  private assertEntriesCanBeReverted(entries: PrismaAuditLogEntry[]): void {
    const nonReversibleEntry = entries.find((entry) => !this.isReversibleOperation(entry.operation));
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

  private async findCurrentEntityRecord(entityType: AuditLogEntityType, entityId: string): Promise<Record<string, unknown> | null> {
    switch (entityType) {
      case AuditLogEntityType.PERSON:
        return this.prisma.people.findUnique({ where: { id: entityId }, select: this.getRevertConfig(entityType).select });
      case AuditLogEntityType.EVENT:
        return this.prisma.event.findUnique({ where: { id: entityId }, select: this.getRevertConfig(entityType).select });
      case AuditLogEntityType.MAJOR_EVENT:
        return this.prisma.majorEvent.findUnique({ where: { id: entityId }, select: this.getRevertConfig(entityType).select });
      case AuditLogEntityType.EVENT_GROUP:
        return this.prisma.eventGroup.findUnique({ where: { id: entityId }, select: this.getRevertConfig(entityType).select });
      case AuditLogEntityType.PLACE_PRESET:
        return this.prisma.placePreset.findUnique({ where: { id: entityId }, select: this.getRevertConfig(entityType).select });
      case AuditLogEntityType.PERMISSION_GRANT:
        return this.prisma.eventManagerPermissionGrant.findUnique({
          where: { id: entityId },
          select: this.getRevertConfig(entityType).select,
        });
      default:
        return null;
    }
  }

  private async updateEntityRecord(
    tx: Prisma.TransactionClient,
    entityType: AuditLogEntityType,
    entityId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (entityType) {
      case AuditLogEntityType.PERSON:
        return tx.people.update({ where: { id: entityId }, data, select: this.getRevertConfig(entityType).select });
      case AuditLogEntityType.EVENT:
        return tx.event.update({ where: { id: entityId }, data, select: this.getRevertConfig(entityType).select });
      case AuditLogEntityType.MAJOR_EVENT:
        return tx.majorEvent.update({ where: { id: entityId }, data, select: this.getRevertConfig(entityType).select });
      case AuditLogEntityType.EVENT_GROUP:
        return tx.eventGroup.update({ where: { id: entityId }, data, select: this.getRevertConfig(entityType).select });
      case AuditLogEntityType.PLACE_PRESET:
        return tx.placePreset.update({ where: { id: entityId }, data, select: this.getRevertConfig(entityType).select });
      case AuditLogEntityType.PERMISSION_GRANT:
        return tx.eventManagerPermissionGrant.update({
          where: { id: entityId },
          data,
          select: this.getRevertConfig(entityType).select,
        });
      default:
        throw new BadRequestException('Esse tipo de registro não pode ser desfeito automaticamente.');
    }
  }

  private async synchronizeRevertedEntity(
    entityType: AuditLogEntityType,
    entityId: string,
    updated: Record<string, unknown>,
  ): Promise<void> {
    const isDeleted = updated['deletedAt'] instanceof Date || typeof updated['deletedAt'] === 'string';

    switch (entityType) {
      case AuditLogEntityType.PERSON:
        if (isDeleted) {
          await this.typesenseSearch.deletePerson(entityId);
          return;
        }
        await this.typesenseSearch.upsertPerson(updated as Parameters<TypesenseSearchService['upsertPerson']>[0]);
        return;
      case AuditLogEntityType.EVENT:
        if (isDeleted) {
          await this.typesenseSearch.deleteEvent(entityId);
        } else {
          await this.typesenseSearch.upsertEvent(updated as Parameters<TypesenseSearchService['upsertEvent']>[0]);
        }
        await this.attendanceRealtime.notifyAllConnectedPeople();
        return;
      case AuditLogEntityType.MAJOR_EVENT:
        if (isDeleted) {
          await this.typesenseSearch.deleteMajorEvent(entityId);
          return;
        }
        await this.typesenseSearch.upsertMajorEvent(
          updated as Parameters<TypesenseSearchService['upsertMajorEvent']>[0],
        );
        return;
      case AuditLogEntityType.EVENT_GROUP:
        if (isDeleted) {
          await this.typesenseSearch.deleteEventGroup(entityId);
          return;
        }
        await this.typesenseSearch.upsertEventGroup(
          updated as Parameters<TypesenseSearchService['upsertEventGroup']>[0],
        );
        return;
      case AuditLogEntityType.PLACE_PRESET:
        if (isDeleted) {
          await this.typesenseSearch.deletePlacePreset(entityId);
          return;
        }
        await this.typesenseSearch.upsertPlacePreset(
          updated as Parameters<TypesenseSearchService['upsertPlacePreset']>[0],
        );
        return;
      default:
        return;
    }
  }

  private async applyRevertInvariants(
    tx: Prisma.TransactionClient,
    entityType: AuditLogEntityType,
    updated: Record<string, unknown>,
  ): Promise<void> {
    if (entityType === AuditLogEntityType.EVENT) {
      const eventGroupId = typeof updated['eventGroupId'] === 'string' ? updated['eventGroupId'] : null;
      const majorEventId = typeof updated['majorEventId'] === 'string' ? updated['majorEventId'] : null;
      if (eventGroupId && majorEventId) {
        await tx.eventGroup.updateMany({
          where: {
            id: eventGroupId,
            deletedAt: null,
            shouldIssueCertificateForEachEvent: true,
          },
          data: { shouldIssueCertificateForEachEvent: false },
        });
      }
      return;
    }

    if (entityType !== AuditLogEntityType.EVENT_GROUP || typeof updated['id'] !== 'string') {
      return;
    }

    const shouldIssueCertificate = updated['shouldIssueCertificate'];
    const shouldIssueForNonPaying = updated['shouldIssueCertificateForNonPayingAttendees'];
    const shouldIssueForNonSubscribed = updated['shouldIssueCertificateForNonSubscribedAttendees'];
    if (
      shouldIssueCertificate !== false &&
      shouldIssueForNonPaying !== false &&
      shouldIssueForNonSubscribed !== false
    ) {
      return;
    }

    await tx.event.updateMany({
      where: { eventGroupId: updated['id'], deletedAt: null },
      data: {
        ...(shouldIssueCertificate === false ? { shouldIssueCertificate: false } : {}),
        ...(shouldIssueCertificate === false || shouldIssueForNonPaying === false
          ? { shouldIssueCertificateForNonPayingAttendees: false }
          : {}),
        ...(shouldIssueCertificate === false || shouldIssueForNonSubscribed === false
          ? { shouldIssueCertificateForNonSubscribedAttendees: false }
          : {}),
      },
    });
  }

  private canRevertEntry(entry: PrismaAuditLogEntry): boolean {
    if (entry.revertedAt || !this.isReversibleOperation(entry.operation)) {
      return false;
    }

    try {
      const config = this.getRevertConfig(entry.entityType);
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

  private getRevertConfig(entityType: AuditLogEntityType): RevertEntityConfig {
    switch (entityType) {
      case AuditLogEntityType.PERSON:
        return {
          readPermission: Permission.Person.Read,
          updatePermission: Permission.Person.Update,
          deletePermission: Permission.Person.Delete,
          supportsSoftDelete: true,
          mutableFields: [
            'name',
            'email',
            'secondaryEmails',
            'phone',
            'identityDocument',
            'academicId',
            'userId',
            'mergedIntoId',
            'externalRef',
            'deletedAt',
          ],
          select: {
            id: true,
            name: true,
            email: true,
            secondaryEmails: true,
            phone: true,
            identityDocument: true,
            academicId: true,
            userId: true,
            mergedIntoId: true,
            externalRef: true,
            deletedAt: true,
          },
        };
      case AuditLogEntityType.EVENT:
        return {
          readPermission: Permission.Event.Read,
          updatePermission: Permission.Event.Update,
          deletePermission: Permission.Event.Delete,
          supportsSoftDelete: true,
          mutableFields: EVENT_MUTABLE_FIELDS,
          select: {
            id: true,
            ...Object.fromEntries(EVENT_MUTABLE_FIELDS.map((field) => [field, true])),
          },
        };
      case AuditLogEntityType.MAJOR_EVENT:
        return {
          readPermission: Permission.MajorEvent.Read,
          updatePermission: Permission.MajorEvent.Update,
          deletePermission: Permission.MajorEvent.Delete,
          supportsSoftDelete: true,
          mutableFields: [
            'name',
            'startDate',
            'endDate',
            'description',
            'emoji',
            'subscriptionStartDate',
            'subscriptionEndDate',
            'maxCoursesPerAttendee',
            'maxLecturesPerAttendee',
            'maxUncategorizedPerAttendee',
            'rankedSubscriptionEnabled',
            'buttonText',
            'buttonLink',
            'contactInfo',
            'contactType',
            'isPaymentRequired',
            'shouldIssueCertificateForNonPayingAttendees',
            'shouldIssueCertificateForNonSubscribedAttendees',
            'additionalPaymentInfo',
            'deletedAt',
          ],
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            description: true,
            emoji: true,
            subscriptionStartDate: true,
            subscriptionEndDate: true,
            maxCoursesPerAttendee: true,
            maxLecturesPerAttendee: true,
            maxUncategorizedPerAttendee: true,
            rankedSubscriptionEnabled: true,
            buttonText: true,
            buttonLink: true,
            contactInfo: true,
            contactType: true,
            isPaymentRequired: true,
            shouldIssueCertificateForNonPayingAttendees: true,
            shouldIssueCertificateForNonSubscribedAttendees: true,
            additionalPaymentInfo: true,
            publicationState: true,
            scheduledPublishAt: true,
            publishedAt: true,
            unpublishedAt: true,
            publicationScheduledBy: true,
            publicationUpdatedBy: true,
            deletedAt: true,
          },
        };
      case AuditLogEntityType.EVENT_GROUP:
        return {
          readPermission: Permission.EventGroup.Read,
          updatePermission: Permission.EventGroup.Update,
          deletePermission: Permission.EventGroup.Delete,
          supportsSoftDelete: true,
          mutableFields: [
            'name',
            'emoji',
            'shouldIssueCertificate',
            'shouldIssueCertificateForNonPayingAttendees',
            'shouldIssueCertificateForNonSubscribedAttendees',
            'shouldIssueCertificateForEachEvent',
            'shouldIssuePartialCertificate',
            'deletedAt',
          ],
          select: {
            id: true,
            name: true,
            emoji: true,
            shouldIssueCertificate: true,
            shouldIssueCertificateForNonPayingAttendees: true,
            shouldIssueCertificateForNonSubscribedAttendees: true,
            shouldIssueCertificateForEachEvent: true,
            shouldIssuePartialCertificate: true,
            deletedAt: true,
          },
        };
      case AuditLogEntityType.PLACE_PRESET:
        return {
          readPermission: Permission.PlacePreset.Read,
          updatePermission: Permission.PlacePreset.Update,
          deletePermission: Permission.PlacePreset.Delete,
          supportsSoftDelete: true,
          mutableFields: ['name', 'latitude', 'longitude', 'locationDescription', 'deletedAt'],
          select: {
            id: true,
            name: true,
            latitude: true,
            longitude: true,
            locationDescription: true,
            deletedAt: true,
          },
        };
      case AuditLogEntityType.PERMISSION_GRANT:
        return {
          readPermission: Permission.PermissionGrant.Read,
          updatePermission: Permission.PermissionGrant.Update,
          deletePermission: Permission.PermissionGrant.Delete,
          supportsSoftDelete: true,
          mutableFields: [
            'userId',
            'personId',
            'permission',
            'scope',
            'eventId',
            'majorEventId',
            'eventGroupId',
            'validFrom',
            'validUntil',
            'deletedAt',
          ],
          select: {
            userId: true,
            personId: true,
            permission: true,
            scope: true,
            eventId: true,
            majorEventId: true,
            eventGroupId: true,
            validFrom: true,
            validUntil: true,
            deletedAt: true,
          },
        };
      case AuditLogEntityType.EVENT_SUBSCRIPTION:
      case AuditLogEntityType.EVENT_GROUP_SUBSCRIPTION:
        return { readPermission: Permission.Subscription.Read, supportsSoftDelete: true, mutableFields: [], select: {} };
      case AuditLogEntityType.MAJOR_EVENT_SUBSCRIPTION:
        return { readPermission: Permission.Subscription.Read, supportsSoftDelete: true, mutableFields: [], select: {} };
      case AuditLogEntityType.EVENT_ATTENDANCE:
        return { readPermission: Permission.EventAttendance.Read, supportsSoftDelete: false, mutableFields: [], select: {} };
      case AuditLogEntityType.EVENT_ATTENDANCE_COLLECTOR:
        return {
          readPermission: Permission.EventAttendanceCollector.Read,
          supportsSoftDelete: false,
          mutableFields: [],
          select: {},
        };
      case AuditLogEntityType.EVENT_LECTURER:
        return { readPermission: Permission.EventLecturer.Read, supportsSoftDelete: false, mutableFields: [], select: {} };
      case AuditLogEntityType.CERTIFICATE_CONFIG:
        return { readPermission: Permission.CertificateConfig.Read, supportsSoftDelete: true, mutableFields: [], select: {} };
      case AuditLogEntityType.CERTIFICATE:
        return { readPermission: Permission.Certificate.Read, supportsSoftDelete: true, mutableFields: [], select: {} };
      case AuditLogEntityType.MERGE_CANDIDATE:
        return { readPermission: Permission.MergeCandidate.Read, supportsSoftDelete: true, mutableFields: [], select: {} };
      case AuditLogEntityType.RECEIPT_VALIDATION:
        return { readPermission: Permission.Receipt.Read, supportsSoftDelete: false, mutableFields: [], select: {} };
      default:
        throw new BadRequestException('Tipo de histórico não suportado.');
    }
  }

  private isReversibleOperation(operation: AuditLogOperation): boolean {
    return !NON_REVERSIBLE_OPERATIONS.has(operation);
  }
}
