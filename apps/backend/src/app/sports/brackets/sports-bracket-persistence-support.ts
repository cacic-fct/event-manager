import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import {
  Prisma,
  PublicationState,
  SportsBracketSide,
  SportsFormat,
  SportsMatchState,
  SportsReviewStatus,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { EventPostCommitEffectsService } from '../../events/event-post-commit-effects.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsRealtimeService } from '../realtime/sports-realtime.service';
import {
  SportsStructuralInvalidation,
  SportsStructuralInvalidationKind,
} from '../realtime/sports-structural-invalidation';
import { createSportsMatchBackingEvent, softDeleteSportsMatchBackingEvents } from '../sports-match-event-sync';
import { SportsBracketAdvancementService } from './sports-bracket-advancement.service';

export interface SportsBracketParticipant {
  registrationId: string;
  seed?: number | null;
}

export abstract class SportsBracketPersistenceSupport {
  protected readonly logger = new Logger(SportsBracketPersistenceSupport.name);

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly advancement: SportsBracketAdvancementService,
    protected readonly auditLog: AuditLogService,
    protected readonly realtime: SportsRealtimeService,
    protected readonly frozen: FrozenResourceService,
    protected readonly eventEffects: EventPostCommitEffectsService,
  ) {}

  protected async createBackedMatch(
    tx: Prisma.TransactionClient,
    input: {
      category: {
        id: string;
        eventGroupId: string;
        eventGroup: { emoji: string; shouldIssueCertificate: boolean };
        tournament: {
          majorEventId: string;
          majorEvent: {
            startDate: Date;
            endDate: Date;
            publicationState: PublicationState;
          };
        };
      };
      stageId: string;
      name: string;
      homeRegistrationId: string | null;
      awayRegistrationId: string | null;
      roundNumber: number;
      bracketPosition: number;
      automaticWinnerRegistrationId: string | null;
      actorId: string;
    },
  ) {
    const major = input.category.tournament.majorEvent;
    const event = await createSportsMatchBackingEvent(tx, {
      name: input.name,
      emoji: input.category.eventGroup.emoji,
      startDate: major.startDate,
      endDate: major.endDate,
      majorEventId: input.category.tournament.majorEventId,
      eventGroupId: input.category.eventGroupId,
      publiclyVisible: false,
      shouldIssueCertificate: input.category.eventGroup.shouldIssueCertificate,
      publicationState: PublicationState.DRAFT,
      actorId: input.actorId,
    });
    const automatic = Boolean(input.automaticWinnerRegistrationId);
    return tx.sportsMatch.create({
      data: {
        eventId: event.id,
        categoryId: input.category.id,
        stageId: input.stageId,
        homeRegistrationId: input.homeRegistrationId,
        awayRegistrationId: input.awayRegistrationId,
        roundNumber: input.roundNumber,
        bracketPosition: input.bracketPosition,
        state: automatic ? SportsMatchState.FINISHED : SportsMatchState.SCHEDULED,
        canonicalState: automatic ? SportsMatchState.FINISHED : SportsMatchState.SCHEDULED,
        reviewStatus: automatic ? SportsReviewStatus.APPROVED : SportsReviewStatus.NOT_REQUIRED,
        winnerRegistrationId: input.automaticWinnerRegistrationId,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
  }

  protected async replaceDraftIfRequested(
    tx: Prisma.TransactionClient,
    stages: Array<{
      id: string;
      matches: Array<{
        id: string;
        eventId: string;
        state: SportsMatchState;
        operationSequence: number;
        event: { publicationState: PublicationState };
      }>;
    }>,
    replace: boolean,
    actorId: string,
  ): Promise<void> {
    if (!replace || stages.length === 0) {
      return;
    }
    const matches = stages.flatMap((stage) => stage.matches);
    if (
      matches.some((match) => match.operationSequence > 0 || match.event.publicationState !== PublicationState.DRAFT)
    ) {
      throw new ConflictException('Uma chave com partidas iniciadas não pode ser substituída automaticamente.');
    }
    const now = new Date();
    await tx.sportsMatch.updateMany({
      where: { id: { in: matches.map((match) => match.id) } },
      data: { deletedAt: now, updatedById: actorId },
    });
    await softDeleteSportsMatchBackingEvents(
      tx,
      matches.map((match) => match.eventId),
      now,
      actorId,
    );
    await tx.sportsStage.updateMany({
      where: { id: { in: stages.map((stage) => stage.id) } },
      data: { deletedAt: now, updatedById: actorId },
    });
  }

  protected loadGeneratedStages(tx: Prisma.TransactionClient, stageIds: string[]) {
    return tx.sportsStage.findMany({
      where: { id: { in: stageIds } },
      include: {
        matches: {
          where: { deletedAt: null },
          include: {
            event: true,
            homeRegistration: { include: { team: true } },
            awayRegistration: { include: { team: true } },
          },
          orderBy: [{ roundNumber: 'asc' }, { bracketPosition: 'asc' }],
        },
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  protected generationInvalidation(
    kind: SportsStructuralInvalidationKind,
    tournamentId: string,
    categoryId: string,
    stages: Array<{
      id: string;
      matches: Array<{
        id: string;
        event: {
          deletedAt: Date | null;
          publiclyVisible: boolean;
          publicationState: PublicationState;
        };
      }>;
    }>,
  ): SportsStructuralInvalidation {
    const matches = stages.flatMap((stage) => stage.matches);
    return {
      kind,
      tournamentId,
      categoryId,
      stageIds: stages.map((stage) => stage.id),
      matchIds: matches.map((match) => match.id),
      publicMatchIds: matches
        .filter(
          (match) =>
            match.event.deletedAt === null &&
            match.event.publiclyVisible &&
            match.event.publicationState === PublicationState.PUBLISHED,
        )
        .map((match) => match.id),
    };
  }

  protected generationKey(
    category: {
      id: string;
      format: SportsFormat;
      bracketRules: Prisma.JsonValue;
      standingsRules: Prisma.JsonValue;
    },
    input: {
      participants: SportsBracketParticipant[];
      randomizeUnseeded?: boolean;
      randomSeed?: string | null;
    },
  ): string {
    const effectiveRandomSeed = input.randomizeUnseeded
      ? input.randomSeed?.trim() || `${category.id}:${category.format.toLowerCase().replace(/_/g, '-')}`
      : null;
    return createHash('sha256')
      .update(
        this.stableJson({
          format: category.format,
          participants: input.participants.map((participant) => ({
            registrationId: participant.registrationId.trim(),
            seed: participant.seed ?? null,
          })),
          randomizeUnseeded: input.randomizeUnseeded === true,
          randomSeed: effectiveRandomSeed,
          bracketRules: category.bracketRules,
          standingsRules: category.standingsRules,
        }),
      )
      .digest('hex');
  }

  protected stableJson(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableJson(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.stableJson(record[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  }

  protected seededRandom(seed: string): () => number {
    let counter = 0;
    return () => {
      const digest = createHash('sha256').update(`${seed}:${counter++}`).digest();
      return digest.readUInt32BE(0) / 0x1_0000_0000;
    };
  }

  protected matchName(categoryName: string, homeName?: string, awayName?: string): string {
    return `${homeName ?? 'A definir'} × ${awayName ?? 'A definir'} — ${categoryName}`;
  }

  protected readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  protected toBracketSide(side: 'HOME' | 'AWAY'): SportsBracketSide {
    return side === 'HOME' ? SportsBracketSide.HOME : SportsBracketSide.AWAY;
  }

  protected readNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  protected readPositiveInteger(value: unknown, fallback: number, allowZero = false): number {
    const minimum = allowZero ? 0 : 1;
    return typeof value === 'number' && Number.isInteger(value) && value >= minimum ? value : fallback;
  }

  protected readOptionalPositiveInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
  }

  protected toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  protected requireActorId(actor: AuthenticatedUser): string {
    if (!actor.sub) {
      throw new BadRequestException('O administrador autenticado não possui identificador.');
    }
    return actor.sub;
  }

  protected async runBestEffortPostCommitEffects(
    effects: ReadonlyArray<readonly [label: string, effect: Promise<unknown>]>,
  ): Promise<void> {
    const results = await Promise.allSettled(effects.map(([, effect]) => effect));
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Could not complete sports bracket ${effects[index][0]} after commit; the committed bracket remains authoritative.`,
          result.reason instanceof Error ? result.reason.stack : undefined,
        );
      }
    });
  }
}
