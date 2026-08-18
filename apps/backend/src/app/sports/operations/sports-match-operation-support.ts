import { BadRequestException } from '@nestjs/common';
import {
  AuditLogActorType,
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  SportsMatchAction,
  SportsMatchActionType,
  SportsMatchState,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditActor } from '../../audit-log/audit-log.types';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsBracketAdvancementService } from '../brackets/sports-bracket-advancement.service';
import { SportsMutationEventsService } from '../realtime/sports-mutation-events.service';
import { SportsStandingsService } from '../scoring/sports-standings.service';

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

export abstract class SportsMatchOperationSupport {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly advancement: SportsBracketAdvancementService,
    protected readonly standings: SportsStandingsService,
    protected readonly mutationEvents: SportsMutationEventsService,
    protected readonly auditLog: AuditLogService,
    protected readonly frozen: FrozenResourceService,
  ) {}

  protected authenticatedActor(actor: AuthenticatedUser | AuditActor): AuthenticatedUser | undefined {
    return 'permissions' in actor || 'permissionSet' in actor ? (actor as AuthenticatedUser) : undefined;
  }

  protected async recordAudit(
    tx: Prisma.TransactionClient,
    match: MatchProjectionContext,
    actor: AuthenticatedUser | AuditActor,
    action: Pick<SportsMatchAction, 'id' | 'type' | 'sequence' | 'reviewStatus' | 'offline' | 'payload'>,
    operation: AuditLogOperation,
  ): Promise<void> {
    const readinessOverride = this.readinessOverrideAuditMetadata(action.payload);
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
          ...readinessOverride,
        },
        summary: readinessOverride.readinessOverride
          ? 'Ação de partida registrada com substituição manual da prontidão.'
          : 'Ação de partida registrada.',
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

  protected readinessOverrideAuditMetadata(payload: Prisma.JsonValue | undefined): {
    readinessOverride?: true;
    readinessOverrideReason?: string | null;
  } {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }
    const record = payload as Record<string, Prisma.JsonValue>;
    if (record['readinessOverride'] !== true) {
      return {};
    }
    return {
      readinessOverride: true,
      readinessOverrideReason:
        typeof record['readinessOverrideReason'] === 'string'
          ? record['readinessOverrideReason'].trim() || null
          : null,
    };
  }

  protected auditOperation(type: SportsMatchActionType): AuditLogOperation {
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

  protected normalizeClientId(value: string): string {
    const normalized = value.trim();
    if (!/^[a-zA-Z0-9_-]{12,120}$/.test(normalized)) {
      throw new BadRequestException('Identificador offline inválido.');
    }
    return normalized;
  }

  protected normalizePayload(value: unknown): Prisma.InputJsonValue {
    const serialized = JSON.stringify(this.sortJson(value));
    if (!serialized || serialized.length > 32_000) {
      throw new BadRequestException('Conteúdo da ação de partida inválido ou muito grande.');
    }
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }

  protected sortJson(value: unknown): unknown {
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

  protected hashCommand(
    input: Pick<SportsMatchCommandInput, 'matchId' | 'type' | 'scorerRosterEntryId' | 'authoredAt'>,
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

  protected validateAuthoredAt(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Data local da ação inválida.');
    }
    const now = Date.now();
    if (value.getTime() > now + 5 * 60_000 || value.getTime() < now - 7 * 24 * 60 * 60_000) {
      throw new BadRequestException('A data local da ação está fora da janela permitida.');
    }
    return value;
  }

  protected requireRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('A ação deve possuir um objeto de dados.');
    }
    return value as Record<string, unknown>;
  }

  protected readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  protected toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}

export function createSportsAuditActor(person: { id: string; name: string; email?: string | null }): AuditActor {
  return {
    id: person.id,
    name: person.name,
    email: person.email ?? null,
    type: AuditLogActorType.USER,
  };
}
