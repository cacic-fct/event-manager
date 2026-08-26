import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PrizeDrawChanceMode as PrismaPrizeDrawChanceMode,
  PrizeDrawSpeed as PrismaPrizeDrawSpeed,
  PrizeDrawTargetType as PrismaPrizeDrawTargetType,
} from '@prisma/client';
import {
  PrizeDraw,
  PrizeDrawAvailability,
  PrizeDrawEligibleEntry,
  PrizeDrawSpinResult,
  PrizeDrawTargetType,
  PrizeDrawWinnerContact,
  SavePrizeDrawInput,
  SpinPrizeDrawInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrizeDrawEligibleRecord, PrizeDrawEligibilityService } from './prize-draw-eligibility.service';
import { formatPrizeDrawReelName, normalizePrizeDrawText } from './prize-draw-name';
import {
  PRIZE_DRAW_PRESENTATION_GRACE_MS,
  PrizeDrawNotificationJobsService,
} from './prize-draw-notification-jobs.service';
import { PrizeDrawRealtimeService } from './prize-draw-realtime.service';
import { PUBLIC_EVENT_WHERE, PUBLIC_MAJOR_EVENT_WHERE } from '../public-events/models';
import { computePrizeDrawAnimationTiming } from './prize-draw-motion';
import { countPrizeDrawDuplicateEntries, selectWeightedEntry } from './prize-draw-random';

const MAX_TOTAL_WEIGHT = 1_000_000_000;

const DRAW_INCLUDE = Prisma.validator<Prisma.PrizeDrawInclude>()({
  event: { select: { id: true, name: true } },
  majorEvent: { select: { id: true, name: true } },
  plannedSpins: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
  manualEntries: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  weightOverrides: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  excludedPeople: {
    select: {
      personId: true,
      person: {
        select: {
          id: true,
          name: true,
          mergedInto: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  spins: {
    include: {
      winnerPerson: { select: { id: true, mergedIntoId: true } },
    },
    orderBy: [{ drawnAt: 'asc' }, { sequence: 'asc' }],
  },
});

type PrizeDrawRecord = Prisma.PrizeDrawGetPayload<{ include: typeof DRAW_INCLUDE }>;
type PrizeDrawWeightBreakdown = { weight: number; peopleCount: number };

@Injectable()
export class PrizeDrawService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: PrizeDrawEligibilityService,
    private readonly policy: AuthorizationPolicyService,
    private readonly realtime: PrizeDrawRealtimeService,
    private readonly notificationJobs: PrizeDrawNotificationJobsService,
  ) {}

  async listAdmin(user: AuthenticatedUser | undefined): Promise<PrizeDraw[]> {
    const targets = await this.policy.accessibleEventTargets(user, Permission.PrizeDraw.Read);
    if (targets && targets.eventIds.size === 0 && targets.majorEventIds.size === 0 && targets.eventGroupIds.size === 0) {
      return [];
    }
    const records = await this.prisma.prizeDraw.findMany({
      where: {
        deletedAt: null,
        ...(targets ? { OR: this.scopedTargetWhere(targets) } : {}),
      },
      include: DRAW_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    const weightBreakdowns = await this.loadWeightBreakdowns(records);
    return Promise.all(records.map((record) => this.mapDraw(record, false, false, weightBreakdowns)));
  }

  async getAdmin(drawId: string): Promise<PrizeDraw> {
    const record = await this.requireDraw(drawId);
    const weightBreakdowns = await this.loadWeightBreakdowns([record]);
    return this.mapDraw(record, false, true, weightBreakdowns);
  }

  async eligibleEntries(drawId: string): Promise<PrizeDrawEligibleEntry[]> {
    const draw = await this.requireDraw(drawId);
    const excluded = draw.removeWinnerAfterDraw ? this.activeWinnerKeys(draw) : new Set<string>();
    return this.eligibility.resolve(draw, { excludeIdentityKeys: excluded });
  }

  async save(input: SavePrizeDrawInput, actor: AuthenticatedUser | undefined): Promise<PrizeDraw> {
    this.validateInput(input);
    const actorId = this.requireActorId(actor);
    const existing = input.id ? await this.requireDraw(input.id) : null;
    if (existing) {
      await this.policy.assertPermissions(actor, [Permission.PrizeDraw.Update], { prizeDrawId: existing.id });
    }
    await this.policy.assertPermissions(
      actor,
      [existing ? Permission.PrizeDraw.Update : Permission.PrizeDraw.Create],
      input.targetType === PrizeDrawTargetType.EVENT
        ? { eventId: input.eventId ?? undefined }
        : { majorEventId: input.majorEventId ?? undefined },
    );
    if (
      input.manualEntries.length > 0 ||
      input.weightOverrides.length > 0 ||
      input.excludedPersonIds.length > 0
    ) {
      await this.policy.assertPermissions(
        actor,
        [Permission.RelatedPerson.Read],
        input.targetType === PrizeDrawTargetType.EVENT
          ? { eventId: input.eventId ?? undefined }
          : { majorEventId: input.majorEventId ?? undefined },
      );
    }
    await this.assertTargetExists(input);
    await this.assertPersonInputsScoped(input);
    if (existing) this.assertMutableConfiguration(existing, input);

    const drawId = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await this.lockDraw(tx, existing.id);
        const current = await tx.prizeDraw.findFirst({
          where: { id: existing.id, deletedAt: null },
          include: DRAW_INCLUDE,
        });
        if (!current) throw new NotFoundException('Sorteio não encontrado.');
        this.assertMutableConfiguration(current, input);
      }
      const saved = existing
        ? await tx.prizeDraw.update({
            where: { id: existing.id },
            data: {
              ...this.drawData(input),
              updatedById: actorId,
              revision: { increment: 1 },
            },
          })
        : await tx.prizeDraw.create({
            data: {
              ...this.drawData(input),
              createdById: actorId,
              updatedById: actorId,
            },
          });

      await this.syncPlannedSpins(tx, saved.id, input);
      await this.syncManualEntries(tx, saved.id, input, actorId);
      await this.syncWeightOverrides(tx, saved.id, input);
      await this.syncExcludedPeople(tx, saved.id, input);
      return saved.id;
    });

    const result = await this.getAdmin(drawId);
    await this.realtime.publishDraw(drawId, 'DRAW_UPDATED', result.revision);
    return result;
  }

  async freeze(drawId: string, actor: AuthenticatedUser | undefined): Promise<PrizeDraw> {
    const actorId = this.requireActorId(actor);
    await this.prisma.$transaction(async (tx) => {
      await this.lockDraw(tx, drawId);
      const draw = await tx.prizeDraw.findFirst({ where: { id: drawId, deletedAt: null } });
      if (!draw) throw new NotFoundException('Sorteio não encontrado.');
      if (draw.frozenAt) throw new ConflictException('A lista de participantes já está congelada.');
      const entries = await this.eligibility.resolve(draw, { client: tx });
      if (entries.length === 0) throw new BadRequestException('Não há participantes elegíveis para congelar.');
      await this.eligibility.freeze(draw, new Date(), actorId, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const result = await this.getAdmin(drawId);
    await this.realtime.publishDraw(drawId, 'ELIGIBILITY_FROZEN', result.revision);
    return result;
  }

  async unfreeze(drawId: string, actor: AuthenticatedUser | undefined): Promise<PrizeDraw> {
    const actorId = this.requireActorId(actor);
    await this.prisma.$transaction(async (tx) => {
      await this.lockDraw(tx, drawId);
      const draw = await tx.prizeDraw.findFirst({ where: { id: drawId, deletedAt: null } });
      if (!draw) throw new NotFoundException('Sorteio não encontrado.');
      if (!draw.frozenAt) throw new ConflictException('A lista de participantes não está congelada.');
      await tx.prizeDrawFrozenEntry.deleteMany({ where: { drawId } });
      await tx.prizeDraw.update({
        where: { id: drawId },
        data: {
          frozenAt: null,
          frozenById: null,
          unfrozenAt: new Date(),
          updatedById: actorId,
          revision: { increment: 1 },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const result = await this.getAdmin(drawId);
    await this.realtime.publishDraw(drawId, 'ELIGIBILITY_UNFROZEN', result.revision);
    return result;
  }

  async spin(input: SpinPrizeDrawInput, actor: AuthenticatedUser | undefined): Promise<PrizeDrawSpinResult> {
    const actorId = this.requireActorId(actor);
    if (input.demo) return this.demoSpin(input);

    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockDraw(tx, input.drawId);
      const draw = await tx.prizeDraw.findFirst({
        where: { id: input.drawId, deletedAt: null },
        include: {
          plannedSpins: { orderBy: { position: 'asc' } },
          spins: {
            include: { winnerPerson: { select: { id: true, mergedIntoId: true } } },
            orderBy: { sequence: 'asc' },
          },
        },
      });
      if (!draw) throw new NotFoundException('Sorteio não encontrado.');

      const activeSpins = draw.spins.filter((spin) => !spin.undoneAt);
      if (draw.spinLimit !== null && activeSpins.length >= draw.spinLimit) {
        throw new ConflictException('Todos os giros configurados já foram realizados.');
      }
      const planned = draw.spinLimit !== null ? draw.plannedSpins.find((spin) => spin.position === activeSpins.length + 1) : null;
      if (draw.spinLimit !== null && !planned) {
        throw new ConflictException('A configuração do próximo giro está incompleta.');
      }
      const excluded = draw.removeWinnerAfterDraw ? this.activeWinnerKeys({ spins: activeSpins }) : new Set<string>();
      const entries = await this.eligibility.resolve(draw, { excludeIdentityKeys: excluded, client: tx });
      const winner = this.chooseWinner(entries);
      const speed = planned?.speed ?? draw.defaultSpeed;
      const countdownSeconds = speed === PrismaPrizeDrawSpeed.DRAMATIC
        ? (planned?.countdownSeconds ?? draw.dramaticCountdownSeconds)
        : null;
      const animation = computePrizeDrawAnimationTiming(speed, activeSpins.length, input.reducedMotion, countdownSeconds);
      const sequence = (draw.spins.at(-1)?.sequence ?? 0) + 1;
      const notificationTransactionId = draw.notifyWinner && winner.personId ? `prize-draw-winner:${input.drawId}:${sequence}` : null;
      const spin = await tx.prizeDrawSpin.create({
        data: {
          drawId: draw.id,
          plannedSpinId: planned?.id ?? null,
          sequence,
          description: normalizePrizeDrawText(planned?.description),
          speed,
          countdownSeconds,
          repeatedSpinIndex: activeSpins.length,
          reelDurationMs: animation.reelDurationMs,
          preRevealPauseMs: animation.preRevealPauseMs,
          chanceMode: draw.chanceMode,
          removeWinnerAfterDraw: draw.removeWinnerAfterDraw,
          winnerEntryKey: winner.identityKey,
          winnerPersonId: winner.personId,
          winnerDisplayName: winner.displayName,
          winnerWeight: winner.weight,
          entrantCount: entries.length,
          totalWeight: this.totalWeight(entries),
          duplicateEntryCount: countPrizeDrawDuplicateEntries(entries),
          eligibilityFrozenAt: draw.frozenAt,
          drawnById: actorId,
          notificationTransactionId,
          notificationStatus: notificationTransactionId ? 'PENDING' : 'NOT_REQUESTED',
          entries: {
            create: entries.map((entry) => ({
              identityKey: entry.identityKey,
              personId: entry.personId,
              displayName: entry.displayName,
              weight: entry.weight,
              sources: entry.sources,
              winner: entry.identityKey === winner.identityKey,
            })),
          },
        },
      });
      const updated = await tx.prizeDraw.update({
        where: { id: draw.id },
        data: { revision: { increment: 1 }, updatedById: actorId },
        select: { revision: true },
      });
      return { draw, spin, winner, entries, animation, activeCount: activeSpins.length, revision: updated.revision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await this.notificationJobs.enqueuePresentation(created.spin.id, {
      delayMs: created.animation.countdownMs + created.animation.reelDurationMs +
        created.animation.preRevealPauseMs + PRIZE_DRAW_PRESENTATION_GRACE_MS,
    });
    return this.spinResult(created.draw, created.spin, created.winner, created.entries, created.animation, false, created.activeCount + 1);
  }

  async undoLast(drawId: string, actor: AuthenticatedUser | undefined): Promise<PrizeDraw> {
    const actorId = this.requireActorId(actor);
    const undone = await this.prisma.$transaction(async (tx) => {
      await this.lockDraw(tx, drawId);
      const spin = await tx.prizeDrawSpin.findFirst({
        where: { drawId, undoneAt: null },
        orderBy: [{ sequence: 'desc' }, { drawnAt: 'desc' }],
      });
      if (!spin) throw new ConflictException('Não há giro para desfazer.');
      const now = new Date();
      const updatedSpin = await tx.prizeDrawSpin.update({
        where: { id: spin.id },
        data: { undoneAt: now, undoneById: actorId },
      });
      const draw = await tx.prizeDraw.update({
        where: { id: drawId },
        data: { revision: { increment: 1 }, updatedById: actorId },
        select: { revision: true },
      });
      return { spin: updatedSpin, revision: draw.revision };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    try {
      await this.notificationJobs.undoSpin(undone.spin.id);
    } catch {
      // Notification cleanup is retried independently and must not mask the committed undo.
    }
    await this.realtime.publishDraw(drawId, 'SPIN_UNDONE', undone.revision, undone.spin.id);
    return this.getAdmin(drawId);
  }

  async winnerContact(spinId: string): Promise<PrizeDrawWinnerContact> {
    const spin = await this.prisma.prizeDrawSpin.findUnique({
      where: { id: spinId },
      select: {
        id: true,
        winnerDisplayName: true,
        undoneAt: true,
        winnerPerson: {
          select: {
            name: true,
            email: true,
            phone: true,
            academicId: true,
            mergedInto: { select: { name: true, email: true, phone: true, academicId: true } },
          },
        },
      },
    });
    if (!spin) throw new NotFoundException('Giro não encontrado.');
    if (spin.undoneAt) throw new ConflictException('O contato de um resultado desfeito não pode ser exibido.');
    const person = spin.winnerPerson?.mergedInto ?? spin.winnerPerson;
    return {
      spinId: spin.id,
      fullName: person?.name ?? spin.winnerDisplayName,
      email: person?.email ?? null,
      phone: person?.phone ?? null,
      academicId: person?.academicId ?? null,
    };
  }

  async listPublic(
    input: { eventId?: string; majorEventId?: string; eventGroupId?: string },
    user: AuthenticatedUser | undefined,
  ): Promise<PrizeDraw[]> {
    const targets = [input.eventId, input.majorEventId, input.eventGroupId].filter(Boolean);
    if (targets.length !== 1) throw new BadRequestException('Informe um único evento, grupo ou grande evento.');
    await this.assertPublicTarget(input);
    const audienceWhere = await this.publicAudienceWhere(user);
    const records = await this.prisma.prizeDraw.findMany({
      where: {
        deletedAt: null,
        spins: { some: { undoneAt: null, presentationAcknowledgedAt: { not: null } } },
        ...(audienceWhere ?? {}),
        ...(input.eventId
          ? { eventId: input.eventId }
          : input.majorEventId
            ? { majorEventId: input.majorEventId }
            : { event: { AND: [PUBLIC_EVENT_WHERE, { eventGroupId: input.eventGroupId }] } }),
      },
      include: DRAW_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (records.length === 0) {
      throw new ForbiddenException('Você não participou deste sorteio ou não possui permissão para consultá-lo.');
    }
    const weightBreakdowns = await this.loadWeightBreakdowns(records);
    return Promise.all(records.map((record) => this.mapDraw(record, true, true, weightBreakdowns)));
  }

  async publicAvailability(input: {
    eventIds?: string[];
    majorEventIds?: string[];
    eventGroupIds?: string[];
  }, user: AuthenticatedUser | undefined): Promise<PrizeDrawAvailability[]> {
    const eventIds = [...new Set(input.eventIds?.filter(Boolean) ?? [])].slice(0, 500);
    const majorEventIds = [...new Set(input.majorEventIds?.filter(Boolean) ?? [])].slice(0, 500);
    const eventGroupIds = [...new Set(input.eventGroupIds?.filter(Boolean) ?? [])].slice(0, 500);
    const audienceWhere = await this.publicAudienceWhere(user);
    const draws = await this.prisma.prizeDraw.findMany({
      where: {
        deletedAt: null,
        spins: { some: { undoneAt: null, presentationAcknowledgedAt: { not: null } } },
        AND: [
          ...(audienceWhere ? [audienceWhere] : []),
          { OR: [
          ...(eventIds.length ? [{
            eventId: { in: eventIds },
            event: PUBLIC_EVENT_WHERE,
          }] : []),
          ...(majorEventIds.length ? [{
            majorEventId: { in: majorEventIds },
            majorEvent: PUBLIC_MAJOR_EVENT_WHERE,
          }] : []),
          ...(eventGroupIds.length ? [{
            event: { AND: [PUBLIC_EVENT_WHERE, { eventGroupId: { in: eventGroupIds } }] },
          }] : []),
          ] },
        ],
      },
      select: { eventId: true, majorEventId: true, event: { select: { eventGroupId: true } } },
    });
    const counts = new Map<string, number>();
    const increment = (type: string, id: string | null | undefined) => {
      if (!id) return;
      const key = `${type}:${id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    };
    for (const draw of draws) {
      increment('EVENT', draw.eventId);
      increment('MAJOR_EVENT', draw.majorEventId);
      increment('EVENT_GROUP', draw.event?.eventGroupId);
    }
    return [
      ...eventIds.map((targetId) => ({ targetType: 'EVENT' as const, targetId, drawCount: counts.get(`EVENT:${targetId}`) ?? 0 })),
      ...majorEventIds.map((targetId) => ({ targetType: 'MAJOR_EVENT' as const, targetId, drawCount: counts.get(`MAJOR_EVENT:${targetId}`) ?? 0 })),
      ...eventGroupIds.map((targetId) => ({ targetType: 'EVENT_GROUP' as const, targetId, drawCount: counts.get(`EVENT_GROUP:${targetId}`) ?? 0 })),
    ];
  }

  private async demoSpin(input: SpinPrizeDrawInput): Promise<PrizeDrawSpinResult> {
    const draw = await this.requireDraw(input.drawId);
    const active = draw.spins.filter((spin) => !spin.undoneAt);
    const planned = draw.spinLimit !== null ? draw.plannedSpins.find((spin) => spin.position === active.length + 1) : null;
    if (draw.spinLimit !== null && active.length >= draw.spinLimit) {
      throw new ConflictException('Todos os giros configurados já foram realizados.');
    }
    const excluded = draw.removeWinnerAfterDraw ? this.activeWinnerKeys(draw) : new Set<string>();
    const entries = await this.eligibility.resolve(draw, { excludeIdentityKeys: excluded });
    const winner = this.chooseWinner(entries);
    const speed = planned?.speed ?? draw.defaultSpeed;
    const countdownSeconds = speed === PrismaPrizeDrawSpeed.DRAMATIC
      ? (planned?.countdownSeconds ?? draw.dramaticCountdownSeconds)
      : null;
    const animation = computePrizeDrawAnimationTiming(speed, active.length, input.reducedMotion, countdownSeconds);
    const demoSpin = {
      id: null,
      sequence: null,
      description: normalizePrizeDrawText(planned?.description),
      speed,
      countdownSeconds,
    };
    return this.spinResult(draw, demoSpin, winner, entries, animation, true, active.length);
  }

  private spinResult(
    draw: { id: string; title: string; spinLimit: number | null; removeWinnerAfterDraw: boolean },
    spin: { id: string | null; sequence: number | null; description: string | null; speed: PrismaPrizeDrawSpeed },
    winner: PrizeDrawEligibleRecord,
    entries: PrizeDrawEligibleRecord[],
    animation: { countdownMs: number; reelDurationMs: number; preRevealPauseMs: number },
    demo: boolean,
    completedCount: number,
  ): PrizeDrawSpinResult {
    const hasMoreByLimit = draw.spinLimit === null || completedCount < draw.spinLimit;
    const hasMoreByRoster = !draw.removeWinnerAfterDraw || entries.length > 1;
    return {
      demo,
      drawId: draw.id,
      spinId: spin.id,
      sequence: spin.sequence,
      drawTitle: draw.title,
      spinDescription: spin.description,
      winnerFullName: winner.displayName,
      winnerReelName: formatPrizeDrawReelName(winner.displayName),
      winnerReelIndex: entries.findIndex((entry) => entry.identityKey === winner.identityKey),
      reelNames: entries.map((entry) => formatPrizeDrawReelName(entry.displayName)),
      speed: spin.speed,
      countdownMs: animation.countdownMs,
      reelDurationMs: animation.reelDurationMs,
      preRevealPauseMs: animation.preRevealPauseMs,
      hasMoreSpins: hasMoreByLimit && hasMoreByRoster,
    };
  }

  private chooseWinner(entries: PrizeDrawEligibleRecord[]): PrizeDrawEligibleRecord {
    if (entries.length === 0) throw new ConflictException('Não há participantes elegíveis para este giro.');
    const total = this.totalWeight(entries);
    if (total > MAX_TOTAL_WEIGHT) throw new BadRequestException('A soma dos pesos do sorteio é muito alta.');
    return selectWeightedEntry(entries, randomInt(total));
  }

  private totalWeight(entries: readonly PrizeDrawEligibleRecord[]): number {
    return entries.reduce((sum, entry) => sum + entry.weight, 0);
  }

  private async mapDraw(
    record: PrizeDrawRecord,
    publicView: boolean,
    computeEligibility = true,
    weightBreakdowns: ReadonlyMap<string, PrizeDrawWeightBreakdown[]> = new Map(),
  ): Promise<PrizeDraw> {
    const excluded = record.removeWinnerAfterDraw ? this.activeWinnerKeys(record) : new Set<string>();
    const eligible = publicView || !computeEligibility ? [] : await this.eligibility.resolve(record, { excludeIdentityKeys: excluded });
    const target = record.event
      ? { type: PrizeDrawTargetType.EVENT, id: record.event.id, name: record.event.name }
      : record.majorEvent
        ? { type: PrizeDrawTargetType.MAJOR_EVENT, id: record.majorEvent.id, name: record.majorEvent.name }
        : null;
    if (!target) throw new ConflictException(`Sorteio ${record.id} sem vínculo válido.`);
    return {
      id: record.id,
      title: record.title,
      description: record.description,
      target,
      includePresent: record.includePresent,
      includeSubscribers: record.includeSubscribers,
      includeManualEntries: record.includeManualEntries,
      chanceMode: record.chanceMode,
      spinLimit: record.spinLimit,
      removeWinnerAfterDraw: record.removeWinnerAfterDraw,
      defaultSpeed: record.defaultSpeed,
      dramaticCountdownSeconds: record.dramaticCountdownSeconds,
      notifyWinner: publicView ? false : record.notifyWinner,
      frozenAt: record.frozenAt,
      unfrozenAt: record.unfrozenAt,
      revision: record.revision,
      plannedSpins: publicView ? [] : record.plannedSpins,
      manualEntries: publicView ? [] : record.manualEntries,
      weightOverrides: publicView ? [] : record.weightOverrides,
      excludedPeople: publicView ? [] : this.excludedPeopleSummary(record.excludedPeople),
      spins: record.spins
        .filter((spin) => !publicView || (!spin.undoneAt && spin.presentationAcknowledgedAt))
        .map((spin) => ({
          id: spin.id,
          sequence: spin.sequence,
          plannedSpinId: spin.plannedSpinId,
          description: spin.description,
          speed: spin.speed,
          countdownSeconds: spin.countdownSeconds,
          chanceMode: spin.chanceMode,
          removeWinnerAfterDraw: spin.removeWinnerAfterDraw,
          winnerDisplayName: publicView ? formatPrizeDrawReelName(spin.winnerDisplayName) : spin.winnerDisplayName,
          winnerPersonId: publicView ? null : spin.winnerPersonId,
          winnerWeight: spin.winnerWeight,
          entrantCount: spin.entrantCount,
          totalWeight: spin.totalWeight,
          duplicateEntryCount: spin.duplicateEntryCount,
          weightBreakdown: weightBreakdowns.get(spin.id) ?? [],
          eligibilityFrozenAt: spin.eligibilityFrozenAt,
          drawnAt: spin.drawnAt,
          undoneAt: spin.undoneAt,
          notificationStatus: publicView ? 'NOT_REQUESTED' : spin.notificationStatus,
        })),
      eligibleEntrantCount: eligible.length,
      eligibleTotalWeight: this.totalWeight(eligible),
      eligibleDuplicateEntryCount: countPrizeDrawDuplicateEntries(eligible),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private async loadWeightBreakdowns(
    records: readonly PrizeDrawRecord[],
  ): Promise<Map<string, PrizeDrawWeightBreakdown[]>> {
    const drawIds = records.filter((record) => record.spins.length > 0).map((record) => record.id);
    const result = new Map<string, PrizeDrawWeightBreakdown[]>();
    if (drawIds.length === 0) return result;
    const groups = await this.prisma.prizeDrawSpinEntry.groupBy({
      by: ['spinId', 'weight'],
      where: { spin: { drawId: { in: drawIds } } },
      _count: { _all: true },
      orderBy: [{ spinId: 'asc' }, { weight: 'asc' }],
    });
    for (const group of groups) {
      const breakdown = result.get(group.spinId) ?? [];
      breakdown.push({ weight: group.weight, peopleCount: group._count._all });
      result.set(group.spinId, breakdown);
    }
    return result;
  }

  private excludedPeopleSummary(exclusions: PrizeDrawRecord['excludedPeople']) {
    const people = new Map<string, string>();
    for (const exclusion of exclusions) {
      const person = exclusion.person.mergedInto ?? exclusion.person;
      people.set(person.id, person.name);
    }
    return [...people.entries()].map(([personId, displayName]) => ({ personId, displayName }));
  }

  private activeWinnerKeys(draw: {
    spins: readonly {
      undoneAt: Date | null;
      winnerEntryKey: string;
      winnerPerson?: { id: string; mergedIntoId: string | null } | null;
    }[];
  }): Set<string> {
    return new Set(draw.spins.filter((spin) => !spin.undoneAt).map((spin) =>
      spin.winnerPerson ? `person:${spin.winnerPerson.mergedIntoId ?? spin.winnerPerson.id}` : spin.winnerEntryKey,
    ));
  }

  private validateInput(input: SavePrizeDrawInput): void {
    if (!input.title.trim()) throw new BadRequestException('Informe um título para o sorteio.');
    const hasEvent = Boolean(input.eventId?.trim());
    const hasMajorEvent = Boolean(input.majorEventId?.trim());
    if (
      (input.targetType === PrizeDrawTargetType.EVENT && (!hasEvent || hasMajorEvent)) ||
      (input.targetType === PrizeDrawTargetType.MAJOR_EVENT && (!hasMajorEvent || hasEvent))
    ) {
      throw new BadRequestException('Vincule o sorteio a um único evento ou grande evento.');
    }
    if (!input.includePresent && !input.includeSubscribers && !input.includeManualEntries) {
      throw new BadRequestException('Selecione ao menos uma fonte de participantes elegíveis.');
    }
    if (input.dramaticCountdownSeconds !== 3 && input.dramaticCountdownSeconds !== 5) {
      throw new BadRequestException('A contagem regressiva deve ter 3 ou 5 segundos.');
    }
    if (input.spinLimit === null || input.spinLimit === undefined) {
      if (input.plannedSpins.length > 0) throw new BadRequestException('Giros planejados exigem uma quantidade definida.');
    } else {
      if (input.plannedSpins.length !== input.spinLimit) {
        throw new BadRequestException('Configure cada giro da quantidade definida.');
      }
      const positions = [...input.plannedSpins].map((spin) => spin.position).sort((a, b) => a - b);
      if (positions.some((position, index) => position !== index + 1)) {
        throw new BadRequestException('As posições dos giros devem ser contínuas e começar em 1.');
      }
      const plannedIds = input.plannedSpins.map((spin) => spin.id).filter((id): id is string => Boolean(id));
      if (new Set(plannedIds).size !== plannedIds.length) {
        throw new BadRequestException('Cada giro planejado existente deve aparecer apenas uma vez.');
      }
    }
    if (!input.includeManualEntries && input.manualEntries.length > 0) {
      throw new BadRequestException('Ative as entradas manuais antes de adicioná-las.');
    }
    if (input.chanceMode !== 'WEIGHTED' && input.weightOverrides.length > 0) {
      throw new BadRequestException('Pesos individuais só podem ser usados no modo ponderado.');
    }
    const personIds = input.manualEntries.map((entry) => entry.personId).filter((id): id is string => Boolean(id));
    if (new Set(personIds).size !== personIds.length) throw new BadRequestException('Uma pessoa manual não pode aparecer duas vezes.');
    const weightedIds = input.weightOverrides.map((entry) => entry.personId);
    if (new Set(weightedIds).size !== weightedIds.length) throw new BadRequestException('Cada pessoa deve ter apenas um peso.');
    if (new Set(input.excludedPersonIds).size !== input.excludedPersonIds.length) {
      throw new BadRequestException('Cada pessoa deve ser excluída apenas uma vez.');
    }
    const weights = [
      ...input.manualEntries.map((entry) => entry.weight),
      ...input.weightOverrides.map((entry) => entry.weight),
    ];
    if (weights.some((weight) => !Number.isInteger(weight) || weight < 1)) {
      throw new BadRequestException('Os pesos devem ser números inteiros positivos.');
    }
  }

  private assertMutableConfiguration(existing: PrizeDrawRecord, input: SavePrizeDrawInput): void {
    const activeSpinCount = existing.spins.filter((spin) => !spin.undoneAt).length;
    const targetChanged = existing.targetType !== input.targetType || existing.eventId !== (input.eventId ?? null) || existing.majorEventId !== (input.majorEventId ?? null);
    if (existing.spins.length > 0 && targetChanged) {
      throw new ConflictException('O vínculo do sorteio não pode mudar depois do primeiro giro real.');
    }
    if (input.spinLimit !== null && input.spinLimit !== undefined && input.spinLimit < activeSpinCount) {
      throw new ConflictException('A quantidade de giros não pode ser menor que os resultados existentes.');
    }
    if (!existing.frozenAt) return;
    const eligibilityChanged =
      existing.includePresent !== input.includePresent ||
      existing.includeSubscribers !== input.includeSubscribers ||
      existing.includeManualEntries !== input.includeManualEntries ||
      existing.chanceMode !== input.chanceMode ||
      JSON.stringify(existing.manualEntries.map((entry) => [entry.id, entry.personId, entry.name, entry.weight]).sort()) !==
        JSON.stringify(input.manualEntries.map((entry) => [entry.id ?? null, entry.personId ?? null, entry.name.trim(), entry.weight]).sort()) ||
      JSON.stringify(existing.weightOverrides.map((entry) => [entry.personId, entry.weight]).sort()) !==
        JSON.stringify(input.weightOverrides.map((entry) => [entry.personId, entry.weight]).sort()) ||
      JSON.stringify(
        existing.excludedPeople.map((entry) => entry.person.mergedInto?.id ?? entry.personId).sort(),
      ) !==
        JSON.stringify([...input.excludedPersonIds].sort());
    if (eligibilityChanged) {
      throw new ConflictException('Descongele a lista antes de alterar elegibilidade, entradas ou pesos.');
    }
  }

  private drawData(input: SavePrizeDrawInput): Prisma.PrizeDrawUncheckedCreateInput {
    return {
      title: input.title.trim(),
      description: normalizePrizeDrawText(input.description),
      targetType: input.targetType as PrismaPrizeDrawTargetType,
      eventId: input.targetType === PrizeDrawTargetType.EVENT ? (input.eventId?.trim() ?? null) : null,
      majorEventId: input.targetType === PrizeDrawTargetType.MAJOR_EVENT ? (input.majorEventId?.trim() ?? null) : null,
      includePresent: input.includePresent,
      includeSubscribers: input.includeSubscribers,
      includeManualEntries: input.includeManualEntries,
      chanceMode: input.chanceMode as PrismaPrizeDrawChanceMode,
      spinLimit: input.spinLimit ?? null,
      removeWinnerAfterDraw: input.removeWinnerAfterDraw,
      defaultSpeed: input.defaultSpeed as PrismaPrizeDrawSpeed,
      dramaticCountdownSeconds: input.dramaticCountdownSeconds,
      notifyWinner: input.notifyWinner,
    };
  }

  private async syncPlannedSpins(tx: Prisma.TransactionClient, drawId: string, input: SavePrizeDrawInput): Promise<void> {
    const keptIds = input.plannedSpins.map((spin) => spin.id).filter((id): id is string => Boolean(id));
    await tx.prizeDrawPlannedSpin.deleteMany({ where: { drawId, ...(keptIds.length ? { id: { notIn: keptIds } } : {}) } });
    for (const planned of input.plannedSpins) {
      const data = {
        position: planned.position,
        description: normalizePrizeDrawText(planned.description),
        speed: planned.speed as PrismaPrizeDrawSpeed,
        countdownSeconds: planned.speed === 'DRAMATIC' ? (planned.countdownSeconds ?? input.dramaticCountdownSeconds) : null,
      };
      if (planned.id) {
        const updated = await tx.prizeDrawPlannedSpin.updateMany({ where: { id: planned.id, drawId }, data });
        if (updated.count !== 1) throw new BadRequestException('Um giro planejado não pertence a este sorteio.');
      } else {
        await tx.prizeDrawPlannedSpin.create({ data: { drawId, ...data } });
      }
    }
  }

  private async syncManualEntries(
    tx: Prisma.TransactionClient,
    drawId: string,
    input: SavePrizeDrawInput,
    actorId: string,
  ): Promise<void> {
    const keptIds = input.manualEntries.map((entry) => entry.id).filter((id): id is string => Boolean(id));
    await tx.prizeDrawManualEntry.deleteMany({ where: { drawId, ...(keptIds.length ? { id: { notIn: keptIds } } : {}) } });
    for (const manual of input.manualEntries) {
      const exactNameMatches = manual.personId
        ? []
        : await tx.people.findMany({
            where: {
              AND: [this.relatedPersonWhere(input)],
              name: { equals: manual.name.trim(), mode: 'insensitive' },
              deletedAt: null,
              mergedIntoId: null,
            },
            select: { id: true, name: true },
            take: 2,
          });
      if (exactNameMatches.length > 1) {
        throw new BadRequestException(`Há mais de um cadastro com o nome “${manual.name.trim()}”. Selecione a pessoa correta.`);
      }
      const person = manual.personId
        ? await tx.people.findFirst({ where: { id: manual.personId, deletedAt: null, mergedIntoId: null }, select: { id: true, name: true } })
        : (exactNameMatches[0] ?? null);
      if (manual.personId && !person) throw new BadRequestException(`Pessoa manual ${manual.personId} não encontrada.`);
      const data = {
        personId: person?.id ?? null,
        name: person?.name ?? manual.name.trim(),
        weight: input.chanceMode === 'WEIGHTED' ? manual.weight : 1,
      };
      if (manual.id) {
        const updated = await tx.prizeDrawManualEntry.updateMany({ where: { id: manual.id, drawId }, data });
        if (updated.count !== 1) throw new BadRequestException('Uma entrada manual não pertence a este sorteio.');
      } else {
        await tx.prizeDrawManualEntry.create({ data: { drawId, ...data, createdById: actorId } });
      }
    }
  }

  private async syncWeightOverrides(tx: Prisma.TransactionClient, drawId: string, input: SavePrizeDrawInput): Promise<void> {
    const personIds = input.weightOverrides.map((entry) => entry.personId);
    if (personIds.length) {
      const people = await tx.people.count({ where: { AND: [this.relatedPersonWhere(input)], id: { in: personIds }, mergedIntoId: null } });
      if (people !== personIds.length) throw new BadRequestException('Um ou mais pesos pertencem a pessoas indisponíveis.');
    }
    await tx.prizeDrawWeightOverride.deleteMany({ where: { drawId, ...(personIds.length ? { personId: { notIn: personIds } } : {}) } });
    for (const override of input.weightOverrides) {
      await tx.prizeDrawWeightOverride.upsert({
        where: { drawId_personId: { drawId, personId: override.personId } },
        create: { drawId, personId: override.personId, weight: override.weight },
        update: { weight: override.weight },
      });
    }
  }

  private async syncExcludedPeople(
    tx: Prisma.TransactionClient,
    drawId: string,
    input: SavePrizeDrawInput,
  ): Promise<void> {
    const personIds = input.excludedPersonIds;
    if (personIds.length) {
      const people = await tx.people.count({
        where: { AND: [this.relatedPersonWhere(input)], id: { in: personIds }, mergedIntoId: null },
      });
      if (people !== personIds.length) {
        throw new BadRequestException('Uma ou mais exclusões pertencem a pessoas indisponíveis.');
      }
    }
    await tx.prizeDrawExcludedPerson.deleteMany({
      where: { drawId, ...(personIds.length ? { personId: { notIn: personIds } } : {}) },
    });
    for (const personId of personIds) {
      await tx.prizeDrawExcludedPerson.upsert({
        where: { drawId_personId: { drawId, personId } },
        create: { drawId, personId },
        update: {},
      });
    }
  }

  private async assertTargetExists(input: SavePrizeDrawInput): Promise<void> {
    const eventId = input.eventId?.trim();
    const majorEventId = input.majorEventId?.trim();
    const target = input.targetType === PrizeDrawTargetType.EVENT
      ? eventId ? await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { id: true } }) : null
      : majorEventId ? await this.prisma.majorEvent.findFirst({ where: { id: majorEventId, deletedAt: null }, select: { id: true } }) : null;
    if (!target) throw new NotFoundException('Evento vinculado ao sorteio não encontrado.');
  }

  private async assertPersonInputsScoped(input: SavePrizeDrawInput): Promise<void> {
    const personIds = [...new Set([
      ...input.manualEntries.map((entry) => entry.personId),
      ...input.weightOverrides.map((entry) => entry.personId),
      ...input.excludedPersonIds,
    ].filter((id): id is string => Boolean(id)))];
    if (personIds.length === 0) return;
    const count = await this.prisma.people.count({
      where: { AND: [this.relatedPersonWhere(input)], id: { in: personIds }, mergedIntoId: null },
    });
    if (count !== personIds.length) {
      throw new BadRequestException('Uma ou mais pessoas não pertencem ao escopo do sorteio.');
    }
  }

  private relatedPersonWhere(input: Pick<SavePrizeDrawInput, 'targetType' | 'eventId' | 'majorEventId'>): Prisma.PeopleWhereInput {
    const eventWhere: Prisma.EventWhereInput = input.targetType === PrizeDrawTargetType.EVENT
      ? { id: input.eventId?.trim() || undefined, deletedAt: null }
      : { majorEventId: input.majorEventId?.trim() || undefined, deletedAt: null };
    return {
      deletedAt: null,
      OR: [
        { eventSubscriptions: { some: { deletedAt: null, event: eventWhere } } },
        { attendances: { some: { event: eventWhere } } },
        { lectures: { some: { event: eventWhere } } },
        { attendanceCollectorFor: { some: { event: eventWhere } } },
        ...(input.targetType === PrizeDrawTargetType.MAJOR_EVENT && input.majorEventId
          ? [
              { majorEventSubscriptions: { some: { deletedAt: null, majorEventId: input.majorEventId } } },
              { eventGroupSubscriptions: { some: { deletedAt: null, eventGroup: { majorEventId: input.majorEventId, deletedAt: null } } } },
              { sportsTournamentParticipants: { some: { deletedAt: null, tournament: { majorEventId: input.majorEventId } } } },
              { sportsOfficialAssignments: { some: { active: true, revokedAt: null, tournament: { majorEventId: input.majorEventId } } } },
            ] satisfies Prisma.PeopleWhereInput[]
          : []),
      ],
    };
  }

  private async assertPublicTarget(input: { eventId?: string; majorEventId?: string; eventGroupId?: string }): Promise<void> {
    const visible = input.eventId
      ? await this.prisma.event.findFirst({ where: { AND: [PUBLIC_EVENT_WHERE, { id: input.eventId }] }, select: { id: true } })
      : input.majorEventId
        ? await this.prisma.majorEvent.findFirst({ where: { ...PUBLIC_MAJOR_EVENT_WHERE, id: input.majorEventId }, select: { id: true } })
        : await this.prisma.eventGroup.findFirst({
            where: {
              id: input.eventGroupId,
              deletedAt: null,
              events: { some: PUBLIC_EVENT_WHERE },
            },
            select: { id: true },
          });
    if (!visible) throw new NotFoundException('Página pública de sorteios não encontrada.');
  }

  private scopedTargetWhere(targets: { eventIds: Set<string>; majorEventIds: Set<string>; eventGroupIds: Set<string> }): Prisma.PrizeDrawWhereInput[] {
    return [
      ...(targets.eventIds.size ? [{ eventId: { in: [...targets.eventIds] } }] : []),
      ...(targets.majorEventIds.size ? [
        { majorEventId: { in: [...targets.majorEventIds] } },
        { event: { OR: [{ majorEventId: { in: [...targets.majorEventIds] } }, { eventGroup: { majorEventId: { in: [...targets.majorEventIds] } } }] } },
      ] : []),
      ...(targets.eventGroupIds.size ? [{ event: { eventGroupId: { in: [...targets.eventGroupIds] } } }] : []),
    ];
  }

  private async publicAudienceWhere(
    user: AuthenticatedUser | undefined,
  ): Promise<Prisma.PrizeDrawWhereInput | null> {
    const adminTargets = await this.policy.accessibleEventTargets(user, Permission.PrizeDraw.Read);
    if (adminTargets === null) return null;

    const clauses = this.scopedTargetWhere(adminTargets);
    const personIds = await this.publicAudiencePersonIds(user);
    if (personIds.length > 0) {
      clauses.push({
        spins: {
          some: {
            undoneAt: null,
            presentationAcknowledgedAt: { not: null },
            entries: { some: { personId: { in: personIds } } },
          },
        },
      });
    }
    return clauses.length > 0 ? { OR: clauses } : { id: '__unauthorized_prize_draw_audience__' };
  }

  private async publicAudiencePersonIds(user: AuthenticatedUser | undefined): Promise<string[]> {
    if (!user?.sub) return [];
    const people = await this.prisma.people.findMany({
      where: {
        deletedAt: null,
        OR: [{ userId: user.sub }, { mergedInto: { userId: user.sub } }],
      },
      select: { id: true, mergedIntoId: true },
    });
    return [...new Set(people.flatMap((person) => [person.id, person.mergedIntoId]).filter((id): id is string => Boolean(id)))];
  }

  private async requireDraw(drawId: string): Promise<PrizeDrawRecord> {
    const draw = await this.prisma.prizeDraw.findFirst({
      where: { id: drawId, deletedAt: null },
      include: DRAW_INCLUDE,
    });
    if (!draw) throw new NotFoundException('Sorteio não encontrado.');
    return draw;
  }

  private async lockDraw(tx: Prisma.TransactionClient, drawId: string): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${drawId}))`;
  }

  private requireActorId(actor: AuthenticatedUser | undefined): string {
    if (!actor?.sub) throw new BadRequestException('Não foi possível identificar a pessoa administradora.');
    return actor.sub;
  }
}
