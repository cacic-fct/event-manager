import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventPostCommitEffectsService } from '../events/event-post-commit-effects.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import {
  SportsMutationEventsService,
  type SportsMutationEntity,
} from '../sports/realtime/sports-mutation-events.service';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { DataTransferJournalService, readTransferJournal } from './data-transfer-journal.service';

type RecoveryTargets = {
  eventIds: Set<string>;
  groupIds: Set<string>;
  majorIds: Set<string>;
  sportsEntities: Map<string, { entity: SportsMutationEntity; id: string }>;
};

const SEARCH_SYNC_OPTIONS = { throwOnSearchError: true } as const;

/** Audit-backed outbox: a shutdown between database commit and synchronization remains recoverable. */
@Injectable()
export class DataTransferRecoveryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DataTransferRecoveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private recoveryRun?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: DataTransferJournalService,
    private readonly effects: EventPostCommitEffectsService,
    private readonly search: TypesenseSearchService,
    private readonly sportsEvents: SportsMutationEventsService,
  ) {}

  onApplicationBootstrap(): void {
    void this.recoverPending();
    this.timer = setInterval(() => void this.recoverPending(), 60000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  recoverPending(): Promise<void> {
    if (this.recoveryRun) return this.recoveryRun;

    const run = this.runRecovery().finally(() => {
      if (this.recoveryRun === run) this.recoveryRun = undefined;
    });
    this.recoveryRun = run;
    return run;
  }

  private async runRecovery(): Promise<void> {
    try {
      await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
        const entries = await this.prisma.auditLogEntry.findMany({
          where: {
            entityType: AuditLogEntityType.SYSTEM,
            operation: AuditLogOperation.IMPORT,
            entityId: { startsWith: 'data-transfer:' },
            metadata: { path: ['synchronizationPending'], equals: true },
          },
          orderBy: { createdAt: 'asc' },
          take: 10,
        });

        for (const entry of entries) {
          const metadata = readTransferJournal(entry.metadata);
          if (!metadata) continue;
          try {
            const targets = this.collectTargets(metadata.mutations);
            await this.collectSportsBackingTargets(targets);

            await this.effects.syncEvents([...targets.eventIds], SEARCH_SYNC_OPTIONS);
            await this.effects.syncEventGroups([...targets.groupIds], SEARCH_SYNC_OPTIONS);

            for (const id of targets.majorIds) {
              const major = await this.prisma.majorEvent.findUnique({
                where: { id },
                select: {
                  id: true,
                  name: true,
                  description: true,
                  startDate: true,
                  endDate: true,
                  publicationState: true,
                  deletedAt: true,
                },
              });
              if (!major || major.deletedAt) await this.search.deleteMajorEvent(id, true);
              else await this.search.upsertMajorEvent(major, true);
            }

            for (const { entity, id } of targets.sportsEntities.values()) {
              await this.sportsEvents.publishForEntity(entity, id, true);
            }

            await this.effects.refreshCatalogsAndSitemap();
            await this.syncAuditEntries(entry, metadata.auditEntryIds ?? []);
            await this.journal.markSynchronized(entry.id, metadata.undone);
          } catch {
            this.logger.warn('A committed JSON import still needs synchronization; its audit outbox will retry.');
          }
        }
      });
    } catch {
      this.logger.warn('Could not read the JSON import recovery outbox; it will retry.');
    }
  }

  private collectTargets(
    mutations: readonly {
      model: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      source: { kind: string; id: string; scope: Record<string, unknown> };
    }[],
  ): RecoveryTargets {
    const targets: RecoveryTargets = {
      eventIds: new Set(),
      groupIds: new Set(),
      majorIds: new Set(),
      sportsEntities: new Map(),
    };

    for (const mutation of mutations) {
      this.addScopeTargets(targets, mutation.source.scope);
      this.addSourceTargets(targets, mutation.source.kind, mutation.source.id, mutation.source.scope);

      for (const row of [mutation.before, mutation.after]) {
        if (!row) continue;
        if (mutation.model === 'event') this.addTarget(targets.eventIds, row['id']);
        if (mutation.model === 'eventGroup') this.addTarget(targets.groupIds, row['id']);
        if (mutation.model === 'majorEvent') this.addTarget(targets.majorIds, row['id']);
        this.addTarget(targets.eventIds, row['eventId']);
        this.addTarget(targets.groupIds, row['eventGroupId']);
        this.addTarget(targets.majorIds, row['majorEventId']);
      }
    }

    return targets;
  }

  private addScopeTargets(targets: RecoveryTargets, scope: Record<string, unknown>): void {
    this.addTarget(targets.eventIds, scope['eventId']);
    this.addTarget(targets.groupIds, scope['eventGroupId']);
    this.addTarget(targets.majorIds, scope['majorEventId']);
  }

  private addSourceTargets(targets: RecoveryTargets, kind: string, id: string, scope: Record<string, unknown>): void {
    if (kind === 'event') this.addTarget(targets.eventIds, id);
    if (kind === 'group') this.addTarget(targets.groupIds, id);
    if (kind === 'major-event') this.addTarget(targets.majorIds, id);

    const sportsEntity = this.sportsEntityForSource(kind, id, scope);
    if (sportsEntity) targets.sportsEntities.set(`${sportsEntity.entity}:${sportsEntity.id}`, sportsEntity);
  }

  private sportsEntityForSource(
    kind: string,
    id: string,
    scope: Record<string, unknown>,
  ): { entity: SportsMutationEntity; id: string } | null {
    if (kind === 'sports-tournament') return { entity: 'TOURNAMENT', id };
    if (kind === 'sports-category') return { entity: 'CATEGORY', id };
    if (kind === 'sports-venue') return { entity: 'VENUE', id };
    if (kind === 'sports-match') return { entity: 'MATCH', id };
    if (kind === 'sports-stage' && typeof scope['sportsCategoryId'] === 'string') {
      return { entity: 'CATEGORY', id: scope['sportsCategoryId'] };
    }
    return null;
  }

  private async collectSportsBackingTargets(targets: RecoveryTargets): Promise<void> {
    for (const { entity, id } of targets.sportsEntities.values()) {
      if (entity === 'CATEGORY') {
        const category = await this.prisma.sportsCategory.findUnique({
          where: { id },
          select: {
            eventGroupId: true,
            tournament: { select: { majorEventId: true } },
            matches: { select: { eventId: true } },
          },
        });
        if (!category) continue;
        this.addTarget(targets.groupIds, category.eventGroupId);
        this.addTarget(targets.majorIds, category.tournament.majorEventId);
        for (const match of category.matches) this.addTarget(targets.eventIds, match.eventId);
      } else if (entity === 'TOURNAMENT') {
        const categories = await this.prisma.sportsCategory.findMany({
          where: { tournamentId: id },
          select: {
            eventGroupId: true,
            tournament: { select: { majorEventId: true } },
            matches: { select: { eventId: true } },
          },
        });
        for (const category of categories) {
          this.addTarget(targets.groupIds, category.eventGroupId);
          this.addTarget(targets.majorIds, category.tournament.majorEventId);
          for (const match of category.matches) this.addTarget(targets.eventIds, match.eventId);
        }
      } else if (entity === 'VENUE') {
        const matches = await this.prisma.sportsMatch.findMany({
          where: { venueId: id },
          select: { eventId: true },
        });
        for (const match of matches) this.addTarget(targets.eventIds, match.eventId);
      } else if (entity === 'MATCH') {
        const match = await this.prisma.sportsMatch.findUnique({
          where: { id },
          select: {
            eventId: true,
            category: {
              select: {
                eventGroupId: true,
                tournament: { select: { majorEventId: true } },
              },
            },
          },
        });
        if (!match) continue;
        this.addTarget(targets.eventIds, match.eventId);
        this.addTarget(targets.groupIds, match.category.eventGroupId);
        this.addTarget(targets.majorIds, match.category.tournament.majorEventId);
      }
    }
  }

  private addTarget(targets: Set<string>, value: unknown): void {
    if (typeof value === 'string' && value.length > 0) targets.add(value);
  }

  private async syncAuditEntries(
    batchEntry: Prisma.AuditLogEntryGetPayload<Record<never, never>>,
    linkedEntryIds: readonly string[],
  ): Promise<void> {
    const entries = new Map<string, Prisma.AuditLogEntryGetPayload<Record<never, never>>>();
    entries.set(batchEntry.id, batchEntry);
    const pendingIds = new Set(linkedEntryIds);
    this.addTarget(pendingIds, batchEntry.revertedByEntryId);

    while (true) {
      const missingIds = [...pendingIds].filter((id) => !entries.has(id));
      if (missingIds.length === 0) break;
      const linkedEntries = await this.prisma.auditLogEntry.findMany({ where: { id: { in: missingIds } } });
      if (linkedEntries.length !== missingIds.length) {
        throw new Error('A linked import audit entry is unavailable; the journal will retry.');
      }
      for (const linkedEntry of linkedEntries) {
        entries.set(linkedEntry.id, linkedEntry);
        this.addTarget(pendingIds, linkedEntry.revertedByEntryId);
      }
    }

    for (const auditEntry of entries.values()) {
      await this.search.upsertAuditLogEntry(auditEntry, true);
    }
  }
}
