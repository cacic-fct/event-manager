import { BadRequestException } from '@nestjs/common';
import {
  Prisma,
  SportsMatchAction,
  SportsMatchActionType,
  SportsMatchState,
  SportsReviewStatus,
  SportsRosterEntryStatus,
  SportsRosterStatus,
} from '@prisma/client';
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
    timerRules: Prisma.JsonValue;
    scoreRules: Prisma.JsonValue;
    tournament: {
      majorEventId: string;
    };
  };
}

import { SportsMatchOperationSupport } from './sports-match-operation-support';

export abstract class SportsMatchOperationActorValidation extends SportsMatchOperationSupport {
  protected async validateScorer(
    tx: Prisma.TransactionClient,
    match: Pick<MatchProjectionContext, 'id' | 'homeRegistrationId' | 'awayRegistrationId'>,
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

  protected async validateOccurrence(
    tx: Prisma.TransactionClient,
    match: MatchProjectionContext,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const registrationId = typeof payload['registrationId'] === 'string' ? payload['registrationId'].trim() : null;
    if (registrationId && registrationId !== match.homeRegistrationId && registrationId !== match.awayRegistrationId) {
      throw new BadRequestException('A equipe da ocorrência não participa desta partida.');
    }
    const rosterEntryId = typeof payload['rosterEntryId'] === 'string' ? payload['rosterEntryId'].trim() : null;
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
      throw new BadRequestException('A pessoa da ocorrência não pertence à escalação da partida.');
    }
  }

  protected assertActorMaySubmit(type: SportsMatchActionType, actorKind: SportsMatchActorKind): void {
    if (actorKind === 'LINEUP_MANAGER' && type !== SportsMatchActionType.FORFEIT) {
      throw new BadRequestException('Capitães e técnicos somente podem desistir antes da partida.');
    }
  }

  protected resolveMatchReviewStatus(
    actions: Array<Pick<SportsMatchAction, 'reviewStatus' | 'type'>>,
  ): SportsReviewStatus {
    if (actions.some((action) => action.reviewStatus === SportsReviewStatus.PENDING)) {
      return SportsReviewStatus.PENDING;
    }
    if (actions.some((action) => action.reviewStatus === SportsReviewStatus.CHANGES_REQUESTED)) {
      return SportsReviewStatus.CHANGES_REQUESTED;
    }
    const visible = actions.filter((action) => action.reviewStatus !== SportsReviewStatus.REJECTED);
    if (visible.length === 0) {
      return SportsReviewStatus.NOT_REQUIRED;
    }
    return SportsReviewStatus.APPROVED;
  }

  protected readRescheduleDates(payload: Record<string, unknown>): {
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
      throw new BadRequestException('Informe início e fim válidos para reagendar a partida.');
    }
    return { startDate, endDate };
  }
}
