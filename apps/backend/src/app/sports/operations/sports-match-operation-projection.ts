import { Prisma, SportsMatchActionType, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import { AuditActor } from '../../audit-log/audit-log.types';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { projectSportsMatch, SportsProjectedOutcome } from './sports-match-projector';

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

import { SportsMatchOperationCommandValidation } from './sports-match-operation-command-validation';

export abstract class SportsMatchOperationProjection extends SportsMatchOperationCommandValidation {
  protected async refreshProjection(tx: Prisma.TransactionClient, matchId: string, actorId: string | null) {
    const match = await tx.sportsMatch.findUniqueOrThrow({
      where: { id: matchId },
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
      periodsEnabled: match.category.periodsEnabled,
      timerRules: match.category.timerRules,
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
          action.type === SportsMatchActionType.OCCURRENCE && action.reviewStatus !== SportsReviewStatus.REJECTED,
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
        ...(terminalStates.includes(provisional.state) ? { occurrences: this.toJson(consolidatedOccurrences) } : {}),
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

  protected async loadProjection(
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
            periodsEnabled: true,
            timerRules: true,
          },
        },
        actions: {
          ...(beforeSequence === undefined ? {} : { where: { sequence: { lt: beforeSequence } } }),
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
      periodsEnabled: match.category.periodsEnabled,
      timerRules: match.category.timerRules,
    });
  }
}
