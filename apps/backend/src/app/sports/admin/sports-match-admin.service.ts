import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  PublicationState,
  SportsCategoryStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { CreateSportsMatchInput } from '../sports-admin.types';
import { createSportsMatchBackingEvent } from '../sports-match-event-sync';
import { PublicationTransitionService } from '../../publishing/publishing-transition.service';

import { SportsMatchAdminLifecycleService } from './sports-match-admin-lifecycle.service';

export class SportsMatchAdminService extends SportsMatchAdminLifecycleService {
  constructor(
    prisma: ConstructorParameters<typeof SportsMatchAdminLifecycleService>[0],
    frozen: ConstructorParameters<typeof SportsMatchAdminLifecycleService>[1],
    auditLog: ConstructorParameters<typeof SportsMatchAdminLifecycleService>[2],
    payments: ConstructorParameters<typeof SportsMatchAdminLifecycleService>[3],
    private readonly publication: PublicationTransitionService,
  ) {
    super(prisma, frozen, auditLog, payments);
  }

  async createMatch(input: CreateSportsMatchInput, actor: AuthenticatedUser) {
    const actorId = this.requireActorId(actor);
    if ((input.startDate && !input.endDate) || (!input.startDate && input.endDate)) {
      throw new BadRequestException('Informe o início e o fim da partida.');
    }
    if (input.startDate && input.endDate) {
      this.assertDateRange(input.startDate, input.endDate, 'partida');
    }
    if (!input.eventId && (!input.startDate || !input.endDate)) {
      throw new BadRequestException('Informe início e fim ao criar um novo evento para a partida.');
    }

    const categoryScope = await this.prisma.sportsCategory.findFirst({
      where: { id: input.categoryId, deletedAt: null },
      select: { eventGroupId: true },
    });
    if (!categoryScope) {
      throw new NotFoundException(`Sports category ${input.categoryId} was not found.`);
    }
    await this.frozen.assertEventGroupMutable(categoryScope.eventGroupId, actor, 'edit');
    if (input.eventId) {
      await this.frozen.assertEventMutable(input.eventId, actor, 'edit');
    }

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const category = await tx.sportsCategory.findFirst({
        where: { id: input.categoryId, deletedAt: null },
        include: {
          eventGroup: true,
          tournament: {
            include: {
              majorEvent: true,
            },
          },
        },
      });
      if (!category) {
        throw new NotFoundException(`Sports category ${input.categoryId} was not found.`);
      }
      const [home, away, venue, stage] = await Promise.all([
        this.findRegistration(tx, input.homeRegistrationId, category.id),
        this.findRegistration(tx, input.awayRegistrationId, category.id),
        this.findVenue(tx, input.venueId, category.tournamentId),
        this.findStage(tx, input.stageId, category.id),
      ]);
      if (home && away && home.id === away.id) {
        throw new BadRequestException('Uma equipe não pode jogar contra si mesma.');
      }
      this.assertAdvancementTargetPair(input.winnerAdvancesToId, input.winnerAdvancesToSide, 'vencedor');
      this.assertAdvancementTargetPair(input.loserAdvancesToId, input.loserAdvancesToSide, 'perdedor');
      await this.assertAdvancementTargets(tx, category.id, null, [input.winnerAdvancesToId, input.loserAdvancesToId]);

      const generatedName = this.buildMatchName(category.name, home?.team.name, away?.team.name);
      const requestedName =
        input.name === undefined ? undefined : this.requireText(input.name, 'nome da partida', 2, 160);
      const publishImmediately =
        input.publishImmediately === true &&
        category.status !== SportsCategoryStatus.DRAFT &&
        category.tournament.status !== SportsTournamentStatus.DRAFT &&
        category.tournament.majorEvent.publicationState === PublicationState.PUBLISHED;
      const event = input.eventId
        ? await this.attachCompatibleEvent(
            tx,
            input.eventId,
            {
              majorEventId: category.tournament.majorEventId,
              eventGroupId: category.eventGroupId,
              name: requestedName,
              startDate: input.startDate,
              endDate: input.endDate,
              shouldIssueCertificate: category.eventGroup.shouldIssueCertificate,
              venue,
            },
            actorId,
          )
        : await createSportsMatchBackingEvent(tx, {
            name: requestedName || generatedName,
            emoji: category.eventGroup.emoji,
            startDate: this.requireDate(input.startDate, 'início da partida'),
            endDate: this.requireDate(input.endDate, 'fim da partida'),
            majorEventId: category.tournament.majorEventId,
            eventGroupId: category.eventGroupId,
            venue,
            isPubliclyListed: publishImmediately,
            shouldIssueCertificate: category.eventGroup.shouldIssueCertificate,
            publicationState: publishImmediately ? PublicationState.PUBLISHED : PublicationState.DRAFT,
            publishedAt: publishImmediately ? new Date() : null,
            actorId,
          });
      const match = await tx.sportsMatch.create({
        data: {
          eventId: event.id,
          categoryId: category.id,
          stageId: stage?.id ?? null,
          venueId: venue?.id ?? null,
          homeRegistrationId: home?.id ?? null,
          awayRegistrationId: away?.id ?? null,
          roundNumber: input.roundNumber ?? null,
          bracketPosition: input.bracketPosition ?? null,
          groupKey: input.groupKey?.trim() || null,
          notes: this.optionalText(input.notes, 'observações da partida', 4000),
          livestreamProvider: input.livestreamProvider ?? null,
          livestreamUrl: this.normalizeLivestreamUrl(input.livestreamProvider, input.livestreamUrl),
          winnerAdvancesToId: input.winnerAdvancesToId ?? null,
          winnerAdvancesToSide: input.winnerAdvancesToSide ?? null,
          loserAdvancesToId: input.loserAdvancesToId ?? null,
          loserAdvancesToSide: input.loserAdvancesToSide ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
        include: { event: true },
      });
      const youtubeCode = this.youtubeCodeForLivestream(input.livestreamProvider, input.livestreamUrl);
      if (youtubeCode) {
        await tx.event.update({
          where: { id: event.id },
          data: { youtubeCode, updatedById: actorId },
        });
        match.event.youtubeCode = youtubeCode;
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_MATCH,
          entityId: match.id,
          entityLabel: event.name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: this.matchAuditSnapshot(match),
          summary: 'Partida criada.',
          scope: {
            majorEventId: category.tournament.majorEventId,
            eventGroupId: category.eventGroupId,
            eventId: event.id,
          },
        },
        tx,
      );
      return match;
    });
  }

  async publishMatch(matchId: string, actor: AuthenticatedUser): Promise<{ id: string }> {
    return this.setMatchPublicationState(matchId, PublicationState.PUBLISHED, actor);
  }

  async unpublishMatch(matchId: string, actor: AuthenticatedUser): Promise<{ id: string }> {
    return this.setMatchPublicationState(matchId, PublicationState.UNPUBLISHED, actor);
  }

  private async setMatchPublicationState(
    matchId: string,
    state: PublicationState,
    actor: AuthenticatedUser,
  ): Promise<{ id: string }> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: { id: matchId, deletedAt: null },
      select: {
        id: true,
        eventId: true,
        category: {
          select: {
            status: true,
            tournament: {
              select: {
                status: true,
                majorEvent: { select: { publicationState: true } },
              },
            },
          },
        },
      },
    });
    if (!match) {
      throw new NotFoundException(`Sports match ${matchId} was not found.`);
    }

    await this.frozen.assertEventMutable(match.eventId, actor, 'edit');
    if (
      state === PublicationState.PUBLISHED &&
      (match.category.status === SportsCategoryStatus.DRAFT ||
        match.category.tournament.status === SportsTournamentStatus.DRAFT ||
        match.category.tournament.majorEvent.publicationState !== PublicationState.PUBLISHED)
    ) {
      throw new BadRequestException(
        'Publique o grande evento e ative o torneio e a modalidade antes de publicar esta partida.',
      );
    }

    await this.publication.setEventPublicationState(match.eventId, state, actor, {
      isPubliclyListed: state === PublicationState.PUBLISHED,
    });
    return { id: match.id };
  }
}
