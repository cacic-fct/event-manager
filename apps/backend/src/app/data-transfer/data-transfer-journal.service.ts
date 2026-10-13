import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogActorType, AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  TRANSFER_RESOURCE_SCHEMAS,
  canonicalTransferJson,
  type ResolvedTransferDocument,
  type TransferBatchSummary,
  type TransferItem,
  type TransferResourceKind,
  type TransferSummary,
  type TransferTarget,
  type TransferUndoResult,
} from '@cacic-fct/shared-data-transfer';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  AuthorizationPolicyService,
  type AuthorizationResourceContext,
} from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { PrismaService } from '../prisma/prisma.service';
import {
  TransferJournalRecorder,
  assertJournalCreationReferencesUnchanged,
  journalCreationReferences,
  journalDelegate,
  journalJson,
  journalRestoreData,
  journalSchemaFingerprint,
  type JournalCreationReferenceSnapshot,
  type JournalMutation,
  type JournalSource,
} from './transfer-journal-recorder';

export interface TransferJournalMetadata {
  type: 'data-transfer-batch';
  version: 1;
  schemaFingerprint: string;
  summary: TransferSummary;
  mutations: JournalMutation[];
  creationReferences?: JournalCreationReferenceSnapshot[];
  document: ResolvedTransferDocument;
  auditEntryIds?: string[];
  requestFingerprint?: string;
  requestPlanHash?: string;
  requestItems?: TransferReplayItem[];
  requestSummary?: TransferSummary;
  synchronizationPending: boolean;
  undone: boolean;
}

export interface TransferReplayMetadata extends TransferJournalMetadata {
  requestFingerprint: string;
  requestPlanHash: string;
  requestItems: TransferReplayItem[];
  requestSummary: TransferSummary;
}

export interface TransferReplayItem {
  kind: TransferResourceKind;
  id: string;
  label?: string;
  action: TransferItem['action'];
  status: TransferItem['status'];
  message: string;
}

const permissionsByKind = {
  event: { read: Permission.Event.Read, update: Permission.Event.Update, remove: Permission.Event.Delete },
  group: {
    read: Permission.EventGroup.Read,
    update: Permission.EventGroup.Update,
    remove: Permission.EventGroup.Delete,
  },
  'major-event': {
    read: Permission.MajorEvent.Read,
    update: Permission.MajorEvent.Update,
    remove: Permission.MajorEvent.Delete,
  },
  'major-event-price': {
    read: Permission.MajorEvent.Read,
    update: Permission.MajorEvent.Update,
    remove: Permission.MajorEvent.Update,
  },
  'price-tier': {
    read: Permission.MajorEvent.Read,
    update: Permission.MajorEvent.Update,
    remove: Permission.MajorEvent.Update,
  },
  'place-preset': {
    read: Permission.PlacePreset.Read,
    update: Permission.PlacePreset.Update,
    remove: Permission.PlacePreset.Delete,
  },
  'event-form': {
    read: Permission.EventForm.Read,
    update: Permission.EventForm.Update,
    remove: Permission.EventForm.Delete,
  },
  'form-link': {
    read: Permission.EventForm.Read,
    update: Permission.EventForm.Update,
    remove: Permission.EventForm.Delete,
  },
  'certificate-config': {
    read: Permission.CertificateConfig.Read,
    update: Permission.CertificateConfig.Update,
    remove: Permission.CertificateConfig.Delete,
  },
  'ticket-config': {
    read: Permission.TicketConfig.Read,
    update: Permission.TicketConfig.Update,
    remove: Permission.TicketConfig.Update,
  },
  'ticket-price-option': {
    read: Permission.TicketConfig.Read,
    update: Permission.TicketConfig.Update,
    remove: Permission.TicketConfig.Update,
  },
  'sports-tournament': {
    read: Permission.SportsTournament.Read,
    update: Permission.SportsTournament.Update,
    remove: Permission.SportsTournament.Delete,
  },
  'sports-category': {
    read: Permission.SportsCategory.Read,
    update: Permission.SportsCategory.Update,
    remove: Permission.SportsCategory.Delete,
  },
  'sports-venue': {
    read: Permission.SportsTournament.Read,
    update: Permission.SportsTournament.Update,
    remove: Permission.SportsTournament.Update,
  },
  'sports-stage': {
    read: Permission.SportsCategory.Read,
    update: Permission.SportsCategory.Update,
    remove: Permission.SportsCategory.Update,
  },
  'sports-match': {
    read: Permission.SportsMatch.Read,
    update: Permission.SportsMatch.Update,
    remove: Permission.SportsMatch.Delete,
  },
  'event-subscription': {
    read: Permission.Subscription.Read,
    update: Permission.Subscription.Update,
    remove: Permission.Subscription.Delete,
  },
  'group-subscription': {
    read: Permission.Subscription.Read,
    update: Permission.Subscription.Update,
    remove: Permission.Subscription.Delete,
  },
  'major-event-subscription': {
    read: Permission.Subscription.Read,
    update: Permission.Subscription.Update,
    remove: Permission.Subscription.Delete,
  },
  'event-attendance': {
    read: Permission.EventAttendance.Read,
    update: Permission.EventAttendance.Update,
    remove: Permission.EventAttendance.Delete,
  },
} as const;

export function readTransferJournal(value: unknown): TransferJournalMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    data['type'] !== 'data-transfer-batch' ||
    data['version'] !== 1 ||
    !Array.isArray(data['mutations']) ||
    typeof data['schemaFingerprint'] !== 'string'
  )
    return null;
  return value as TransferJournalMetadata;
}

@Injectable()
export class DataTransferJournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly frozen: FrozenResourceService,
  ) {}

  begin(tx: Prisma.TransactionClient): TransferJournalRecorder {
    return new TransferJournalRecorder(tx);
  }

  /** Identical retries wait for the original transaction before checking its durable result. */
  async lockRequest(tx: Prisma.TransactionClient, fingerprint: string): Promise<void> {
    const key = BigInt.asIntN(64, BigInt(`0x${fingerprint.slice(0, 16)}`));
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
  }

  async record(
    recorder: TransferJournalRecorder,
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    scope: TransferTarget | undefined,
    document: ResolvedTransferDocument,
    items: TransferItem[],
    requestReplay?: { fingerprint: string; planHash: string },
  ): Promise<{ batchId: string; auditEntryId: string }> {
    const batchId = recorder.batchId;
    const creationReferences = await journalCreationReferences(tx, recorder.mutations);
    const metadata: TransferJournalMetadata = {
      type: 'data-transfer-batch',
      version: 1,
      schemaFingerprint: journalSchemaFingerprint(),
      summary: summarize(items),
      mutations: recorder.mutations,
      creationReferences,
      document,
      auditEntryIds: recorder.auditEntryIds,
      ...(requestReplay
        ? {
            requestFingerprint: requestReplay.fingerprint,
            requestPlanHash: requestReplay.planHash,
            requestItems: items.map(({ kind, id, label, action, status, message }) => ({
              kind,
              id,
              ...(label ? { label } : {}),
              action,
              status,
              message,
            })),
            requestSummary: summarize(items),
          }
        : {}),
      synchronizationPending: true,
      undone: false,
    };
    await tx.auditLogEntry.create({
      data: {
        id: batchId,
        entityType: AuditLogEntityType.SYSTEM,
        entityId: `data-transfer:${batchId}`,
        entityLabel: 'Importação JSON',
        operation: AuditLogOperation.IMPORT,
        summary: 'Importação JSON confirmada; cópia reversível e sincronização registradas no mesmo commit.',
        actorId: actor.sub,
        actorName: actor.preferredUsername ?? actor.sub ?? 'Organizador',
        actorEmail: actor.email,
        actorType: AuditLogActorType.USER,
        permission: Permission.DataTransfer.Import,
        ...(scope?.kind === 'event'
          ? { eventId: scope.id }
          : scope?.kind === 'group'
            ? { eventGroupId: scope.id }
            : scope
              ? { majorEventId: scope.id }
              : {}),
        changes: [],
        changedFields: [],
        metadata: jsonInput(metadata),
      },
    });
    return { batchId, auditEntryId: batchId };
  }

  async findCommittedRequest(
    actor: AuthenticatedUser | undefined,
    requestFingerprint: string,
  ): Promise<{ entry: Prisma.AuditLogEntryGetPayload<Record<never, never>>; metadata: TransferReplayMetadata } | null> {
    if (!actor?.sub || !this.authorization.hasEventManagerAccess(actor)) throw new ForbiddenException();
    if (!/^[a-f0-9]{64}$/.test(requestFingerprint))
      throw new ConflictException('A impressão digital da solicitação é inválida.');
    const entry = await this.prisma.auditLogEntry.findFirst({
      where: {
        entityType: AuditLogEntityType.SYSTEM,
        operation: AuditLogOperation.IMPORT,
        entityId: { startsWith: 'data-transfer:' },
        actorId: actor.sub,
        metadata: { path: ['requestFingerprint'], equals: requestFingerprint },
      },
      orderBy: { createdAt: 'desc' },
    });
    const metadata = readTransferJournal(entry?.metadata);
    if (!entry || !metadata || metadata.requestFingerprint !== requestFingerprint || entry.actorId !== actor.sub) {
      return null;
    }
    if (metadata.undone || entry.revertedAt)
      throw new ConflictException(
        'Esta solicitação já foi desfeita. Envie uma nova solicitação se desejar reaplicá-la.',
      );
    if (
      typeof metadata.requestPlanHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(metadata.requestPlanHash) ||
      !Array.isArray(metadata.requestItems) ||
      !metadata.requestItems.every(isTransferReplayItem) ||
      !isTransferSummary(metadata.requestSummary) ||
      !metadata.document ||
      !Array.isArray(metadata.document.resources)
    ) {
      throw new ConflictException('O resultado da solicitação confirmada não pode ser recuperado com segurança.');
    }
    await this.assertSources(metadata, actor, false, false);
    return { entry, metadata: metadata as TransferReplayMetadata };
  }

  async history(actor: AuthenticatedUser | undefined): Promise<TransferBatchSummary[]> {
    if (!actor?.sub || !this.authorization.hasEventManagerAccess(actor)) throw new ForbiddenException();
    const entries = await this.prisma.auditLogEntry.findMany({
      where: {
        entityType: AuditLogEntityType.SYSTEM,
        operation: AuditLogOperation.IMPORT,
        entityId: { startsWith: 'data-transfer:' },
        ...(this.authorization.isSuperAdmin(actor) ? {} : { actorId: actor.sub }),
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const summaries: TransferBatchSummary[] = [];
    for (const entry of entries) {
      const metadata = readTransferJournal(entry.metadata);
      if (!metadata) continue;
      try {
        await this.assertSources(metadata, actor, false);
      } catch (error) {
        if (error instanceof ForbiddenException || error instanceof NotFoundException) continue;
        throw error;
      }
      summaries.push({
        batchId: entry.id,
        auditEntryId: entry.id,
        createdAt: entry.createdAt.toISOString(),
        summary: metadata.summary,
        undone: metadata.undone,
        synchronizationPending: metadata.synchronizationPending,
      });
    }
    return summaries;
  }

  async undo(batchId: string, actor: AuthenticatedUser | undefined): Promise<TransferUndoResult> {
    if (!actor?.sub || !this.authorization.hasEventManagerAccess(actor) || !/^[0-9a-f-]{36}$/i.test(batchId))
      throw new ForbiddenException();
    return runSerializablePrismaTransaction(
      this.prisma,
      async (tx) => {
        const entry = await tx.auditLogEntry.findUnique({ where: { id: batchId } });
        const metadata = readTransferJournal(entry?.metadata);
        if (
          !entry ||
          !metadata ||
          entry.entityType !== AuditLogEntityType.SYSTEM ||
          entry.entityId !== `data-transfer:${batchId}` ||
          (entry.actorId !== actor.sub && !this.authorization.isSuperAdmin(actor))
        )
          throw new NotFoundException('Lote não encontrado.');
        if (metadata.undone || entry.revertedAt) throw new ConflictException('Este lote já foi desfeito.');
        if (metadata.schemaFingerprint !== journalSchemaFingerprint())
          throw new ConflictException(
            'O schema mudou desde esta importação. A reversão automática foi bloqueada para preservar os dados.',
          );
        await this.assertSources(metadata, actor, true);
        for (const mutation of metadata.mutations) await this.assertMutationPermissions(mutation, actor);
        await assertJournalCreationReferencesUnchanged(tx, metadata.mutations, metadata.creationReferences);
        for (const mutation of [...metadata.mutations].reverse()) {
          const delegate = journalDelegate(tx, mutation.model);
          const rows = await delegate.findMany({ where: mutation.key, take: 2 });
          const current = rows[0] ? journalJson(rows[0]) : null;
          if (rows.length > 1 || canonicalTransferJson(current) !== canonicalTransferJson(mutation.after))
            throw new ConflictException(
              'Um registro deste lote foi alterado depois da importação. Nenhuma alteração foi desfeita.',
            );
          if (mutation.before === null) await delegate.deleteMany({ where: mutation.key });
          else if (mutation.after === null)
            await delegate.create({ data: journalRestoreData(mutation.model, mutation.before, true) });
          else
            await delegate.updateMany({
              where: mutation.key,
              data: journalRestoreData(mutation.model, mutation.before, false),
            });
        }
        await this.advanceRestoredVersions(tx, metadata.mutations, actor);
        const revertedAt = new Date();
        const auditEntryId = randomUUID();
        const updatedMetadata: TransferJournalMetadata = { ...metadata, undone: true, synchronizationPending: true };
        if (metadata.auditEntryIds?.length) {
          const reverted = await tx.auditLogEntry.updateMany({
            where: { id: { in: metadata.auditEntryIds }, revertedAt: null },
            data: {
              revertedAt,
              revertedById: actor.sub,
              revertedByName: actor.preferredUsername ?? actor.sub,
              revertedByEntryId: auditEntryId,
            },
          });
          if (reverted.count !== metadata.auditEntryIds.length)
            throw new ConflictException(
              'A auditoria deste lote foi alterada depois da importação. Nenhuma alteração foi desfeita.',
            );
        }
        const changed = await tx.auditLogEntry.updateMany({
          where: { id: batchId, revertedAt: null },
          data: {
            metadata: jsonInput(updatedMetadata),
            revertedAt,
            revertedById: actor.sub,
            revertedByName: actor.preferredUsername ?? actor.sub,
            revertedByEntryId: auditEntryId,
          },
        });
        if (changed.count !== 1) throw new ConflictException('Este lote mudou durante a reversão.');
        await tx.auditLogEntry.create({
          data: {
            id: auditEntryId,
            entityType: AuditLogEntityType.SYSTEM,
            entityId: entry.entityId,
            entityLabel: 'Reversão de importação JSON',
            operation: AuditLogOperation.REVERT,
            summary: 'Todo o lote foi desfeito após conferir permissões e alterações posteriores.',
            actorId: actor.sub,
            actorName: actor.preferredUsername ?? actor.sub ?? 'Organizador',
            actorType: AuditLogActorType.USER,
            permission: Permission.DataTransfer.Undo,
            eventId: entry.eventId,
            eventGroupId: entry.eventGroupId,
            majorEventId: entry.majorEventId,
            changes: [],
            changedFields: [],
            revertTargetId: batchId,
            metadata: { batchId },
          },
        });
        return { batchId, auditEntryId, undone: true };
      },
      { maxWait: 10000, timeout: 120000 },
    );
  }

  async markSynchronized(batchId: string, expectedUndone: boolean): Promise<void> {
    await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      const entry = await tx.auditLogEntry.findUnique({ where: { id: batchId } });
      const metadata = readTransferJournal(entry?.metadata);
      if (!metadata || metadata.undone !== expectedUndone) return;
      await tx.auditLogEntry.update({
        where: { id: batchId },
        data: { metadata: jsonInput({ ...metadata, synchronizationPending: false }) },
      });
    });
  }

  async synchronizationPending(batchId: string): Promise<boolean> {
    try {
      const entry = await this.prisma.auditLogEntry.findUnique({ where: { id: batchId }, select: { metadata: true } });
      return readTransferJournal(entry?.metadata)?.synchronizationPending ?? true;
    } catch {
      // A committed import stays successful even when its status cannot be refreshed immediately.
      return true;
    }
  }

  private async assertSources(
    metadata: TransferJournalMetadata,
    actor: AuthenticatedUser,
    undo: boolean,
    allowUndoFallback = !undo,
  ): Promise<void> {
    const sources = new Map(
      metadata.mutations.map((mutation) => [`${mutation.source.kind}:${mutation.source.id}`, mutation.source]),
    );
    if (!sources.size) throw new ConflictException('Este lote não contém alterações reversíveis.');
    for (const source of sources.values()) {
      const policy = permissionsByKind[source.kind];
      if (!policy) throw new ConflictException('Tipo de recurso não suportado na reversão.');
      const scope = await this.authoritativeScope(source);
      const requirements = [
        undo ? Permission.DataTransfer.Undo : Permission.DataTransfer.Import,
        policy.read,
        ...(undo ? [source.action === 'create' ? policy.remove : policy.update] : []),
      ];
      if (!undo && allowUndoFallback) {
        // Import and undo are independent grants; undo-only organizers must be able to review their batches.
        try {
          await this.authorization.assertPermissions(actor, requirements, scope);
        } catch (error) {
          if (!(error instanceof ForbiddenException)) throw error;
          await this.authorization.assertPermissions(actor, [Permission.DataTransfer.Undo, policy.read], scope);
        }
      } else {
        await this.authorization.assertPermissions(actor, requirements, scope);
      }
      if (!undo) continue;
      if (scope.eventId)
        await this.frozen.assertEventMutable(scope.eventId, actor, source.action === 'create' ? 'delete' : 'edit');
      if (scope.eventGroupId)
        await this.frozen.assertEventGroupMutable(
          scope.eventGroupId,
          actor,
          source.action === 'create' ? 'delete' : 'edit',
        );
      if (scope.majorEventId)
        await this.frozen.assertMajorEventMutable(
          scope.majorEventId,
          actor,
          source.action === 'create' ? 'delete' : 'edit',
        );
    }
  }

  private async authoritativeScope(source: JournalSource): Promise<AuthorizationResourceContext> {
    if (source.kind === 'event') return { eventId: source.id };
    if (source.kind === 'group') return { eventGroupId: source.id };
    if (source.kind === 'major-event') return { majorEventId: source.id };
    if (source.kind === 'sports-tournament') {
      const row = await this.prisma.sportsTournament.findUnique({
        where: { id: source.id },
        select: { majorEventId: true },
      });
      if (!row) throw new NotFoundException();
      return { sportsTournamentId: source.id, majorEventId: row.majorEventId };
    }
    if (source.kind === 'sports-category' || source.kind === 'sports-stage') {
      const categoryId =
        source.kind === 'sports-category'
          ? source.id
          : (await this.prisma.sportsStage.findUnique({ where: { id: source.id }, select: { categoryId: true } }))
              ?.categoryId;
      if (!categoryId) throw new NotFoundException();
      const row = await this.prisma.sportsCategory.findUnique({
        where: { id: categoryId },
        select: { eventGroupId: true, tournamentId: true, tournament: { select: { majorEventId: true } } },
      });
      if (!row) throw new NotFoundException();
      return {
        sportsCategoryId: categoryId,
        sportsTournamentId: row.tournamentId,
        eventGroupId: row.eventGroupId,
        majorEventId: row.tournament.majorEventId,
      };
    }
    if (source.kind === 'sports-venue') {
      const row = await this.prisma.sportsVenue.findUnique({
        where: { id: source.id },
        select: { tournamentId: true, tournament: { select: { majorEventId: true } } },
      });
      if (!row) throw new NotFoundException();
      return { sportsTournamentId: row.tournamentId, majorEventId: row.tournament.majorEventId };
    }
    if (source.kind === 'sports-match') {
      const row = await this.prisma.sportsMatch.findUnique({
        where: { id: source.id },
        select: {
          eventId: true,
          categoryId: true,
          category: {
            select: { eventGroupId: true, tournamentId: true, tournament: { select: { majorEventId: true } } },
          },
        },
      });
      if (!row) throw new NotFoundException();
      return {
        sportsMatchId: source.id,
        sportsCategoryId: row.categoryId,
        sportsTournamentId: row.category.tournamentId,
        eventId: row.eventId,
        eventGroupId: row.category.eventGroupId,
        majorEventId: row.category.tournament.majorEventId,
      };
    }
    if (source.kind === 'event-form') return { eventFormId: source.id };
    if (source.kind === 'form-link') return { eventFormLinkId: source.id };
    if (source.kind === 'certificate-config') return { certificateConfigId: source.id };
    // Secondary configuration and participation records inherit their server-resolved source context.
    return source.scope;
  }

  private async assertMutationPermissions(mutation: JournalMutation, actor: AuthenticatedUser): Promise<void> {
    const row = mutation.after ?? mutation.before;
    if (!row) return;
    const id = typeof row['id'] === 'string' ? row['id'] : undefined;
    const scope: AuthorizationResourceContext = {
      ...(typeof row['eventId'] === 'string' ? { eventId: row['eventId'] } : {}),
      ...(typeof row['eventGroupId'] === 'string' ? { eventGroupId: row['eventGroupId'] } : {}),
      ...(typeof row['majorEventId'] === 'string' ? { majorEventId: row['majorEventId'] } : {}),
    };
    const creatingUndo = mutation.before === null;
    if (mutation.model === 'event' && id) {
      await this.authorization.assertPermissions(
        actor,
        [Permission.Event.Read, creatingUndo ? Permission.Event.Delete : Permission.Event.Update],
        { eventId: id },
      );
      await this.frozen.assertEventMutable(id, actor, creatingUndo ? 'delete' : 'edit');
    } else if (mutation.model === 'eventGroup' && id) {
      await this.authorization.assertPermissions(
        actor,
        [Permission.EventGroup.Read, creatingUndo ? Permission.EventGroup.Delete : Permission.EventGroup.Update],
        { eventGroupId: id },
      );
      await this.frozen.assertEventGroupMutable(id, actor, creatingUndo ? 'delete' : 'edit');
    } else if (mutation.model === 'sportsMatch' && id) {
      const context = await this.authoritativeScope({ ...mutation.source, kind: 'sports-match', id });
      await this.authorization.assertPermissions(
        actor,
        [Permission.SportsMatch.Read, creatingUndo ? Permission.SportsMatch.Delete : Permission.SportsMatch.Update],
        context,
      );
      if (context.eventId)
        await this.frozen.assertEventMutable(context.eventId, actor, creatingUndo ? 'delete' : 'edit');
    } else if (
      mutation.model === 'sportsTournamentParticipant' ||
      mutation.model === 'sportsRegistration' ||
      mutation.model === 'sportsRegistrationMember'
    ) {
      const context = {
        ...mutation.source.scope,
        ...(typeof row['tournamentId'] === 'string' ? { sportsTournamentId: row['tournamentId'] } : {}),
        ...(typeof row['registrationId'] === 'string'
          ? { sportsRegistrationId: row['registrationId'] }
          : mutation.model === 'sportsRegistration' && id
            ? { sportsRegistrationId: id }
            : {}),
      };
      await this.authorization.assertPermissions(
        actor,
        [
          Permission.SportsRegistration.Read,
          creatingUndo ? Permission.SportsRegistration.Delete : Permission.SportsRegistration.Update,
        ],
        context,
      );
    } else if (
      mutation.model === 'majorEventSubscription' ||
      mutation.model === 'eventSubscription' ||
      mutation.model === 'eventGroupSubscription' ||
      mutation.model === 'majorEventSubscriptionEventSelection'
    ) {
      if (!Object.keys(scope).length) Object.assign(scope, mutation.source.scope);
      await this.authorization.assertPermissions(
        actor,
        [Permission.Subscription.Read, creatingUndo ? Permission.Subscription.Delete : Permission.Subscription.Update],
        scope,
      );
    } else if (mutation.model === 'certificateConfig') {
      await this.authorization.assertPermissions(
        actor,
        [
          Permission.CertificateConfig.Read,
          creatingUndo ? Permission.CertificateConfig.Delete : Permission.CertificateConfig.Update,
        ],
        { ...scope, certificateConfigId: id },
      );
    } else if (mutation.model === 'eventAttendance') {
      await this.authorization.assertPermissions(
        actor,
        [
          Permission.EventAttendance.Read,
          creatingUndo ? Permission.EventAttendance.Delete : Permission.EventAttendance.Update,
        ],
        scope,
      );
    } else if (
      mutation.model === 'eventTicket' ||
      mutation.model === 'eventTicketHistory' ||
      mutation.model === 'ticketNotificationOutbox' ||
      mutation.model === 'ticketEntitlementReconciliation'
    ) {
      if (!Object.keys(scope).length) Object.assign(scope, mutation.source.scope);
      await this.authorization.assertPermissions(
        actor,
        [Permission.Ticket.Read, creatingUndo ? Permission.Ticket.Revoke : Permission.Ticket.Issue],
        scope,
      );
    }
  }

  private async advanceRestoredVersions(
    tx: Prisma.TransactionClient,
    mutations: JournalMutation[],
    actor: AuthenticatedUser,
  ): Promise<void> {
    const rows = new Map(
      mutations.map((mutation) => [`${mutation.model}:${canonicalTransferJson(mutation.key)}`, mutation]),
    );
    for (const mutation of rows.values()) {
      const restored = await journalDelegate(tx, mutation.model).findMany({ where: mutation.key, take: 1 });
      if (!restored[0]) continue;
      const data: Record<string, unknown> = {};
      if ('updatedAt' in restored[0]) data['updatedAt'] = new Date();
      if ('updatedById' in restored[0]) data['updatedById'] = actor.sub;
      if ('revision' in restored[0]) {
        const versions = mutations
          .filter(
            (row) =>
              row.model === mutation.model && canonicalTransferJson(row.key) === canonicalTransferJson(mutation.key),
          )
          .flatMap((row) => [row.before?.['revision'], row.after?.['revision']])
          .filter((value): value is number => typeof value === 'number');
        data['revision'] = Math.max(0, ...versions) + 1;
      }
      if (Object.keys(data).length) await journalDelegate(tx, mutation.model).updateMany({ where: mutation.key, data });
    }
  }
}

function jsonInput(value: object): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
function isTransferReplayItem(value: unknown): value is TransferReplayItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item['kind'] === 'string' &&
    Object.prototype.hasOwnProperty.call(TRANSFER_RESOURCE_SCHEMAS, item['kind']) &&
    typeof item['id'] === 'string' &&
    (item['label'] === undefined || (typeof item['label'] === 'string' && item['label'].length <= 300)) &&
    ['create', 'update', 'unchanged', 'skip'].includes(String(item['action'])) &&
    ['ready', 'blocked', 'applied', 'unchanged'].includes(String(item['status'])) &&
    typeof item['message'] === 'string'
  );
}
function isTransferSummary(value: unknown): value is TransferSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const summary = value as Record<string, unknown>;
  return ['create', 'update', 'unchanged', 'skip'].every(
    (key) => Number.isSafeInteger(summary[key]) && Number(summary[key]) >= 0,
  );
}
function summarize(items: TransferItem[]): TransferSummary {
  return {
    create: items.filter((row) => row.action === 'create' && row.status === 'applied').length,
    update: items.filter((row) => row.action === 'update' && row.status === 'applied').length,
    unchanged: items.filter((row) => row.action === 'unchanged').length,
    skip: items.filter((row) => row.status === 'blocked').length,
  };
}
