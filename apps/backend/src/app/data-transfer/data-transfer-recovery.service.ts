import { Injectable, Logger, Optional, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
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
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';
import { TicketRealtimeService } from '../tickets/ticket-realtime.service';
import { PublicationJobsService } from '../publishing/publishing-jobs.service';
import { DataTransferJournalService, readTransferJournal } from './data-transfer-journal.service';

type SportsRecoveryTarget = {
  entity: SportsMutationEntity;
  id: string;
  tournamentId?: string;
  deleted: boolean;
};

type RecoveryTargets = {
  eventIds: Set<string>;
  groupIds: Set<string>;
  majorIds: Set<string>;
  sportsEntities: Map<string, SportsRecoveryTarget>;
  formIds: Set<string>;
  placeIds: Set<string>;
  personIds: Set<string>;
  attendanceEventIds: Set<string>;
  attendanceSettingsChanged: boolean;
};

const ATTENDANCE_AVAILABILITY_MODELS = new Set([
  'event',
  'eventGroup',
  'majorEvent',
  'eventAudienceInvitation',
  'eventGroupAudienceInvitation',
  'majorEventAudienceInvitation',
]);

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
    private readonly realtime: RealtimeInvalidationService,
    private readonly attendanceRealtime: CurrentUserOnlineAttendanceRealtimeService,
    @Optional() private readonly ticketRealtime?: TicketRealtimeService,
    @Optional() private readonly publicationJobs?: PublicationJobsService,
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
            const targets = this.collectTargets(metadata.mutations, metadata.undone);
            await this.collectSportsBackingTargets(targets);

            await this.enqueuePublicationSchedules(targets);

            const searchEnabled = this.search.isEnabled();
            const searchOptions = { throwOnSearchError: searchEnabled };
            await this.effects.syncEvents([...targets.eventIds], searchOptions);
            await this.effects.syncEventGroups([...targets.groupIds], searchOptions);

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
              if (!major || major.deletedAt) await this.search.deleteMajorEvent(id, searchEnabled);
              else await this.search.upsertMajorEvent(major, searchEnabled);
            }

            for (const id of targets.personIds) {
              const person = await this.prisma.people.findUnique({
                where: { id },
                select: {
                  id: true,
                  name: true,
                  email: true,
                  secondaryEmails: true,
                  phone: true,
                  identityDocument: true,
                  academicId: true,
                  userId: true,
                  deletedAt: true,
                  mergedIntoId: true,
                },
              });
              if (!person || person.deletedAt || person.mergedIntoId) await this.search.deletePerson(id, searchEnabled);
              else await this.search.upsertPerson(person, searchEnabled);
            }

            for (const id of targets.placeIds) {
              const place = await this.prisma.placePreset.findUnique({
                where: { id },
                select: { id: true, name: true, locationDescription: true, deletedAt: true },
              });
              if (!place || place.deletedAt) await this.search.deletePlacePreset(id, searchEnabled);
              else await this.search.upsertPlacePreset(place, searchEnabled);
            }

            for (const { entity, id, tournamentId, deleted } of targets.sportsEntities.values()) {
              if (deleted) {
                if (!tournamentId) throw new Error('The deleted sports entity has no journaled tournament scope.');
                await this.sportsEvents.publishForDeletedEntity(entity, id, tournamentId);
              } else {
                await this.sportsEvents.publishForEntity(entity, id, true);
              }
            }
            for (const formId of targets.formIds) {
              await this.realtime.publish(this.realtime.scope('admin-workspace'), {
                type: 'EVENT_FORMS_INVALIDATED',
                formId,
                occurredAt: new Date().toISOString(),
              });
            }
            for (const eventId of targets.attendanceEventIds) {
              await this.sportsEvents.publishAttendanceMutation(eventId);
            }
            if (targets.attendanceSettingsChanged) {
              await this.attendanceRealtime.notifyAllConnectedPeople();
            }

            if (this.ticketRealtime) {
              const ticketEvents = new Map<string, Set<string>>();
              for (const mutation of metadata.mutations) {
                if (mutation.model !== 'eventTicket' && mutation.model !== 'ticketPurchase') continue;
                for (const row of [mutation.before, mutation.after]) {
                  if (!row || typeof row['eventId'] !== 'string') continue;
                  const ids = ticketEvents.get(row['eventId']) ?? new Set<string>();
                  const personId = row['holderPersonId'] ?? row['personId'];
                  if (typeof personId === 'string') ids.add(personId);
                  ticketEvents.set(row['eventId'], ids);
                }
              }
              for (const [eventId, ids] of ticketEvents) {
                const holders = await this.prisma.people.findMany({
                  where: { id: { in: [...ids] } },
                  select: { userId: true },
                });
                await this.ticketRealtime.enqueueForUsers(
                  this.prisma,
                  holders.map((person) => person.userId),
                  { type: 'TICKETS_CHANGED', eventId },
                );
                await this.ticketRealtime.enqueueForUsers(
                  this.prisma,
                  holders.map((person) => person.userId),
                  { type: 'PURCHASES_CHANGED', eventId },
                );
              }
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

  private async enqueuePublicationSchedules(targets: RecoveryTargets): Promise<void> {
    if (!this.publicationJobs) return;
    const select = { publicationState: true, scheduledPublishAt: true } as const;
    for (const id of targets.eventIds) {
      const event = await this.prisma.event.findUnique({ where: { id, deletedAt: null }, select });
      if (event)
        await this.publicationJobs.enqueueScheduledJobs(event.publicationState, event.scheduledPublishAt, {
          eventIds: [id],
          majorEventIds: [],
        });
    }
    for (const id of targets.majorIds) {
      const major = await this.prisma.majorEvent.findUnique({ where: { id, deletedAt: null }, select });
      if (major)
        await this.publicationJobs.enqueueScheduledJobs(major.publicationState, major.scheduledPublishAt, {
          eventIds: [],
          majorEventIds: [id],
        });
    }
  }

  private collectTargets(
    mutations: readonly {
      model: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      source: { kind: string; id: string; action: string; scope: Record<string, unknown> };
    }[],
    undone: boolean,
  ): RecoveryTargets {
    const targets: RecoveryTargets = {
      eventIds: new Set(),
      groupIds: new Set(),
      majorIds: new Set(),
      sportsEntities: new Map(),
      formIds: new Set(),
      placeIds: new Set(),
      personIds: new Set(),
      attendanceEventIds: new Set(),
      attendanceSettingsChanged: false,
    };

    for (const mutation of mutations) {
      this.addScopeTargets(targets, mutation.source.scope);
      const { kind, id, action, scope } = mutation.source;
      this.addSourceTargets(targets, kind, id, scope, undone && action === 'create' && kind !== 'sports-stage');
      if (kind === 'event-form') this.addTarget(targets.formIds, id);
      // Tree and invitation mutations may change attendance availability, including through inherited settings.
      if (ATTENDANCE_AVAILABILITY_MODELS.has(mutation.model)) targets.attendanceSettingsChanged = true;

      for (const row of [mutation.before, mutation.after]) {
        if (!row) continue;
        if (mutation.model === 'event') this.addTarget(targets.eventIds, row['id']);
        if (mutation.model === 'eventGroup') this.addTarget(targets.groupIds, row['id']);
        if (mutation.model === 'majorEvent') this.addTarget(targets.majorIds, row['id']);
        if (mutation.model === 'people') this.addTarget(targets.personIds, row['id']);
        if (mutation.model === 'placePreset') this.addTarget(targets.placeIds, row['id']);
        this.addTarget(targets.eventIds, row['eventId']);
        this.addTarget(targets.groupIds, row['eventGroupId']);
        this.addTarget(targets.majorIds, row['majorEventId']);
        if (kind === 'form-link') this.addTarget(targets.formIds, row['formId']);
        if (mutation.model === 'eventAttendance') this.addTarget(targets.attendanceEventIds, row['eventId']);
      }
    }

    return targets;
  }

  private addScopeTargets(targets: RecoveryTargets, scope: Record<string, unknown>): void {
    this.addTarget(targets.eventIds, scope['eventId']);
    this.addTarget(targets.groupIds, scope['eventGroupId']);
    this.addTarget(targets.majorIds, scope['majorEventId']);
  }

  private addSourceTargets(
    targets: RecoveryTargets,
    kind: string,
    id: string,
    scope: Record<string, unknown>,
    deleted: boolean,
  ): void {
    if (kind === 'event') this.addTarget(targets.eventIds, id);
    if (kind === 'group') this.addTarget(targets.groupIds, id);
    if (kind === 'major-event') this.addTarget(targets.majorIds, id);

    const sportsEntity = this.sportsEntityForSource(kind, id, scope);
    if (sportsEntity) {
      const key = `${sportsEntity.entity}:${sportsEntity.id}`;
      const previous = targets.sportsEntities.get(key);
      const tournamentId = sportsEntity.entity === 'TOURNAMENT' ? sportsEntity.id : scope['sportsTournamentId'];
      targets.sportsEntities.set(key, {
        ...sportsEntity,
        tournamentId: typeof tournamentId === 'string' ? tournamentId : previous?.tournamentId,
        deleted: deleted || previous?.deleted === true,
      });
    }
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
    if (!this.search.isEnabled()) return;
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
