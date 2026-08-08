import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, SportsMatchAction, SportsMatchActionType, SportsReviewStatus } from '@prisma/client';
import { AuditActor } from '../../audit-log/audit-log.types';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

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

import { SportsMatchOperationProjection } from './sports-match-operation-projection';

export abstract class SportsMatchOperationMutation extends SportsMatchOperationProjection {
  protected async commitOne(
    tx: Prisma.TransactionClient,
    input: SportsMatchCommandInput,
    actor: SportsMatchCommandActor,
  ): Promise<SportsMatchAction> {
    const clientId = this.normalizeClientId(input.clientId);
    const payload = this.normalizePayload(input.payload);
    const payloadHash = this.hashCommand(input, payload);
    const existing = await tx.sportsMatchAction.findUnique({ where: { clientId } });
    if (existing) {
      if (existing.matchId !== input.matchId || existing.type !== input.type || existing.payloadHash !== payloadHash) {
        throw new ConflictException('O identificador offline já foi usado por uma ação diferente.');
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
            timerRules: true,
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
    await this.frozen.assertEventMutable(match.eventId, this.authenticatedActor(actor.auditActor), 'edit');
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
      await this.validateScorer(tx, match, input.scorerRosterEntryId, payload);
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
        reviewStatus: actor.kind === 'ADMIN' ? SportsReviewStatus.APPROVED : SportsReviewStatus.PENDING,
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
    await this.recordAudit(tx, match, actor.auditActor, action, this.auditOperation(action.type));
    return action;
  }
}
