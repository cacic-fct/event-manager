import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogActorType,
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  PublicationState,
  SportsLossReason,
  SportsMatchAction,
  SportsMatchActionType,
  SportsMatchState,
  SportsReviewStatus,
  SportsRosterEntryStatus,
  SportsRosterStatus,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditActor } from '../../audit-log/audit-log.types';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserDefaultRedirectService } from '../../current-user/default-redirect/current-user-default-redirect.service';
import { SportsBracketAdvancementService } from '../brackets/sports-bracket-advancement.service';
import {
  assertSportsOutcomeMatchesRules,
  assertSportsScoreDeltaMatchesRules,
  normalizeSportsScoreRules,
} from '../domain/sports-score-rules';
import { normalizeSportsScoreboard } from '../domain/sports-scoreboard';
import { SportsRealtimeService } from '../realtime/sports-realtime.service';
import {
  mergeSportsStructuralInvalidations,
  SportsStructuralInvalidation,
} from '../realtime/sports-structural-invalidation';
import { SportsAutoroutingService } from '../routing/sports-autorouting.service';
import { SportsStandingsService } from '../scoring/sports-standings.service';
import { isSportsMatchPublic } from '../security/sports-public-visibility';
import { runSerializableSportsTransaction } from '../sports-transaction';
import {
  projectSportsMatch,
  SportsProjectedOutcome,
} from './sports-match-projector';

export type SportsMatchActorKind = 'ADMIN' | 'OFFICIAL' | 'LINEUP_MANAGER';

export interface SportsMatchCommandActor {
  personId?: string | null;
  userId?: string | null;
  role: string;
  kind: SportsMatchActorKind;
  auditActor: AuthenticatedUser | AuditActor;
}

export interface SportsMatchCommandInput {
  clientId: string;
  matchId: string;
  baseRevision: number;
  type: SportsMatchActionType;
  payload: unknown;
  scorerRosterEntryId?: string | null;
  authoredAt: Date;
  offline?: boolean;
}

interface MatchProjectionContext {
  id: string;
  eventId: string;
  categoryId: string;
  revision: number;
  state: SportsMatchState;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  category: {
    eventGroupId: string;
    maximumPeriods: number | null;
    periodLabel: string | null;
    periodsEnabled: boolean;
    scoreRules: Prisma.JsonValue;
    tournament: {
      majorEventId: string;
    };
  };
}

@Injectable()
export class SportsMatchOperationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly advancement: SportsBracketAdvancementService,
    private readonly standings: SportsStandingsService,
    private readonly realtime: SportsRealtimeService,
    private readonly autorouting: SportsAutoroutingService,
    private readonly defaultRedirect: CurrentUserDefaultRedirectService,
    private readonly auditLog: AuditLogService,
    private readonly frozen: FrozenResourceService,
  ) {}

  async commit(
    inputs: SportsMatchCommandInput[],
    actor: SportsMatchCommandActor,
  ): Promise<SportsMatchAction[]> {
    if (inputs.length === 0 || inputs.length > 100) {
      throw new BadRequestException('Envie de uma a cem ações de partida por lote.');
    }
    const matchIds = new Set(inputs.map((input) => input.matchId));
    if (matchIds.size !== 1) {
      throw new BadRequestException('Um lote offline deve conter ações de uma única partida.');
    }

    const result = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const committed: SportsMatchAction[] = [];
      const structuralInvalidations: SportsStructuralInvalidation[][] = [];
      for (const input of inputs) {
        committed.push(await this.commitOne(tx, input, actor));
      }
      const match = await this.refreshProjection(tx, inputs[0].matchId, actor.userId ?? actor.personId ?? null);
      if (
        actor.kind === 'ADMIN' &&
        match.reviewStatus === SportsReviewStatus.APPROVED
      ) {
        const actorId = actor.userId ?? actor.personId ?? 'system';
        structuralInvalidations.push(
          (await this.standings.reconcileAfterProjectionChange(
            tx,
            match.id,
            actorId,
          )) ?? [],
        );
        structuralInvalidations.push(
          (await this.advancement.reconcileAfterProjectionChange(
            tx,
            match.id,
            actorId,
          )) ?? [],
        );
      }
      return {
        committed,
        match,
        structuralInvalidations: mergeSportsStructuralInvalidations(
          ...structuralInvalidations,
        ),
      };
    });

    await this.publishProjection(result.match);
    await this.realtime.publishStructuralInvalidations(
      result.structuralInvalidations,
    );
    await this.invalidateRoutes(result.match.id);
    return result.committed;
  }

  async review(
    actionId: string,
    decision: SportsReviewStatus,
    actor: AuthenticatedUser,
    options: {
      reviewMessage?: string | null;
      correctedPayload?: unknown;
    } = {},
  ) {
    if (
      !(
        [
          SportsReviewStatus.APPROVED,
          SportsReviewStatus.REJECTED,
          SportsReviewStatus.CHANGES_REQUESTED,
        ] as SportsReviewStatus[]
      ).includes(decision)
    ) {
      throw new BadRequestException('Decisão de análise inválida.');
    }
    if (!actor.sub) {
      throw new BadRequestException('O administrador autenticado não possui identificador.');
    }
    const actorId = actor.sub;
    const result = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const structuralInvalidations: SportsStructuralInvalidation[][] = [];
      const action = await tx.sportsMatchAction.findUnique({
        where: { id: actionId },
        include: {
          match: {
            include: {
              category: {
                select: {
                  eventGroupId: true,
                  maximumPeriods: true,
                  periodLabel: true,
                  periodsEnabled: true,
                  scoreRules: true,
                  tournament: { select: { majorEventId: true } },
                },
              },
            },
          },
        },
      });
      if (!action) {
        throw new NotFoundException(`Sports match action ${actionId} was not found.`);
      }
      await this.frozen.assertEventMutable(action.match.eventId, actor, 'edit');
      if (
        !(
          [
            SportsReviewStatus.PENDING,
            SportsReviewStatus.CHANGES_REQUESTED,
          ] as SportsReviewStatus[]
        ).includes(action.reviewStatus)
      ) {
        throw new ConflictException('Esta ação já foi analisada.');
      }

      const payload =
        options.correctedPayload === undefined
          ? action.payload
          : this.normalizePayload(options.correctedPayload);
      if (decision === SportsReviewStatus.APPROVED) {
        const current = await this.loadProjection(
          tx,
          action.matchId,
          true,
          action.sequence,
        );
        this.validateCommand(
          action.type,
          payload,
          current,
          action.match,
          'ADMIN',
        );
      }
      const reviewed = await tx.sportsMatchAction.update({
        where: { id: action.id },
        data: {
          reviewStatus: decision,
          payload: payload as Prisma.InputJsonValue,
          reviewedAt: new Date(),
          reviewedById: actorId,
          reviewMessage: options.reviewMessage?.trim() || null,
        },
      });
      const match = await this.refreshProjection(tx, action.matchId, actorId);
      if (match.reviewStatus === SportsReviewStatus.APPROVED) {
        structuralInvalidations.push(
          (await this.standings.reconcileAfterProjectionChange(
            tx,
            match.id,
            actorId,
          )) ?? [],
        );
        structuralInvalidations.push(
          (await this.advancement.reconcileAfterProjectionChange(
            tx,
            match.id,
            actorId,
          )) ?? [],
        );
      }
      await this.recordAudit(
        tx,
        action.match,
        actor,
        reviewed,
        decision === SportsReviewStatus.APPROVED
          ? AuditLogOperation.APPROVE
          : decision === SportsReviewStatus.REJECTED
            ? AuditLogOperation.REJECT
            : AuditLogOperation.REQUEST_CHANGES,
      );
      return {
        action: reviewed,
        match,
        structuralInvalidations: mergeSportsStructuralInvalidations(
          ...structuralInvalidations,
        ),
      };
    });
    await this.publishProjection(result.match);
    await this.realtime.publishStructuralInvalidations(
      result.structuralInvalidations,
    );
    await this.invalidateRoutes(result.match.id);
    return result.action;
  }

  private async commitOne(
    tx: Prisma.TransactionClient,
    input: SportsMatchCommandInput,
    actor: SportsMatchCommandActor,
  ): Promise<SportsMatchAction> {
    const clientId = this.normalizeClientId(input.clientId);
    const payload = this.normalizePayload(input.payload);
    const payloadHash = this.hashCommand(input, payload);
    const existing = await tx.sportsMatchAction.findUnique({ where: { clientId } });
    if (existing) {
      if (
        existing.matchId !== input.matchId ||
        existing.type !== input.type ||
        existing.payloadHash !== payloadHash
      ) {
        throw new ConflictException(
          'O identificador offline já foi usado por uma ação diferente.',
        );
      }
      return existing;
    }

    const match = await tx.sportsMatch.findFirst({
      where: { id: input.matchId, deletedAt: null },
      include: {
        category: {
          select: {
            eventGroupId: true,
            maximumPeriods: true,
            periodLabel: true,
            periodsEnabled: true,
            scoreRules: true,
            tournament: { select: { id: true, majorEventId: true } },
          },
        },
      },
    });
    if (!match) {
      throw new NotFoundException(`Sports match ${input.matchId} was not found.`);
    }
    await this.frozen.assertEventMutable(
      match.eventId,
      this.authenticatedActor(actor.auditActor),
      'edit',
    );
    this.assertActorMaySubmit(input.type, actor.kind);
    const authoredAt = this.validateAuthoredAt(input.authoredAt);
    const safeRebase =
      input.type === SportsMatchActionType.SCORE_DELTA &&
      input.baseRevision >= 1 &&
      input.baseRevision <= match.revision;
    if (input.baseRevision !== match.revision && !safeRebase) {
      throw new ConflictException({
        message: 'A partida mudou. Recarregue os dados antes de enviar esta ação.',
        expectedRevision: match.revision,
        receivedRevision: input.baseRevision,
      });
    }

    const current = await this.loadProjection(tx, match.id, false);
    this.validateCommand(input.type, payload, current, match, actor.kind);
    if (input.type === SportsMatchActionType.OCCURRENCE) {
      await this.validateOccurrence(tx, match, this.requireRecord(payload));
    }
    if (input.scorerRosterEntryId) {
      await this.validateScorer(
        tx,
        match,
        input.scorerRosterEntryId,
        payload,
      );
    }

    const sequence = match.operationSequence + 1;
    const action = await tx.sportsMatchAction.create({
      data: {
        clientId,
        matchId: match.id,
        payloadHash,
        baseRevision: input.baseRevision,
        sequence,
        type: input.type,
        payload,
        reviewStatus:
          actor.kind === 'ADMIN'
            ? SportsReviewStatus.APPROVED
            : SportsReviewStatus.PENDING,
        scorerRosterEntryId: input.scorerRosterEntryId ?? null,
        actorPersonId: actor.personId ?? null,
        actorUserId: actor.userId ?? null,
        actorRole: actor.role,
        authoredAt,
        offline: input.offline ?? false,
        ...(actor.kind === 'ADMIN'
          ? {
              reviewedAt: new Date(),
              reviewedById: actor.userId ?? null,
            }
          : {}),
      },
    });
    const updated = await tx.sportsMatch.updateMany({
      where: {
        id: match.id,
        operationSequence: match.operationSequence,
        revision: match.revision,
      },
      data: {
        operationSequence: sequence,
        revision: { increment: 1 },
        updatedById: actor.userId ?? actor.personId ?? null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException('A partida mudou durante o envio da ação.');
    }
    if (input.type === SportsMatchActionType.RESCHEDULE) {
      const schedule = this.readRescheduleDates(this.requireRecord(payload));
      await tx.event.update({
        where: { id: match.eventId },
        data: {
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          updatedById: actor.userId ?? actor.personId ?? null,
        },
      });
    }
    await this.recordAudit(
      tx,
      match,
      actor.auditActor,
      action,
      this.auditOperation(action.type),
    );
    return action;
  }

  private async refreshProjection(
    tx: Prisma.TransactionClient,
    matchId: string,
    actorId: string | null,
  ) {
    const match = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: matchId },
      include: {
        category: {
          select: {
            eventGroupId: true,
            maximumPeriods: true,
            periodLabel: true,
            periodsEnabled: true,
            scoreRules: true,
            tournament: { select: { majorEventId: true } },
          },
        },
        event: {
          select: {
            deletedAt: true,
            publiclyVisible: true,
            publicationState: true,
          },
        },
        actions: { orderBy: { sequence: 'asc' } },
        rosters: {
          where: { deletedAt: null },
          select: {
            entries: {
              where: { deletedAt: null, checkedInAt: { not: null } },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    const hasCheckedInPlayers = match.rosters.some((roster) => roster.entries.length > 0);
    const common = {
      hasCheckedInPlayers,
      maximumPeriods: match.category.maximumPeriods,
      periodLabel: match.category.periodLabel,
    };
    const provisional = projectSportsMatch(match.actions, {
      ...common,
      approvedOnly: false,
    });
    const canonical = projectSportsMatch(match.actions, {
      ...common,
      approvedOnly: true,
    });
    const reviewStatus = this.resolveMatchReviewStatus(match.actions);
    const terminalStates: SportsMatchState[] = [
      SportsMatchState.FINISHED,
      SportsMatchState.DRAW,
      SportsMatchState.CANCELED,
    ];
    const consolidatedOccurrences = match.actions
      .filter(
        (action) =>
          action.type === SportsMatchActionType.OCCURRENCE &&
          action.reviewStatus !== SportsReviewStatus.REJECTED,
      )
      .map((action) => ({
        id: action.id,
        clientId: action.clientId,
        sequence: action.sequence,
        authoredAt: action.authoredAt.toISOString(),
        actorRole: action.actorRole,
        reviewStatus: action.reviewStatus,
        payload: action.payload,
      }));
    return tx.sportsMatch.update({
      where: { id: match.id },
      data: {
        state: provisional.state,
        canonicalState: canonical.state,
        reviewStatus,
        scoreboard: this.toJson(provisional.scoreboard),
        canonicalScoreboard: this.toJson(canonical.scoreboard),
        winnerRegistrationId: provisional.winnerRegistrationId,
        loserRegistrationId: provisional.loserRegistrationId,
        lossReason: provisional.lossReason,
        lossReasonDetail: provisional.lossReasonDetail,
        drawWillReschedule: provisional.drawWillReschedule,
        timerStartedAt: provisional.timerStartedAt,
        timerPausedAt: provisional.timerPausedAt,
        elapsedBeforePauseMs: provisional.elapsedBeforePauseMs,
        ...(terminalStates.includes(provisional.state)
          ? { occurrences: this.toJson(consolidatedOccurrences) }
          : {}),
        updatedById: actorId,
      },
      include: {
        category: {
          select: {
            deletedAt: true,
            eventGroupId: true,
            status: true,
            tournament: {
              select: {
                id: true,
                majorEventId: true,
                deletedAt: true,
                status: true,
                majorEvent: {
                  select: {
                    deletedAt: true,
                    publicationState: true,
                  },
                },
              },
            },
          },
        },
        event: {
          select: {
            deletedAt: true,
            publiclyVisible: true,
            publicationState: true,
          },
        },
      },
    });
  }

  private async loadProjection(
    tx: Prisma.TransactionClient,
    matchId: string,
    approvedOnly: boolean,
    beforeSequence?: number,
  ): Promise<SportsProjectedOutcome> {
    const match = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: matchId },
      select: {
        category: {
          select: {
            maximumPeriods: true,
            periodLabel: true,
          },
        },
        actions: {
          ...(beforeSequence === undefined
            ? {}
            : { where: { sequence: { lt: beforeSequence } } }),
          orderBy: { sequence: 'asc' },
        },
        rosters: {
          where: { deletedAt: null },
          select: {
            entries: {
              where: { deletedAt: null, checkedInAt: { not: null } },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    return projectSportsMatch(match.actions, {
      approvedOnly,
      hasCheckedInPlayers: match.rosters.some((roster) => roster.entries.length > 0),
      maximumPeriods: match.category.maximumPeriods,
      periodLabel: match.category.periodLabel,
    });
  }

  private validateCommand(
    type: SportsMatchActionType,
    payloadValue: Prisma.InputJsonValue | Prisma.JsonValue,
    current: SportsProjectedOutcome,
    match: Pick<
      MatchProjectionContext,
      'homeRegistrationId' | 'awayRegistrationId' | 'category'
    >,
    actorKind: SportsMatchActorKind,
  ): void {
    const payload = this.requireRecord(payloadValue);
    const activeStates: SportsMatchState[] = [
      SportsMatchState.LIVE,
      SportsMatchState.PAUSED,
    ];
    if (
      (
        [
          SportsMatchActionType.SCORE_DELTA,
          SportsMatchActionType.PERIOD_ROLL,
        ] as SportsMatchActionType[]
      ).includes(type) &&
      !activeStates.includes(current.state)
    ) {
      throw new ConflictException('A partida precisa estar ao vivo para registrar placar.');
    }
    if (type === SportsMatchActionType.OCCURRENCE) {
      const kind =
        typeof payload['kind'] === 'string' ? payload['kind'].trim() : '';
      const occurrenceId =
        typeof payload['occurrenceId'] === 'string'
          ? payload['occurrenceId'].trim()
          : '';
      const note =
        typeof payload['note'] === 'string' ? payload['note'].trim() : '';
      if (!occurrenceId || occurrenceId.length > 100) {
        throw new BadRequestException(
          'Informe um identificador válido para a ocorrência.',
        );
      }
      if (!kind || kind.length > 80) {
        throw new BadRequestException('Informe o tipo da ocorrência.');
      }
      if (note.length > 1000) {
        throw new BadRequestException(
          'A observação da ocorrência deve ter no máximo 1000 caracteres.',
        );
      }
    }
    if (
      type === SportsMatchActionType.PERIOD_ROLL &&
      !match.category.periodsEnabled
    ) {
      throw new ConflictException('Esta modalidade não utiliza períodos ou sets.');
    }
    if (
      type === SportsMatchActionType.SCORE_CORRECTION &&
      actorKind !== 'ADMIN' &&
      !activeStates.includes(current.state)
    ) {
      throw new ConflictException(
        'A partida precisa estar ao vivo para corrigir o placar.',
      );
    }
    if (
      type === SportsMatchActionType.START &&
      !(
        [
          SportsMatchState.SCHEDULED,
          SportsMatchState.CHECK_IN,
        ] as SportsMatchState[]
      ).includes(current.state)
    ) {
      throw new ConflictException('A partida não pode ser iniciada neste estado.');
    }
    if (
      type === SportsMatchActionType.START &&
      (!match.homeRegistrationId || !match.awayRegistrationId)
    ) {
      throw new ConflictException(
        'Defina as duas equipes antes de iniciar a partida.',
      );
    }
    if (type === SportsMatchActionType.PAUSE && current.state !== SportsMatchState.LIVE) {
      throw new ConflictException('Somente uma partida ao vivo pode ser pausada.');
    }
    if (type === SportsMatchActionType.RESUME && current.state !== SportsMatchState.PAUSED) {
      throw new ConflictException('Somente uma partida pausada pode ser retomada.');
    }
    if (
      (
        [
          SportsMatchActionType.FINALIZE,
          SportsMatchActionType.FORFEIT,
        ] as SportsMatchActionType[]
      ).includes(type)
    ) {
      if (
        !(
          [
            SportsMatchState.SCHEDULED,
            SportsMatchState.CHECK_IN,
            SportsMatchState.LIVE,
            SportsMatchState.PAUSED,
          ] as SportsMatchState[]
        ).includes(current.state)
      ) {
        throw new ConflictException(
          'A partida não pode ser finalizada neste estado.',
        );
      }
      this.validateOutcome(payload, current, match);
    }
    if (
      type === SportsMatchActionType.CANCEL &&
      !(
        [
          SportsMatchState.SCHEDULED,
          SportsMatchState.CHECK_IN,
          SportsMatchState.LIVE,
          SportsMatchState.PAUSED,
        ] as SportsMatchState[]
      ).includes(current.state)
    ) {
      throw new ConflictException('A partida não pode ser cancelada neste estado.');
    }
    if (
      actorKind === 'LINEUP_MANAGER' &&
      type === SportsMatchActionType.FORFEIT &&
      !(
        [
          SportsMatchState.SCHEDULED,
          SportsMatchState.CHECK_IN,
        ] as SportsMatchState[]
      ).includes(current.state)
    ) {
      throw new ConflictException(
        'Capitães e técnicos só podem desistir antes do início da partida.',
      );
    }
    if (type === SportsMatchActionType.SCORE_DELTA) {
      if (payload['side'] !== 'HOME' && payload['side'] !== 'AWAY') {
        throw new BadRequestException('Selecione o lado do placar.');
      }
      if (
        typeof payload['amount'] !== 'number' ||
        !Number.isFinite(payload['amount']) ||
        payload['amount'] === 0
      ) {
        throw new BadRequestException('A alteração de placar deve ser um número diferente de zero.');
      }
      try {
        assertSportsScoreDeltaMatchesRules(
          payload['amount'],
          normalizeSportsScoreRules(match.category.scoreRules),
        );
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Alteração de placar inválida.',
        );
      }
    }
    if (type === SportsMatchActionType.SCORE_CORRECTION) {
      try {
        normalizeSportsScoreboard(payload['scoreboard']);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Correção de placar inválida.',
        );
      }
    }
    if (
      actorKind !== 'ADMIN' &&
      (
        [
          SportsMatchActionType.RESET,
          SportsMatchActionType.RESCHEDULE,
        ] as SportsMatchActionType[]
      ).includes(type)
    ) {
      throw new BadRequestException('Somente administradores podem redefinir ou reagendar a partida.');
    }
    if (type === SportsMatchActionType.RESCHEDULE) {
      this.readRescheduleDates(payload);
    }
  }

  private validateOutcome(
    payload: Record<string, unknown>,
    current: SportsProjectedOutcome,
    match: Pick<
      MatchProjectionContext,
      'homeRegistrationId' | 'awayRegistrationId' | 'category'
    >,
  ): void {
    const scoreboard =
      payload['scoreboard'] === undefined
        ? current.scoreboard
        : normalizeSportsScoreboard(payload['scoreboard']);
    if (payload['draw'] === true) {
      if (payload['winnerRegistrationId'] || payload['loserRegistrationId']) {
        throw new BadRequestException('Um empate não pode possuir vencedor ou perdedor.');
      }
      try {
        assertSportsOutcomeMatchesRules({
          draw: true,
          drawWillReschedule: payload['drawWillReschedule'] === true,
          scoreboard,
          winnerSide: null,
          lossReason: null,
          rules: normalizeSportsScoreRules(match.category.scoreRules),
        });
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Resultado inválido.',
        );
      }
      return;
    }
    const winner = this.readString(payload['winnerRegistrationId']);
    const loser = this.readString(payload['loserRegistrationId']);
    const participants = new Set(
      [match.homeRegistrationId, match.awayRegistrationId].filter(
        (id): id is string => Boolean(id),
      ),
    );
    if (
      !winner ||
      !loser ||
      winner === loser ||
      !participants.has(winner) ||
      !participants.has(loser)
    ) {
      throw new BadRequestException('Revise as equipes vencedora e perdedora.');
    }
    if (
      typeof payload['lossReason'] !== 'string' ||
      !Object.values(SportsLossReason).includes(
        payload['lossReason'] as SportsLossReason,
      )
    ) {
      throw new BadRequestException('Informe o motivo da derrota.');
    }
    try {
      assertSportsOutcomeMatchesRules({
        draw: false,
        drawWillReschedule: false,
        scoreboard,
        winnerSide:
          winner === match.homeRegistrationId ? 'HOME' : 'AWAY',
        lossReason: payload['lossReason'] as SportsLossReason,
        rules: normalizeSportsScoreRules(match.category.scoreRules),
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Resultado inválido.',
      );
    }
  }

  private async validateScorer(
    tx: Prisma.TransactionClient,
    match: Pick<
      MatchProjectionContext,
      'id' | 'homeRegistrationId' | 'awayRegistrationId'
    >,
    rosterEntryId: string,
    payloadValue: Prisma.InputJsonValue,
  ): Promise<void> {
    const payload = this.requireRecord(payloadValue);
    const expectedRegistrationId =
      payload['side'] === 'HOME'
        ? match.homeRegistrationId
        : payload['side'] === 'AWAY'
          ? match.awayRegistrationId
          : null;
    const entry = await tx.sportsMatchRosterEntry.findFirst({
      where: {
        id: rosterEntryId,
        deletedAt: null,
        status: SportsRosterEntryStatus.APPROVED,
        roster: {
          matchId: match.id,
          registrationId: expectedRegistrationId ?? undefined,
          status: SportsRosterStatus.APPROVED,
          deletedAt: null,
        },
      },
      select: { id: true },
    });
    if (!entry) {
      throw new BadRequestException('O autor do ponto não pertence à escalação aprovada.');
    }
  }

  private async validateOccurrence(
    tx: Prisma.TransactionClient,
    match: MatchProjectionContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const registrationId =
      typeof payload['registrationId'] === 'string'
        ? payload['registrationId'].trim()
        : null;
    if (
      registrationId &&
      registrationId !== match.homeRegistrationId &&
      registrationId !== match.awayRegistrationId
    ) {
      throw new BadRequestException(
        'A equipe da ocorrência não participa desta partida.',
      );
    }
    const rosterEntryId =
      typeof payload['rosterEntryId'] === 'string'
        ? payload['rosterEntryId'].trim()
        : null;
    if (!rosterEntryId) {
      return;
    }
    const entry = await tx.sportsMatchRosterEntry.findFirst({
      where: {
        id: rosterEntryId,
        deletedAt: null,
        roster: {
          matchId: match.id,
          deletedAt: null,
        },
      },
      select: { id: true },
    });
    if (!entry) {
      throw new BadRequestException(
        'A pessoa da ocorrência não pertence à escalação da partida.',
      );
    }
  }

  private assertActorMaySubmit(
    type: SportsMatchActionType,
    actorKind: SportsMatchActorKind,
  ): void {
    if (
      actorKind === 'LINEUP_MANAGER' &&
      type !== SportsMatchActionType.FORFEIT
    ) {
      throw new BadRequestException('Capitães e técnicos somente podem desistir antes da partida.');
    }
  }

  private resolveMatchReviewStatus(
    actions: Array<Pick<SportsMatchAction, 'reviewStatus' | 'type'>>,
  ): SportsReviewStatus {
    if (actions.some((action) => action.reviewStatus === SportsReviewStatus.PENDING)) {
      return SportsReviewStatus.PENDING;
    }
    if (
      actions.some(
        (action) => action.reviewStatus === SportsReviewStatus.CHANGES_REQUESTED,
      )
    ) {
      return SportsReviewStatus.CHANGES_REQUESTED;
    }
    const visible = actions.filter(
      (action) => action.reviewStatus !== SportsReviewStatus.REJECTED,
    );
    if (visible.length === 0) {
      return SportsReviewStatus.NOT_REQUIRED;
    }
    return SportsReviewStatus.APPROVED;
  }

  private readRescheduleDates(payload: Record<string, unknown>): {
    startDate: Date;
    endDate: Date;
  } {
    const startDate = new Date(this.readString(payload['startDate']) ?? '');
    const endDate = new Date(this.readString(payload['endDate']) ?? '');
    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) ||
      endDate.getTime() <= startDate.getTime()
    ) {
      throw new BadRequestException(
        'Informe início e fim válidos para reagendar a partida.',
      );
    }
    return { startDate, endDate };
  }

  private authenticatedActor(
    actor: AuthenticatedUser | AuditActor,
  ): AuthenticatedUser | undefined {
    return 'permissions' in actor || 'permissionSet' in actor
      ? (actor as AuthenticatedUser)
      : undefined;
  }

  private async recordAudit(
    tx: Prisma.TransactionClient,
    match: MatchProjectionContext,
    actor: AuthenticatedUser | AuditActor,
    action: Pick<
      SportsMatchAction,
      'id' | 'type' | 'sequence' | 'reviewStatus' | 'offline'
    >,
    operation: AuditLogOperation,
  ): Promise<void> {
    await this.auditLog.record(
      {
        entityType: AuditLogEntityType.SPORTS_MATCH_ACTION,
        entityId: action.id,
        entityLabel: `Ação ${action.sequence} da partida ${match.id}`,
        operation,
        actor,
        after: {
          matchId: match.id,
          type: action.type,
          sequence: action.sequence,
          reviewStatus: action.reviewStatus,
          offline: action.offline,
        },
        summary: 'Ação de partida registrada.',
        scope: {
          majorEventId: match.category.tournament.majorEventId,
          eventGroupId: match.category.eventGroupId,
          eventId: match.eventId,
        },
        force: true,
      },
      tx,
    );
  }

  private auditOperation(type: SportsMatchActionType): AuditLogOperation {
    switch (type) {
      case SportsMatchActionType.START:
        return AuditLogOperation.START;
      case SportsMatchActionType.PAUSE:
        return AuditLogOperation.PAUSE;
      case SportsMatchActionType.RESUME:
        return AuditLogOperation.RESUME;
      case SportsMatchActionType.SCORE_DELTA:
      case SportsMatchActionType.SCORE_CORRECTION:
      case SportsMatchActionType.PERIOD_ROLL:
        return AuditLogOperation.SCORE;
      case SportsMatchActionType.FINALIZE:
      case SportsMatchActionType.FORFEIT:
      case SportsMatchActionType.CANCEL:
        return AuditLogOperation.FINALIZE;
      default:
        return AuditLogOperation.UPDATE;
    }
  }

  private async publishProjection(match: {
    id: string;
    categoryId: string;
    state: SportsMatchState;
    canonicalState: SportsMatchState;
    reviewStatus: SportsReviewStatus;
    scoreboard: Prisma.JsonValue;
    revision: number;
    category: {
      deletedAt: Date | null;
      status: import('@prisma/client').SportsCategoryStatus;
      tournament: {
        id: string;
        deletedAt: Date | null;
        status: import('@prisma/client').SportsTournamentStatus;
        majorEvent: {
          deletedAt: Date | null;
          publicationState: PublicationState;
        };
      };
    };
    event: {
      deletedAt: Date | null;
      publiclyVisible: boolean;
      publicationState: PublicationState;
    };
  }): Promise<void> {
    const payload = {
      matchId: match.id,
      categoryId: match.categoryId,
      state: match.state,
      canonicalState: match.canonicalState,
      reviewStatus: match.reviewStatus,
      scoreboard: match.scoreboard,
      revision: match.revision,
    };
    const isPublic = isSportsMatchPublic(match);
    await Promise.all([
      ...(isPublic
        ? [
            this.realtime.publish(
              this.realtime.scope('match', match.id),
              payload,
            ),
            this.realtime.publish(
              this.realtime.scope(
                'tournament',
                match.category.tournament.id,
              ),
              payload,
            ),
          ]
        : []),
      ...(match.reviewStatus === SportsReviewStatus.PENDING
        ? [
            this.realtime.publish(
              this.realtime.scope('review', match.id),
              payload,
            ),
          ]
        : []),
    ]);
  }

  private async invalidateRoutes(matchId: string): Promise<void> {
    const people = await this.autorouting.affectedPeopleForMatch(matchId);
    await Promise.all([
      this.defaultRedirect.invalidatePeople(people),
      this.realtime.publishAutorouteInvalidations(people),
    ]);
  }

  private normalizeClientId(value: string): string {
    const normalized = value.trim();
    if (!/^[a-zA-Z0-9_-]{12,120}$/.test(normalized)) {
      throw new BadRequestException('Identificador offline inválido.');
    }
    return normalized;
  }

  private normalizePayload(value: unknown): Prisma.InputJsonValue {
    const serialized = JSON.stringify(this.sortJson(value));
    if (!serialized || serialized.length > 32_000) {
      throw new BadRequestException('Conteúdo da ação de partida inválido ou muito grande.');
    }
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }

  private sortJson(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortJson(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.sortJson(item)]),
      );
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      return value;
    }
    throw new BadRequestException('A ação contém um valor não suportado.');
  }

  private hashCommand(
    input: Pick<
      SportsMatchCommandInput,
      'matchId' | 'type' | 'scorerRosterEntryId' | 'authoredAt'
    >,
    payload: Prisma.InputJsonValue,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          matchId: input.matchId,
          type: input.type,
          payload,
          scorerRosterEntryId: input.scorerRosterEntryId ?? null,
          authoredAt: input.authoredAt.toISOString(),
        }),
      )
      .digest('hex');
  }

  private validateAuthoredAt(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Data local da ação inválida.');
    }
    const now = Date.now();
    if (value.getTime() > now + 5 * 60_000 || value.getTime() < now - 7 * 24 * 60 * 60_000) {
      throw new BadRequestException('A data local da ação está fora da janela permitida.');
    }
    return value;
  }

  private requireRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('A ação deve possuir um objeto de dados.');
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}

export function createSportsAuditActor(
  person: { id: string; name: string; email?: string | null },
): AuditActor {
  return {
    id: person.id,
    name: person.name,
    email: person.email ?? null,
    type: AuditLogActorType.USER,
  };
}
