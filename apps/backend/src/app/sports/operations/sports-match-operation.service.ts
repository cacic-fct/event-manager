import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AuditLogOperation,
  Prisma,
  SportsMatchAction,
  SportsMatchActionType,
  SportsReviewStatus,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditActor } from '../../audit-log/audit-log.types';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { EventPostCommitEffectsService } from '../../events/event-post-commit-effects.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsBracketAdvancementService } from '../brackets/sports-bracket-advancement.service';
import { SportsRealtimeService } from '../realtime/sports-realtime.service';
import { SportsMutationEventsService } from '../realtime/sports-mutation-events.service';
import {
  mergeSportsStructuralInvalidations,
  SportsStructuralInvalidation,
} from '../realtime/sports-structural-invalidation';
import { SportsStandingsService } from '../scoring/sports-standings.service';
import { runSerializableSportsTransaction } from '../sports-transaction';

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

import { SportsMatchOperationMutation } from './sports-match-operation-mutation';
export { createSportsAuditActor } from './sports-match-operation-support';

@Injectable()
export class SportsMatchOperationService extends SportsMatchOperationMutation {
  private readonly logger = new Logger(SportsMatchOperationService.name);

  constructor(
    prisma: PrismaService,
    advancement: SportsBracketAdvancementService,
    standings: SportsStandingsService,
    private readonly realtime: SportsRealtimeService,
    mutationEvents: SportsMutationEventsService,
    auditLog: AuditLogService,
    frozen: FrozenResourceService,
    private readonly eventEffects: EventPostCommitEffectsService,
  ) {
    super(prisma, advancement, standings, mutationEvents, auditLog, frozen);
  }

  async commit(inputs: SportsMatchCommandInput[], actor: SportsMatchCommandActor): Promise<SportsMatchAction[]> {
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
      if (actor.kind === 'ADMIN' && match.reviewStatus === SportsReviewStatus.APPROVED) {
        const actorId = actor.userId ?? actor.personId ?? 'system';
        structuralInvalidations.push(
          (await this.standings.reconcileAfterProjectionChange(tx, match.id, actorId)) ?? [],
        );
        structuralInvalidations.push(
          (await this.advancement.reconcileAfterProjectionChange(tx, match.id, actorId)) ?? [],
        );
      }
      return {
        committed,
        match,
        structuralInvalidations: mergeSportsStructuralInvalidations(...structuralInvalidations),
      };
    });

    await this.publishPostCommitEffects(
      result.match,
      inputs.some((input) => input.type === SportsMatchActionType.RESCHEDULE),
      result.structuralInvalidations,
    );
    return result.committed;
  }

  async review(
    actionId: string,
    decision: SportsReviewStatus,
    actor: AuthenticatedUser,
    options: {
      reviewMessage?: string | null;
      correctedPayload?: unknown;
      allowApprovedOccurrenceCorrection?: boolean;
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
                  timerRules: true,
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
      const isApprovedOccurrenceCorrection =
        options.allowApprovedOccurrenceCorrection === true &&
        action.type === SportsMatchActionType.OCCURRENCE &&
        action.reviewStatus === SportsReviewStatus.APPROVED &&
        decision === SportsReviewStatus.APPROVED &&
        options.correctedPayload !== undefined;
      if (
        !isApprovedOccurrenceCorrection &&
        !([SportsReviewStatus.PENDING, SportsReviewStatus.CHANGES_REQUESTED] as SportsReviewStatus[]).includes(
          action.reviewStatus,
        )
      ) {
        throw new ConflictException('Esta ação já foi analisada.');
      }

      const payload =
        options.correctedPayload === undefined ? action.payload : this.normalizePayload(options.correctedPayload);
      if (decision === SportsReviewStatus.APPROVED) {
        const current = await this.loadProjection(tx, action.matchId, true, action.sequence);
        this.validateCommand(action.type, payload, current, action.match, 'ADMIN');
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
          (await this.standings.reconcileAfterProjectionChange(tx, match.id, actorId)) ?? [],
        );
        structuralInvalidations.push(
          (await this.advancement.reconcileAfterProjectionChange(tx, match.id, actorId)) ?? [],
        );
      }
      await this.recordAudit(
        tx,
        action.match,
        actor,
        reviewed,
        isApprovedOccurrenceCorrection
          ? AuditLogOperation.UPDATE
          : decision === SportsReviewStatus.APPROVED
            ? AuditLogOperation.APPROVE
            : decision === SportsReviewStatus.REJECTED
              ? AuditLogOperation.REJECT
              : AuditLogOperation.REQUEST_CHANGES,
      );
      return {
        action: reviewed,
        match,
        structuralInvalidations: mergeSportsStructuralInvalidations(...structuralInvalidations),
      };
    });
    await this.publishPostCommitEffects(
      result.match,
      result.action.type === SportsMatchActionType.RESCHEDULE,
      result.structuralInvalidations,
    );
    return result.action;
  }

  async correctApprovedOccurrence(actionId: string, correctedPayload: unknown, actor: AuthenticatedUser) {
    return this.review(actionId, SportsReviewStatus.APPROVED, actor, {
      correctedPayload,
      allowApprovedOccurrenceCorrection: true,
    });
  }

  private async publishPostCommitEffects(
    match: Parameters<SportsMutationEventsService['publishMatchProjection']>[0] & { eventId: string },
    syncEvent: boolean,
    structuralInvalidations: readonly SportsStructuralInvalidation[],
  ): Promise<void> {
    await Promise.all([
      this.mutationEvents.publishMatchProjection(match),
      ...(syncEvent ? [this.eventEffects.syncEvent(match.eventId)] : []),
    ]).catch((error: unknown) => {
      this.logger.warn(
        `Could not publish post-commit sports match effects for ${match.id}; the committed mutation remains authoritative.`,
        error instanceof Error ? error.stack : undefined,
      );
    });
    await this.realtime.publishStructuralInvalidations(structuralInvalidations).catch((error: unknown) => {
      this.logger.warn(
        `Could not publish sports structural invalidations for ${match.id}; the committed mutation remains authoritative.`,
        error instanceof Error ? error.stack : undefined,
      );
    });
  }
}
