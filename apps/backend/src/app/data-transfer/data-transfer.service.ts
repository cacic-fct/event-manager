import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  Optional,
  Inject,
} from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { isValidCPF } from '@cacic-fct/shared-utils';
import {
  TRANSFER_FORMAT,
  TRANSFER_SCHEMA_ID,
  TRANSFER_VERSION,
  TRANSFER_MAX_RESOURCES,
  TransferDocumentSchema,
  TransferValidationError,
  canonicalTransferJson,
  parseTransferDocument,
} from '@cacic-fct/shared-data-transfer';
import type {
  JsonValue,
  ResolvedTransferDocument,
  TransferApplyRequest,
  TransferChange,
  TransferExport,
  TransferExportRequest,
  TransferItem,
  TransferPreview,
  TransferResource,
  TransferResourceKind,
  TransferResult,
  TransferTarget,
  TransferPreviewRequest,
  TransferPersonDecision,
} from '@cacic-fct/shared-data-transfer';
import {
  validatePersonDecisions,
  assertCompatiblePersonChanges,
  plannedPersonMerges,
} from './transfer-person-creation';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { TransferKeyAllocations } from './transfer-key-allocations';
import { TransferValidationException } from './transfer-validation.exception';
import { DataTransferJournalService } from './data-transfer-journal.service';
import { DataTransferRecoveryService } from './data-transfer-recovery.service';
import { DATA_TRANSFER_ADAPTERS } from './data-transfer.constants';
import {
  DataTransferAdapter,
  ResolvedTransferResource,
  TransferAdapterContext,
  TransferAdapterExportResult,
  TransferResourceReference,
  TransferWriteAction,
} from './data-transfer-adapter';

type Row = {
  adapter: DataTransferAdapter | null;
  snapshot: ResolvedTransferResource | null;
  action: TransferItem['action'];
  status: TransferItem['status'];
  item: TransferItem;
  sourceIndex: number;
};

type Plan = {
  document: ResolvedTransferDocument;
  scope?: TransferTarget;
  rows: Row[];
  preview: TransferPreview;
};

const ACCESS_BLOCKED_MESSAGE = 'Este recurso não está disponível para as permissões ou o público-alvo atuais.';
const DOMAIN_BLOCKED_MESSAGE = 'A alteração não atende às regras atuais deste recurso.';
const DEPENDENCY_BLOCKED_MESSAGE = 'Uma dependência deste recurso está bloqueada.';
const MAX_FAILURES_IN_LOG = 5;
const TRANSFER_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 } as const;

const REFERENCE_KIND_BY_FIELD: Readonly<Record<string, TransferResourceKind>> = {
  majorEventId: 'major-event',
  eventGroupId: 'group',
  eventId: 'event',
  ownerEventId: 'event',
  ownerMajorEventId: 'major-event',
  formId: 'event-form',
  priceId: 'major-event-price',
  priceTierId: 'price-tier',
  ticketConfigId: 'ticket-config',
  placePresetId: 'place-preset',
  parentVenueId: 'sports-venue',
  venueId: 'sports-venue',
  tournamentId: 'sports-tournament',
  categoryId: 'sports-category',
  stageId: 'sports-stage',
  registrationFormId: 'event-form',
  priceTierIds: 'price-tier',
  regularAttendancePriceTierIds: 'price-tier',
};

const WRITE_REFERENCE_KIND_BY_FIELD: Readonly<Record<string, TransferResourceKind>> = {
  majorEventId: 'major-event',
  eventGroupId: 'group',
  eventId: 'event',
  ownerEventId: 'event',
  ownerMajorEventId: 'major-event',
  formId: 'event-form',
  priceId: 'major-event-price',
  priceTierId: 'price-tier',
  ticketConfigId: 'ticket-config',
  placePresetId: 'place-preset',
  parentVenueId: 'sports-venue',
  venueId: 'sports-venue',
  tournamentId: 'sports-tournament',
  categoryId: 'sports-category',
  stageId: 'sports-stage',
  registrationFormId: 'event-form',
};

const SCOPE_ROOT_KIND: Readonly<Record<TransferTarget['kind'], TransferResourceKind>> = {
  event: 'event',
  group: 'group',
  'major-event': 'major-event',
};

@Injectable()
export class DataTransferService {
  private readonly logger = new Logger(DataTransferService.name);
  private readonly adaptersByKind = new Map<TransferResourceKind, DataTransferAdapter>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly frozenResources: FrozenResourceService,
    @Inject(DATA_TRANSFER_ADAPTERS) adapters: readonly DataTransferAdapter[],
    private readonly keyAllocations: TransferKeyAllocations,
    @Optional() private readonly journal?: DataTransferJournalService,
    @Optional() private readonly recovery?: DataTransferRecoveryService,
  ) {
    for (const adapter of adapters) {
      for (const kind of adapter.kinds) {
        if (this.adaptersByKind.has(kind)) {
          throw new Error(`Duplicate data-transfer adapter registered for resource kind ${kind}.`);
        }
        this.adaptersByKind.set(kind, adapter);
      }
    }
  }

  async getSchema(user: AuthenticatedUser | undefined) {
    const granted = await this.authorization.grantedPermissionSet(user);
    if (!granted.has(Permission.DataTransfer.Export) && !granted.has(Permission.DataTransfer.Import)) {
      throw new ForbiddenException(ACCESS_BLOCKED_MESSAGE);
    }
    return TransferDocumentSchema;
  }

  async export(input: TransferExportRequest, user: AuthenticatedUser | undefined): Promise<TransferExport> {
    this.assertExportRequest(input);
    await this.assertExportRoot(input.target, user);

    const result = await runSerializablePrismaTransaction(
      this.prisma,
      async (tx) => {
        const context = this.adapterContext(tx, user, this.emptyDocument(), input.target);
        const outputs: TransferAdapterExportResult[] = [];
        let resources: TransferResource[] = [];
        for (const adapter of this.adapters()) {
          const output = await adapter.exportTarget(
            input.target,
            {
              includeDescendants: input.includeDescendants,
              includeConfiguration: input.includeConfiguration,
              includeSubscriptions: input.includeSubscriptions ?? false,
              includeAttendances: input.includeAttendances ?? false,
              includeTickets: input.includeTickets ?? false,
              includePublishingState: input.includePublishingState ?? false,
              includeAudienceInvitations: input.includeAudienceInvitations ?? false,
              includeChildSubscriptions: input.includeChildSubscriptions ?? false,
              includeChildAttendances: input.includeChildAttendances ?? false,
            },
            context,
          );
          outputs.push(output);
          resources = deduplicateExportResources([...resources, ...output.resources]);
        }

        const issues = outputs.flatMap((output) => output.issues);
        if (resources.length === 0) {
          throw new NotFoundException(ACCESS_BLOCKED_MESSAGE);
        }
        const document = this.parseDocument({
          $schema: TRANSFER_SCHEMA_ID,
          format: TRANSFER_FORMAT,
          version: TRANSFER_VERSION,
          resources,
        });
        return { document, issues };
      },
      TRANSFER_TRANSACTION_OPTIONS,
    );

    return result;
  }

  async preview(input: TransferPreviewRequest, user: AuthenticatedUser | undefined): Promise<TransferPreview> {
    await this.assertGate(Permission.DataTransfer.Import, user);
    const rawDocument = this.parseDocument(input.document);
    const personDecisions = validatePersonDecisions(input.personDecisions);
    this.assertScope(input.scope);
    if (input.scope) {
      await this.assertScopeReadable(input.scope, user);
    }
    const allocationResult = this.keyAllocations.preview(rawDocument, this.requireActorId(user));
    const allocatedIds = allocatedIdsFor(rawDocument, allocationResult.document);
    const preview = await runSerializablePrismaTransaction(
      this.prisma,
      async (tx) => {
        return (await this.buildPlan(allocationResult.document, input.scope, user, tx, allocatedIds, personDecisions))
          .preview;
      },
      TRANSFER_TRANSACTION_OPTIONS,
    );
    if (!allocationResult.allocation || !preview.canApply) return preview;
    allocationResult.retain?.();
    const resolvedIds = new Map(preview.items.flatMap((item) => (item.key ? [[item.key, item.id] as const] : [])));
    return {
      ...preview,
      allocation: {
        ...allocationResult.allocation,
        // Natural participation keys can match an existing record or a compound attendance identity.
        ids: Object.fromEntries(
          Object.entries(allocationResult.allocation.ids).map(([key, id]) => [key, resolvedIds.get(key) ?? id]),
        ),
      },
    };
  }

  async apply(input: TransferApplyRequest, user: AuthenticatedUser | undefined): Promise<TransferResult> {
    await this.assertGate(Permission.DataTransfer.Import, user);
    if (!this.journal)
      throw new ServiceUnavailableException(
        'O registro reversível de importações não está disponível. Nenhuma alteração foi aplicada.',
      );
    const journal = this.journal;
    const rawDocument = this.parseDocument(input.document);
    const personDecisions = validatePersonDecisions(input.personDecisions);
    this.assertScope(input.scope);
    if (input.scope) {
      await this.assertScopeReadable(input.scope, user);
    }
    if (typeof input.planHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.planHash)) {
      throw new BadRequestException('A prévia de importação é inválida. Gere uma nova prévia.');
    }
    if (typeof input.allowPartial !== 'boolean') {
      throw new BadRequestException('Informe se as linhas válidas podem ser aplicadas parcialmente.');
    }
    if (
      input.allocationToken !== undefined &&
      (typeof input.allocationToken !== 'string' || !/^[a-f0-9]{64}$/.test(input.allocationToken))
    ) {
      throw new BadRequestException('A alocação de IDs é inválida. Gere uma nova prévia.');
    }
    const actorId = this.requireActorId(user);
    const requestFingerprint = fingerprintApplyRequest({
      actorId,
      rawDocument,
      scope: input.scope ?? null,
      planHash: input.planHash,
      allowPartial: input.allowPartial,
      allocationToken: input.allocationToken ?? null,
      personDecisions,
    });
    const committedRequest = await journal.findCommittedRequest(user, requestFingerprint);
    if (committedRequest) return this.replayCommittedRequest(committedRequest, input);

    const committed = await runSerializablePrismaTransaction(
      this.prisma,
      async (tx) => {
        await journal.lockRequest?.(tx, requestFingerprint);
        const replay = await journal.findCommittedRequest(user, requestFingerprint);
        if (replay) return { replay, replayed: true as const };
        const document = this.keyAllocations.apply(rawDocument, actorId, input.allocationToken);
        const allocatedIds = allocatedIdsFor(rawDocument, document);
        const plan = await this.buildPlan(document, input.scope, user, tx, allocatedIds, personDecisions);
        if (!timingSafeEqualHex(plan.preview.planHash, input.planHash)) {
          throw new ConflictException('Os dados ou permissões mudaram desde a prévia. Gere uma nova prévia.');
        }
        if (plan.preview.personPrompts?.length)
          throw new ConflictException(
            'Confirme a criação, a mesclagem ou ignore todas as pessoas pendentes antes de aplicar.',
          );
        if (!input.allowPartial && plan.preview.summary.skip > 0) {
          throw new ConflictException('Há linhas bloqueadas. Revise a prévia ou confirme a aplicação parcial.');
        }
        if (!plan.rows.some((row) => row.status === 'ready' && (row.action === 'create' || row.action === 'update'))) {
          throw new ConflictException(
            'Não há alterações prontas para aplicar. Gere uma nova prévia após editar o arquivo.',
          );
        }

        const sortedRows = sortRowsForApply(plan.rows);
        const effects: Array<() => Promise<void>> = [];
        const recorder = journal.begin(tx);
        const executableSnapshots = sortedRows.flatMap((row) =>
          row.status === 'ready' && row.snapshot ? [row.snapshot] : [],
        );
        const mergedPeople = plannedPersonMerges(executableSnapshots);
        const createdPeople = new Set<string>();
        // The full plan, identities, permissions and dependencies were checked before the first write.
        for (const row of sortedRows) {
          const creation = row.status === 'ready' ? row.snapshot?.personCreation : undefined;
          if (!creation || createdPeople.has(creation.id) || !row.snapshot) continue;
          recorder.setSource(row.snapshot.resource, row.action as TransferWriteAction, row.snapshot.scope);
          await recorder.tx.people.create({
            data: {
              id: creation.id,
              ...creation.data,
              secondaryEmails: [],
              isCPF: creation.data.identityDocument ? isValidCPF(creation.data.identityDocument) : null,
              createdById: actorId,
              updatedById: actorId,
            },
          });
          createdPeople.add(creation.id);
        }
        for (const row of sortedRows) {
          const merge = row.snapshot?.personMerge;
          const planned = merge ? mergedPeople.get(merge.id) : undefined;
          if (row.status !== 'ready' || !planned || !row.snapshot) continue;
          recorder.setSource(row.snapshot.resource, row.action as TransferWriteAction, row.snapshot.scope);
          await recorder.tx.people.update({
            where: { id: planned.id },
            data: {
              ...planned.data,
              ...(planned.data.identityDocument ? { isCPF: isValidCPF(planned.data.identityDocument) } : {}),
              updatedById: actorId,
            },
          });
          mergedPeople.delete(planned.id);
        }
        for (const row of sortedRows) {
          if (row.status !== 'ready' || (row.action !== 'create' && row.action !== 'update')) {
            continue;
          }
          if (!row.adapter || !row.snapshot) {
            throw new ConflictException('A prévia contém um recurso sem adaptador. Gere uma nova prévia.');
          }
          if (row.snapshot.ownedBy) continue;
          recorder.setSource(row.snapshot.resource, row.action, row.snapshot.scope);
          const result = await row.adapter.apply(row.snapshot, row.action, {
            ...this.adapterContext(recorder.tx, user, document, input.scope),
            priorMutations: recorder.mutations,
          });
          effects.push(...(result.postCommitEffects ?? []));
          row.item = { ...row.item, status: 'applied', message: row.action === 'create' ? 'Criado.' : 'Atualizado.' };
        }

        for (const row of plan.rows) {
          const owner = row.snapshot?.ownedBy;
          if (!owner || row.status !== 'ready') continue;
          const appliedOwner = plan.rows.find(
            (candidate) => candidate.item.kind === owner.kind && candidate.item.id === owner.id,
          );
          if (appliedOwner?.item.status === 'applied')
            row.item = { ...row.item, status: 'applied', message: 'Aplicado pelo recurso proprietário.' };
        }

        const items = plan.rows.map((row) => row.item);
        const executableResources = plan.rows.flatMap((row) =>
          row.status === 'ready' && row.snapshot ? [row.snapshot.resource] : [],
        );
        for (const row of plan.rows) {
          if (row.item.status !== 'applied' || !row.snapshot) continue;
          await row.adapter?.validatePlan?.(
            row.snapshot,
            this.adapterContext(tx, user, document, input.scope),
            executableResources,
          );
        }
        const appliedResources: TransferResource[] = [];
        for (const row of plan.rows) {
          if (row.item.status !== 'applied' || !row.snapshot || !row.adapter) continue;
          const resource = row.adapter.readAppliedResource
            ? await row.adapter.readAppliedResource(row.snapshot, this.adapterContext(tx, user, document, input.scope))
            : normalizedAppliedResource(row.snapshot);
          appliedResources.push(normalizeAppliedResource(resource));
        }
        const auditedDocument: ResolvedTransferDocument = {
          ...document,
          resources: appliedResources,
        };
        const audit = await journal.record(
          recorder,
          tx,
          this.adapterContext(tx, user, document, input.scope).actor,
          input.scope,
          auditedDocument,
          items,
          { fingerprint: requestFingerprint, planHash: plan.preview.planHash },
        );
        return {
          result: {
            items,
            summary: summarize(items),
            planHash: plan.preview.planHash,
            canApply: false,
            applied: true,
            document: auditedDocument,
            ...audit,
            synchronizationPending: true,
          } satisfies TransferResult,
          effects,
          replayed: false as const,
        };
      },
      TRANSFER_TRANSACTION_OPTIONS,
    );

    if (committed.replayed) return this.replayCommittedRequest(committed.replay, input);

    this.keyAllocations.consume(input.allocationToken);

    const failures: unknown[] = [];
    for (const effect of committed.effects) {
      try {
        await effect();
      } catch (error: unknown) {
        failures.push(error);
      }
    }
    for (const failure of failures.slice(0, MAX_FAILURES_IN_LOG)) {
      this.logger.error('A data transfer committed, but a post-commit synchronization failed.', formatFailure(failure));
    }
    // The durable audit outbox also runs after restart; callbacks alone are never the recovery record.
    await this.recovery?.recoverPending();
    if (this.recovery)
      return {
        ...committed.result,
        synchronizationPending: await journal.synchronizationPending(committed.result.batchId),
      };
    return committed.result;
  }

  private async replayCommittedRequest(
    committedRequest: NonNullable<Awaited<ReturnType<DataTransferJournalService['findCommittedRequest']>>>,
    input: TransferApplyRequest,
  ): Promise<TransferResult> {
    if (committedRequest.metadata.requestPlanHash !== input.planHash) {
      throw new ConflictException('A prévia da solicitação confirmada não corresponde ao resultado arquivado.');
    }
    const replayDocument = this.normalizedReplayDocument(committedRequest.metadata.document);
    this.keyAllocations.consume(input.allocationToken);
    await this.recovery?.recoverPending();
    return {
      items: committedRequest.metadata.requestItems.map(({ kind, id, label, action, status, message }) => ({
        kind,
        id,
        ...(label ? { label } : {}),
        action,
        status,
        message,
        changes: [],
      })),
      summary: committedRequest.metadata.requestSummary,
      planHash: committedRequest.metadata.requestPlanHash,
      canApply: false,
      applied: true,
      document: replayDocument,
      batchId: committedRequest.entry.id,
      auditEntryId: committedRequest.entry.id,
      synchronizationPending: (await this.journal?.synchronizationPending(committedRequest.entry.id)) ?? true,
    };
  }

  async history(user: AuthenticatedUser | undefined) {
    if (!this.journal) throw new ServiceUnavailableException('O histórico de importações não está disponível.');
    return this.journal.history(user);
  }

  async undo(batchId: string, user: AuthenticatedUser | undefined) {
    if (!this.journal) throw new ServiceUnavailableException('O registro reversível não está disponível.');
    const result = await this.journal.undo(batchId, user);
    await this.recovery?.recoverPending();
    return result;
  }

  private async buildPlan(
    document: ResolvedTransferDocument,
    scope: TransferTarget | undefined,
    user: AuthenticatedUser | undefined,
    tx: Prisma.TransactionClient,
    allocatedIds: ReadonlySet<string> = new Set(),
    personDecisions: readonly TransferPersonDecision[] = [],
  ): Promise<Plan> {
    const context = { ...this.adapterContext(tx, user, document, scope), personDecisions };
    const rows: Row[] = [];

    for (const [sourceIndex, resource] of document.resources.entries()) {
      const adapter = await this.findAdapter(resource, context);
      if (!adapter) {
        rows.push(
          this.blockedRow(resource, sourceIndex, 'Este tipo de recurso ainda não está disponível para importação.'),
        );
        continue;
      }

      let snapshot: ResolvedTransferResource;
      try {
        snapshot = await adapter.resolve(resource, context);
        this.assertResolvedSnapshot(resource, snapshot);
        if (allocatedIds.has(resource.id) && snapshot.current !== null && !snapshot.resolvedId) {
          rows.push(
            this.blockedRow(
              resource,
              sourceIndex,
              'O ID gerado para um novo recurso já está em uso. Gere uma nova prévia.',
              adapter,
              snapshot,
            ),
          );
          continue;
        }
        if (!isWithinRequestedScope(snapshot.scope, snapshot.resource, scope, snapshot.current)) {
          rows.push(this.blockedRow(resource, sourceIndex, ACCESS_BLOCKED_MESSAGE, adapter, snapshot));
          continue;
        }
        await adapter.assertRead(snapshot, context);
        if (snapshot.skip && !snapshot.ownedBy) {
          rows.push(this.blockedRow(resource, sourceIndex, snapshot.skip.message, adapter, snapshot));
          continue;
        }
        const action: TransferWriteAction = snapshot.current === null ? 'create' : 'update';
        const changes = diffResourceData(snapshot.current, snapshot.resource);
        const ownedAlias = snapshot.ownedBy !== undefined;
        if (
          !ownedAlias &&
          (changes.length > 0 || action === 'create' || (snapshot.additionalChanges?.length ?? 0) > 0)
        ) {
          await adapter.assertWrite(snapshot, action, context);
          await adapter.assertMutable(snapshot, 'edit', context);
          await adapter.validate(snapshot, context);
        }
        const effectiveChanges = [...changes, ...(snapshot.additionalChanges ?? [])];
        rows.push({
          adapter,
          snapshot,
          action: effectiveChanges.length === 0 && action === 'update' ? 'unchanged' : action,
          status: 'ready',
          sourceIndex,
          item: {
            kind: resource.kind,
            id: snapshot.resolvedId ?? resource.id,
            ...(resource.key ? { key: resource.key } : {}),
            ...transferItemLabel(snapshot),
            action: effectiveChanges.length === 0 && action === 'update' ? 'unchanged' : action,
            status: effectiveChanges.length === 0 && action === 'update' ? 'unchanged' : 'ready',
            message: ownedAlias
              ? (snapshot.skip?.message ?? 'Este recurso auxiliar será aplicado pelo recurso proprietário.')
              : effectiveChanges.length === 0 && action === 'update'
                ? 'Sem alterações.'
                : action === 'create'
                  ? 'Pronto para criar.'
                  : 'Pronto para atualizar.',
            changes: effectiveChanges,
          },
        });
      } catch (error: unknown) {
        if (isNotFoundOrForbidden(error)) {
          rows.push(this.blockedRow(resource, sourceIndex, ACCESS_BLOCKED_MESSAGE, adapter));
          continue;
        }
        if (isDomainRuleError(error)) {
          rows.push(this.blockedRow(resource, sourceIndex, safeDomainMessage(error), adapter));
          continue;
        }
        this.logger.error(`Failed to plan transfer resource ${resource.kind}.`, formatFailure(error));
        rows.push(this.blockedRow(resource, sourceIndex, DOMAIN_BLOCKED_MESSAGE, adapter));
      }
    }

    this.assertNoDuplicateResolvedTargets(rows);
    this.applyOwnerAndDependencyState(rows);
    await this.validateExecutablePlan(rows, context);

    assertCompatiblePersonChanges(
      rows.flatMap((row) => (row.status === 'ready' && row.snapshot ? [row.snapshot] : [])),
    );
    const personPrompts = [
      ...new Map(
        rows.flatMap((row) =>
          row.snapshot?.personPrompt ? [[row.snapshot.personPrompt.key, row.snapshot.personPrompt] as const] : [],
        ),
      ).values(),
    ];
    const items = rows.map((row) => row.item);
    const revisions = rows.map((row) => ({
      kind: row.item.kind,
      id: row.item.id,
      revision: row.snapshot?.revision ?? null,
      identityKey: row.snapshot?.identityKey ?? null,
      action: row.action,
      status: row.status,
      changes: row.item.changes,
      dependencies: row.snapshot?.dependencies ?? [],
      writeDependencies: row.snapshot?.writeDependencies ?? [],
      relatedRevisions: row.snapshot?.relatedRevisions ?? [],
      ownedBy: row.snapshot?.ownedBy ?? null,
      personCreation: row.snapshot?.personCreation ?? null,
      personMerge: row.snapshot?.personMerge ?? null,
      personPrompt: row.snapshot?.personPrompt ?? null,
    }));
    const planHash = createHash('sha256')
      .update(canonicalTransferJson({ document, scope: scope ?? null, rows: revisions, personDecisions }))
      .digest('hex');
    const preview: TransferPreview = {
      items,
      summary: summarize(items),
      planHash,
      canApply:
        personPrompts.length === 0 &&
        rows.some((row) => row.status === 'ready' && (row.action === 'create' || row.action === 'update')),
      ...(personPrompts.length ? { personPrompts } : {}),
    };
    return { document, scope, rows, preview };
  }

  private async validateExecutablePlan(rows: Row[], context: TransferAdapterContext): Promise<void> {
    let changed: boolean;
    do {
      changed = false;
      const resources = rows.flatMap((row) => (row.status === 'ready' && row.snapshot ? [row.snapshot.resource] : []));
      for (const row of rows) {
        if (row.status !== 'ready' || !row.snapshot || !row.adapter?.validatePlan) continue;
        try {
          await row.adapter.validatePlan(row.snapshot, context, resources);
        } catch (error: unknown) {
          if (!isDomainRuleError(error)) throw error;
          row.status = 'blocked';
          row.action = 'skip';
          row.item = { ...row.item, status: 'blocked', action: 'skip', changes: [], message: safeDomainMessage(error) };
          changed = true;
        }
      }
      if (changed) this.applyOwnerAndDependencyState(rows);
    } while (changed);
  }

  private applyOwnerAndDependencyState(rows: Row[]): void {
    const rowsByKey = new Map(rows.map((row) => [resourceKey(row.item.kind, row.item.id), row]));

    let changed: boolean;
    do {
      changed = false;
      for (const row of rows) {
        const ownedBy = row.snapshot?.ownedBy;
        if (!ownedBy) continue;
        const owner = rowsByKey.get(resourceKey(ownedBy.kind, ownedBy.id));
        if (!owner || owner.status === 'blocked' || (owner.status === 'unchanged' && owner.action === 'skip')) {
          changed = this.markDependencyBlocked(row) || changed;
        }
      }

      for (const row of rows) {
        if (row.status !== 'ready' || !row.snapshot) continue;
        const dependencies = [...row.snapshot.dependencies, ...inferDependencies(row.snapshot.resource)];
        for (const dependency of dependencies) {
          const dependedOn = rowsByKey.get(resourceKey(dependency.kind, dependency.id));
          if (!dependedOn || dependedOn.status !== 'blocked') continue;
          // An owned alias row is materialized by its aggregate owner and must
          // not block that owner's write.
          if (dependedOn.snapshot?.ownedBy?.kind === row.item.kind && dependedOn.snapshot.ownedBy.id === row.item.id)
            continue;
          changed = this.markDependencyBlocked(row) || changed;
          break;
        }
      }
    } while (changed);
  }

  private markDependencyBlocked(row: Row): boolean {
    if (
      row.status === 'blocked' &&
      row.action === 'skip' &&
      row.item.message === DEPENDENCY_BLOCKED_MESSAGE &&
      row.item.changes.length === 0
    ) {
      return false;
    }
    row.status = 'blocked';
    row.action = 'skip';
    row.item = {
      ...row.item,
      status: 'blocked',
      action: 'skip',
      message: DEPENDENCY_BLOCKED_MESSAGE,
      changes: [],
    };
    return true;
  }

  private assertNoDuplicateResolvedTargets(rows: readonly Row[]): void {
    const byIdentity = new Map<string, Row>();
    for (const row of rows) {
      const identityKey = row.snapshot?.identityKey;
      if (!identityKey || row.status === 'blocked') {
        continue;
      }
      const key = `${row.item.kind}:${identityKey}`;
      if (byIdentity.has(key)) {
        throw new BadRequestException('O arquivo contém recursos que apontam para o mesmo registro de destino.');
      }
      byIdentity.set(key, row);
    }
  }

  private async findAdapter(
    resource: TransferResource,
    context: TransferAdapterContext,
  ): Promise<DataTransferAdapter | null> {
    const claimingAdapters: DataTransferAdapter[] = [];
    for (const adapter of this.adapters()) {
      if (adapter.claims && (await adapter.claims(resource, context))) {
        claimingAdapters.push(adapter);
      }
    }
    if (claimingAdapters.length > 1) {
      throw new ServiceUnavailableException('A configuração de adaptadores de transferência está ambígua.');
    }
    return claimingAdapters[0] ?? this.adaptersByKind.get(resource.kind) ?? null;
  }

  private adapters(): DataTransferAdapter[] {
    const unique = new Set<DataTransferAdapter>();
    for (const adapter of this.adaptersByKind.values()) {
      unique.add(adapter);
    }
    return [...unique].sort((left, right) => left.dependencyOrder - right.dependencyOrder);
  }

  private adapterContext(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser | undefined,
    document: ResolvedTransferDocument,
    requestedScope?: TransferTarget,
  ): TransferAdapterContext {
    if (!user) {
      throw new ForbiddenException(ACCESS_BLOCKED_MESSAGE);
    }
    return { tx, actor: user, document, requestedScope, frozenResources: this.frozenResources };
  }

  private async assertGate(permission: Permission, user: AuthenticatedUser | undefined): Promise<void> {
    await this.authorization.assertPermissions(user, [permission], { allowScopedCollection: true });
  }

  private async assertExportRoot(target: TransferTarget, user: AuthenticatedUser | undefined): Promise<void> {
    await this.authorization.assertPermissions(
      user,
      [Permission.DataTransfer.Export, rootReadPermission(target.kind)],
      { ...targetResourceContext(target), allowScopedCollection: true },
    );
    const where = { id: target.id, deletedAt: null };
    const exists =
      target.kind === 'event'
        ? await this.prisma.event.findFirst({ where, select: { id: true } })
        : target.kind === 'group'
          ? await this.prisma.eventGroup.findFirst({ where, select: { id: true } })
          : await this.prisma.majorEvent.findFirst({ where, select: { id: true } });
    if (!exists) {
      throw new NotFoundException(ACCESS_BLOCKED_MESSAGE);
    }
  }

  private async assertScopeReadable(scope: TransferTarget, user: AuthenticatedUser | undefined): Promise<void> {
    await this.authorization.assertPermissions(user, [rootReadPermission(scope.kind)], targetResourceContext(scope));
    const where = { id: scope.id, deletedAt: null };
    const exists =
      scope.kind === 'event'
        ? await this.prisma.event.findFirst({ where, select: { id: true } })
        : scope.kind === 'group'
          ? await this.prisma.eventGroup.findFirst({ where, select: { id: true } })
          : await this.prisma.majorEvent.findFirst({ where, select: { id: true } });
    if (!exists) {
      throw new NotFoundException(ACCESS_BLOCKED_MESSAGE);
    }
  }

  private parseDocument(input: unknown): ReturnType<typeof parseTransferDocument> {
    try {
      return parseTransferDocument(input);
    } catch (error: unknown) {
      if (error instanceof TransferValidationError) {
        throw new BadRequestException({
          message: 'O arquivo não corresponde ao schema de transferência atual.',
          issues: error.issues,
        });
      }
      throw error;
    }
  }

  private normalizedReplayDocument(document: ResolvedTransferDocument): ResolvedTransferDocument {
    const parsed = this.parseDocument(document);
    const resources = parsed.resources.map((resource) => {
      if (!resource.id) {
        throw new ConflictException('O resultado confirmado contém um recurso sem ID normalizado.');
      }
      return normalizeReplayResource(resource as TransferResource);
    });
    return { ...parsed, resources } as ResolvedTransferDocument;
  }

  private assertExportRequest(input: TransferExportRequest): void {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !isTransferTarget(input.target)) {
      throw new BadRequestException('Selecione um evento, grupo de eventos ou grande evento válido.');
    }
    const allowed = new Set([
      'target',
      'includeDescendants',
      'includeConfiguration',
      'includeSubscriptions',
      'includeAttendances',
      'includeTickets',
      'includePublishingState',
      'includeAudienceInvitations',
      'includeChildSubscriptions',
      'includeChildAttendances',
    ]);
    if (Object.keys(input as object).some((key) => !allowed.has(key))) {
      throw new BadRequestException('A solicitação de exportação contém campos desconhecidos.');
    }
    if (typeof input.includeDescendants !== 'boolean' || typeof input.includeConfiguration !== 'boolean') {
      throw new BadRequestException('As opções de exportação são inválidas.');
    }
    if (
      (input.includeSubscriptions !== undefined && typeof input.includeSubscriptions !== 'boolean') ||
      (input.includeTickets !== undefined && typeof input.includeTickets !== 'boolean') ||
      (input.includePublishingState !== undefined && typeof input.includePublishingState !== 'boolean') ||
      (input.includeAudienceInvitations !== undefined && typeof input.includeAudienceInvitations !== 'boolean') ||
      (input.includeAttendances !== undefined && typeof input.includeAttendances !== 'boolean') ||
      (input.includeChildSubscriptions !== undefined && typeof input.includeChildSubscriptions !== 'boolean') ||
      (input.includeChildAttendances !== undefined && typeof input.includeChildAttendances !== 'boolean')
    ) {
      throw new BadRequestException('As opções de participação são inválidas.');
    }
  }

  private assertScope(scope: TransferTarget | undefined): void {
    if (scope !== undefined && !isTransferTarget(scope)) {
      throw new BadRequestException('O escopo da importação é inválido.');
    }
  }

  private blockedRow(
    resource: TransferResource,
    sourceIndex: number,
    message: string,
    adapter: DataTransferAdapter | null = null,
    snapshot: ResolvedTransferResource | null = null,
  ): Row {
    return {
      adapter,
      snapshot,
      action: 'skip',
      status: 'blocked',
      sourceIndex,
      item: {
        kind: resource.kind,
        id: resource.id,
        ...(resource.key ? { key: resource.key } : {}),
        action: 'skip',
        status: 'blocked',
        message,
        changes: [],
      },
    };
  }

  private assertResolvedSnapshot(resource: TransferResource, snapshot: ResolvedTransferResource): void {
    if (
      snapshot.resource.kind !== resource.kind ||
      snapshot.resource.id !== resource.id ||
      (snapshot.current !== null && (snapshot.current.kind !== resource.kind || snapshot.current.id !== resource.id))
    ) {
      throw new Error('Adapter resolved a different resource identity.');
    }
  }

  private emptyDocument(): ResolvedTransferDocument {
    return {
      $schema: TRANSFER_SCHEMA_ID,
      format: TRANSFER_FORMAT,
      version: TRANSFER_VERSION,
      resources: [],
    };
  }

  private requireActorId(user: AuthenticatedUser | undefined): string {
    if (!user?.sub) {
      throw new ForbiddenException(ACCESS_BLOCKED_MESSAGE);
    }
    return user.sub;
  }
}

export function diffResourceData(current: TransferResource | null, proposed: TransferResource): TransferChange[] {
  const currentData = current?.data as Record<string, JsonValue> | undefined;
  const proposedData = proposed.data as Record<string, JsonValue>;
  const changes: TransferChange[] = [];
  for (const field of Object.keys(proposedData).sort()) {
    const before = currentData && Object.prototype.hasOwnProperty.call(currentData, field) ? currentData[field] : null;
    const after = proposedData[field];
    if (canonicalTransferJson(before) !== canonicalTransferJson(after)) {
      changes.push({ field, before, after });
    }
  }
  return changes;
}

function inferDependencies(resource: TransferResource): TransferResourceReference[] {
  const data = resource.data as Record<string, unknown>;
  const references: TransferResourceReference[] = [];
  for (const [field, kind] of Object.entries(REFERENCE_KIND_BY_FIELD)) {
    const value = data[field];
    if (typeof value === 'string' && value.length > 0) {
      references.push({ kind, id: value });
    } else if (Array.isArray(value)) {
      for (const id of value) if (typeof id === 'string') references.push({ kind, id });
    }
  }
  if (Array.isArray(data['allowedEventIds'])) {
    for (const id of data['allowedEventIds']) {
      if (typeof id === 'string') {
        references.push({ kind: 'event', id });
      }
    }
  }
  if (Array.isArray(data['includedPriceTierIds'])) {
    for (const id of data['includedPriceTierIds']) {
      if (typeof id === 'string') {
        references.push({ kind: 'price-tier', id });
      }
    }
  }
  if (Array.isArray(data['recipientAllowedPriceTierIds'])) {
    for (const id of data['recipientAllowedPriceTierIds']) {
      if (typeof id === 'string') {
        references.push({ kind: 'price-tier', id });
      }
    }
  }
  if (Array.isArray(data['purchaseVisiblePriceTierIds'])) {
    for (const id of data['purchaseVisiblePriceTierIds']) {
      if (typeof id === 'string') {
        references.push({ kind: 'price-tier', id });
      }
    }
  }
  if (Array.isArray(data['selectedEventIds'])) {
    for (const id of data['selectedEventIds']) {
      if (typeof id === 'string') {
        references.push({ kind: 'event', id });
      }
    }
  }
  return uniqueReferences(references);
}

/**
 * References whose owning writers need the parent row to exist before they
 * write. Scalar policy ID lists still participate in dependency validation,
 * but cannot create false write-order cycles.
 */
function inferWriteDependencies(resource: TransferResource): TransferResourceReference[] {
  const data = resource.data as Record<string, unknown>;
  const references: TransferResourceReference[] = [];
  for (const [field, kind] of Object.entries(WRITE_REFERENCE_KIND_BY_FIELD)) {
    const id = data[field];
    if (typeof id === 'string' && id.length > 0) references.push({ kind, id });
  }
  if (resource.kind === 'form-link' && Array.isArray(data['priceTierIds'])) {
    for (const id of data['priceTierIds']) if (typeof id === 'string') references.push({ kind: 'price-tier', id });
  }
  if (resource.kind === 'major-event-subscription' && Array.isArray(data['selectedEventIds'])) {
    for (const id of data['selectedEventIds']) if (typeof id === 'string') references.push({ kind: 'event', id });
  }
  return uniqueReferences(references);
}

function isWithinRequestedScope(
  scope: ResolvedTransferResource['scope'],
  resource: TransferResource,
  requestedScope: TransferTarget | undefined,
  current: TransferResource | null,
): boolean {
  if (!requestedScope) {
    return true;
  }
  // Global places can accompany scoped sports exports as unchanged dependencies.
  // Creating or editing a global place still requires an unscoped import.
  if (resource.kind === 'place-preset' && current && diffResourceData(current, resource).length === 0) {
    return true;
  }
  if (resource.kind === SCOPE_ROOT_KIND[requestedScope.kind] && resource.id === requestedScope.id) {
    return true;
  }
  switch (requestedScope.kind) {
    case 'event':
      return scope.eventId === requestedScope.id;
    case 'group':
      return scope.eventGroupId === requestedScope.id;
    case 'major-event':
      return scope.majorEventId === requestedScope.id;
  }
}

function summarize(items: readonly TransferItem[]) {
  return {
    create: items.filter((item) => item.action === 'create' && item.status !== 'blocked').length,
    update: items.filter((item) => item.action === 'update' && item.status !== 'blocked').length,
    unchanged: items.filter((item) => item.status === 'unchanged').length,
    skip: items.filter((item) => item.status === 'blocked' || item.action === 'skip').length,
  };
}

export interface TransferDependencyRow {
  adapter: Pick<DataTransferAdapter, 'dependencyOrder'> | null;
  snapshot: Pick<ResolvedTransferResource, 'dependencies' | 'writeDependencies' | 'resource' | 'ownedBy'> | null;
  action: TransferItem['action'];
  status: TransferItem['status'];
  item: Pick<TransferItem, 'kind' | 'id'>;
  sourceIndex: number;
}

/**
 * Order planned writes by both adapter phase and in-document references. A
 * parent created in the same file must exist before a child writer uses it,
 * regardless of the order chosen by the file author.
 */
export function sortRowsForApply<T extends TransferDependencyRow>(rows: readonly T[]): T[] {
  const stableOrder = (left: T, right: T): number => {
    const leftOrder = left.adapter?.dependencyOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.adapter?.dependencyOrder ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.sourceIndex - right.sourceIndex;
  };
  const writableRows = rows
    .filter((row) => row.status === 'ready' && (row.action === 'create' || row.action === 'update'))
    .sort(stableOrder);
  const rowsByKey = new Map(rows.map((row) => [resourceKey(row.item.kind, row.item.id), row]));
  const writableByKey = new Map(writableRows.map((row) => [resourceKey(row.item.kind, row.item.id), row]));
  const indegree = new Map(writableRows.map((row) => [row, 0]));
  const children = new Map<T, Set<T>>();

  for (const row of writableRows) {
    if (!row.snapshot) {
      continue;
    }
    const references = [...inferWriteDependencies(row.snapshot.resource), ...(row.snapshot.writeDependencies ?? [])];
    for (const reference of references) {
      let dependency = rowsByKey.get(resourceKey(reference.kind, reference.id));
      if (dependency?.snapshot?.ownedBy) {
        dependency = rowsByKey.get(resourceKey(dependency.snapshot.ownedBy.kind, dependency.snapshot.ownedBy.id));
      }
      const parent = dependency ? writableByKey.get(resourceKey(dependency.item.kind, dependency.item.id)) : undefined;
      if (!parent || parent === row) {
        continue;
      }
      const dependents = children.get(parent) ?? new Set<T>();
      if (!dependents.has(row)) {
        dependents.add(row);
        children.set(parent, dependents);
        indegree.set(row, (indegree.get(row) ?? 0) + 1);
      }
    }
  }

  const ready = writableRows.filter((row) => indegree.get(row) === 0).sort(stableOrder);
  const ordered: T[] = [];
  while (ready.length > 0) {
    const row = ready.shift();
    if (!row) {
      continue;
    }
    ordered.push(row);
    for (const child of children.get(row) ?? []) {
      const nextIndegree = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, nextIndegree);
      if (nextIndegree === 0) {
        ready.push(child);
        ready.sort(stableOrder);
      }
    }
  }

  if (ordered.length !== writableRows.length) {
    throw new ConflictException('O arquivo contém dependências circulares e não pode ser aplicado.');
  }

  const writeSet = new Set(writableRows);
  return [...ordered, ...rows.filter((row) => !writeSet.has(row)).sort(stableOrder)];
}

function uniqueReferences(references: readonly TransferResourceReference[]): TransferResourceReference[] {
  const map = new Map(references.map((reference) => [resourceKey(reference.kind, reference.id), reference]));
  return [...map.values()];
}

function fingerprintApplyRequest(input: {
  actorId: string;
  rawDocument: ReturnType<typeof parseTransferDocument>;
  scope: TransferTarget | null;
  planHash: string;
  allowPartial: boolean;
  allocationToken: string | null;
  personDecisions: readonly TransferPersonDecision[];
}): string {
  return createHash('sha256').update(canonicalTransferJson(input)).digest('hex');
}

function normalizedAppliedResource(snapshot: ResolvedTransferResource): TransferResource {
  return normalizeAppliedResource(snapshot.resource, snapshot.resolvedId);
}

function normalizeAppliedResource(resource: TransferResource, resolvedId = resource.id): TransferResource {
  const normalized: Record<string, unknown> = { ...resource, id: resolvedId };
  delete normalized['key'];
  return normalized as unknown as TransferResource;
}

function normalizeReplayResource(resource: TransferResource): TransferResource {
  const normalized = normalizeAppliedResource(resource);
  if (
    resource.kind !== 'event-subscription' &&
    resource.kind !== 'group-subscription' &&
    resource.kind !== 'major-event-subscription' &&
    resource.kind !== 'event-attendance' &&
    resource.kind !== 'ticket-purchase'
  ) {
    return normalized;
  }

  const data = normalized.data as Record<string, unknown>;
  const person = data['person'];
  if (
    !person ||
    typeof person !== 'object' ||
    Array.isArray(person) ||
    typeof (person as Record<string, unknown>)['id'] !== 'string'
  ) {
    throw new ConflictException('O resultado confirmado contém uma referência de pessoa não normalizada.');
  }
  return {
    ...normalized,
    data: { ...data, person: { id: (person as Record<string, unknown>)['id'] } },
  } as TransferResource;
}

function resourceKey(kind: TransferResourceKind, id: string): string {
  return `${kind}:${id}`;
}

function allocatedIdsFor(
  rawDocument: ReturnType<typeof parseTransferDocument>,
  resolvedDocument: ResolvedTransferDocument,
): ReadonlySet<string> {
  return new Set(
    rawDocument.resources.flatMap((source, index) =>
      source.id === undefined && resolvedDocument.resources[index]?.id ? [resolvedDocument.resources[index].id] : [],
    ),
  );
}

function rootReadPermission(kind: TransferTarget['kind']): Permission {
  if (kind === 'event') return Permission.Event.Read;
  if (kind === 'group') return Permission.EventGroup.Read;
  return Permission.MajorEvent.Read;
}

function targetResourceContext(target: TransferTarget) {
  if (target.kind === 'event') return { eventId: target.id };
  if (target.kind === 'group') return { eventGroupId: target.id };
  return { majorEventId: target.id };
}

function deduplicateExportResources(resources: readonly TransferResource[]): TransferResource[] {
  const unique = new Map<string, TransferResource>();
  for (const resource of resources) {
    const key = resourceKey(resource.kind, resource.id);
    const existing = unique.get(key);
    if (existing && canonicalTransferJson(existing) !== canonicalTransferJson(resource)) {
      throw new ServiceUnavailableException(
        'Os adaptadores de exportação produziram duas versões incompatíveis do mesmo recurso.',
      );
    }
    unique.set(key, resource);
    if (unique.size > TRANSFER_MAX_RESOURCES) {
      throw new BadRequestException(
        `Este conjunto excede ${TRANSFER_MAX_RESOURCES} registros. Use um contexto menor ou reduza as opções de exportação.`,
      );
    }
  }
  return [...unique.values()];
}

function isTransferTarget(value: unknown): value is TransferTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (record['kind'] === 'event' || record['kind'] === 'group' || record['kind'] === 'major-event') &&
    typeof record['id'] === 'string' &&
    record['id'].length > 0 &&
    record['id'].length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(record['id']) &&
    Object.keys(record).every((key) => key === 'kind' || key === 'id')
  );
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isNotFoundOrForbidden(error: unknown): boolean {
  return error instanceof NotFoundException || error instanceof ForbiddenException;
}

function isDomainRuleError(error: unknown): boolean {
  return error instanceof BadRequestException || error instanceof ConflictException;
}

function safeDomainMessage(error: unknown): string {
  return error instanceof TransferValidationException ? error.message : DOMAIN_BLOCKED_MESSAGE;
}

function transferItemLabel(snapshot: ResolvedTransferResource): Pick<TransferItem, 'label'> {
  const current = snapshot.current?.data as Record<string, unknown> | undefined;
  const proposed = snapshot.resource.data as Record<string, unknown>;
  const label =
    current?.['name'] ??
    proposed['name'] ??
    current?.['displayName'] ??
    proposed['displayName'] ??
    current?.['label'] ??
    proposed['label'];
  return typeof label === 'string' && label.trim() ? { label: label.trim().slice(0, 300) } : {};
}

function formatFailure(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
