import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  PublicationState,
  SportsCategoryStatus,
  SportsMatchState,
  SportsReviewStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardInsightsService } from '../../dashboard/insights.service';
import { CurrentUserDefaultRedirectService } from '../../current-user/default-redirect/current-user-default-redirect.service';
import { EventPostCommitEffectsService } from '../../events/event-post-commit-effects.service';
import { SportsAutoroutingService } from '../routing/sports-autorouting.service';
import { isSportsMatchPublic } from '../security/sports-public-visibility';
import { SportsRealtimeService } from './sports-realtime.service';

export type SportsMutationEntity =
  | 'TOURNAMENT'
  | 'CATEGORY'
  | 'TEAM'
  | 'REGISTRATION'
  | 'MATCH'
  | 'OFFICIAL'
  | 'REPRESENTATIVE'
  | 'APPLICATION'
  | 'TEAM_CHANGE'
  | 'ROSTER'
  | 'VENUE'
  | 'SCORE_ENTRY';

export interface SportsMatchMutationProjection {
  id: string;
  categoryId: string;
  state: SportsMatchState;
  canonicalState: SportsMatchState;
  reviewStatus: SportsReviewStatus;
  scoreboard: Prisma.JsonValue;
  revision: number;
  category: {
    deletedAt: Date | null;
    status: SportsCategoryStatus;
    tournament: {
      id: string;
      deletedAt: Date | null;
      status: SportsTournamentStatus;
      majorEvent: { deletedAt: Date | null; publicationState: PublicationState };
    };
  };
  event: { deletedAt: Date | null; isPubliclyListed: boolean; publicationState: PublicationState };
}

@Injectable()
export class SportsMutationEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: SportsRealtimeService,
    private readonly autorouting: SportsAutoroutingService,
    private readonly dashboardInsights: DashboardInsightsService,
    private readonly defaultRedirect: CurrentUserDefaultRedirectService,
    private readonly eventEffects: EventPostCommitEffectsService,
  ) {}

  async publishMatchProjection(match: SportsMatchMutationProjection): Promise<void> {
    const tournamentId = match.category.tournament.id;
    const payload = {
      type: 'MATCH_PROJECTION_CHANGED',
      matchId: match.id,
      categoryId: match.categoryId,
      tournamentId,
      state: match.state,
      canonicalState: match.canonicalState,
      reviewStatus: match.reviewStatus,
      scoreboard: match.scoreboard,
      revision: match.revision,
    };
    const people = await this.autorouting.affectedPeopleForMatch(match.id);
    await Promise.all([
      this.dashboardInsights.invalidateCachedInsights(),
      this.realtime.publish(this.realtime.scope('admin-tournament', tournamentId), payload),
      ...(isSportsMatchPublic(match)
        ? [
            this.realtime.publish(this.realtime.scope('match', match.id), payload),
            this.realtime.publish(this.realtime.scope('tournament', tournamentId), payload),
          ]
        : []),
      ...(match.reviewStatus === SportsReviewStatus.PENDING
        ? [this.realtime.publish(this.realtime.scope('review', match.id), payload)]
        : []),
      this.defaultRedirect.invalidatePeople(people),
      this.realtime.publishAutorouteInvalidations(people),
    ]);
  }

  private async syncBackingResources(entity: SportsMutationEntity, entityId: string): Promise<void> {
    if (entity === 'MATCH') {
      const match = await this.prisma.sportsMatch.findUnique({
        where: { id: entityId },
        select: { eventId: true },
      });
      if (match) {
        await this.eventEffects.syncEvent(match.eventId);
      }
      return;
    }
    if (entity === 'CATEGORY') {
      const category = await this.prisma.sportsCategory.findUnique({
        where: { id: entityId },
        select: {
          eventGroupId: true,
          matches: { select: { eventId: true } },
        },
      });
      if (category) {
        await Promise.all([
          this.eventEffects.syncEventGroup(category.eventGroupId),
          this.eventEffects.syncEvents(category.matches.map((match) => match.eventId)),
        ]);
      }
      return;
    }
    if (entity === 'TOURNAMENT') {
      const categories = await this.prisma.sportsCategory.findMany({
        where: { tournamentId: entityId },
        select: {
          eventGroupId: true,
          matches: { select: { eventId: true } },
        },
      });
      await Promise.all([
        this.eventEffects.syncEventGroups(categories.map((category) => category.eventGroupId)),
        this.eventEffects.syncEvents(categories.flatMap((category) => category.matches.map((match) => match.eventId))),
      ]);
      return;
    }
    if (entity === 'VENUE') {
      const matches = await this.prisma.sportsMatch.findMany({
        where: { venueId: entityId },
        select: { eventId: true },
      });
      await this.eventEffects.syncEvents(matches.map((match) => match.eventId));
    }
  }

  async publishRosterMutation(matchId: string, type: string, entityId: string): Promise<void> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: { id: matchId, deletedAt: null },
      select: {
        id: true,
        revision: true,
        category: { select: { tournamentId: true } },
        event: { select: { deletedAt: true, isPubliclyListed: true, publicationState: true } },
      },
    });
    if (!match) {
      return;
    }
    const tournamentId = match.category.tournamentId;
    const payload = { type, matchId, entityId, tournamentId, revision: match.revision };
    const isPublic =
      !match.event.deletedAt &&
      match.event.isPubliclyListed &&
      match.event.publicationState === PublicationState.PUBLISHED;
    const people = await this.autorouting.affectedPeopleForMatch(match.id);
    await Promise.all([
      this.dashboardInsights.invalidateCachedInsights(),
      this.realtime.publish(this.realtime.scope('admin-tournament', tournamentId), payload),
      this.realtime.publish(this.realtime.scope('review', match.id), payload),
      ...(isPublic
        ? [
            this.realtime.publish(this.realtime.scope('match', match.id), payload),
            this.realtime.publish(this.realtime.scope('tournament', tournamentId), payload),
          ]
        : []),
      this.defaultRedirect.invalidatePeople(people),
      this.realtime.publishAutorouteInvalidations(people),
    ]);
  }

  async publishAttendanceMutation(eventId: string): Promise<void> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: { eventId, deletedAt: null },
      select: { id: true },
    });
    if (!match) {
      return;
    }

    await this.publishRosterMutation(match.id, 'ATHLETE_ATTENDANCE_CHANGED', eventId);
  }

  async publishForEntity(entity: SportsMutationEntity, entityId: string, includePublic: boolean): Promise<void> {
    const tournamentId = await this.resolveTournamentId(entity, entityId);
    const payload = {
      type: 'INVALIDATE',
      entity,
      entityId,
      tournamentId,
      occurredAt: new Date().toISOString(),
    };
    const matchIds = includePublic ? await this.resolveAffectedMatchIds(entity, entityId, tournamentId) : [];
    const autoroutePeople = await this.resolveAutoroutePeople(entity, entityId);
    await Promise.all([
      this.dashboardInsights.invalidateCachedInsights(),
      this.syncBackingResources(entity, entityId),
      this.realtime.publish(this.realtime.scope('admin-tournament', tournamentId), payload),
      ...(includePublic
        ? [
            this.realtime.publish(this.realtime.scope('tournament', tournamentId), payload),
            ...matchIds.map((matchId) => this.realtime.publish(this.realtime.scope('match', matchId), payload)),
          ]
        : []),
      this.realtime.publishAutorouteInvalidations(autoroutePeople),
    ]);
  }

  async publishForBackingEvent(eventId: string): Promise<void> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: { eventId, deletedAt: null },
      select: { id: true },
    });
    if (match) {
      await this.publishForEntity('MATCH', match.id, true);
    }
  }

  async publishForBackingEventGroup(eventGroupId: string): Promise<void> {
    const category = await this.prisma.sportsCategory.findFirst({
      where: { eventGroupId, deletedAt: null },
      select: { id: true },
    });
    if (category) {
      await this.publishForEntity('CATEGORY', category.id, true);
    }
  }

  private async resolveAutoroutePeople(entity: SportsMutationEntity, entityId: string): Promise<string[]> {
    if (entity === 'MATCH') {
      return this.autorouting.affectedPeopleForMatch(entityId);
    }
    if (entity === 'ROSTER') {
      const roster = await this.prisma.sportsMatchRoster.findUnique({
        where: { id: entityId },
        select: { matchId: true },
      });
      return roster ? this.autorouting.affectedPeopleForMatch(roster.matchId) : [];
    }
    if (entity === 'OFFICIAL') {
      const assignment = await this.prisma.sportsOfficialAssignment.findUnique({
        where: { id: entityId },
        select: { personId: true },
      });
      return assignment ? [assignment.personId] : [];
    }
    if (entity === 'REPRESENTATIVE') {
      const representative = await this.prisma.sportsTeamRepresentative.findUnique({
        where: { id: entityId },
        select: { personId: true },
      });
      return representative ? [representative.personId] : [];
    }
    return [];
  }

  private async resolveTournamentId(entity: SportsMutationEntity, id: string): Promise<string> {
    if (entity === 'TOURNAMENT') {
      return id;
    }
    if (entity === 'CATEGORY') {
      return this.requireTournament(
        await this.prisma.sportsCategory.findUnique({
          where: { id },
          select: { tournamentId: true },
        }),
        entity,
        id,
      );
    }
    if (entity === 'TEAM') {
      return this.requireTournament(
        await this.prisma.sportsTeam.findUnique({
          where: { id },
          select: { tournamentId: true },
        }),
        entity,
        id,
      );
    }
    if (entity === 'REGISTRATION') {
      return this.requireTournament(
        await this.prisma.sportsRegistration.findUnique({
          where: { id },
          select: {
            category: {
              select: { tournamentId: true },
            },
          },
        }),
        entity,
        id,
      );
    }
    if (entity === 'MATCH') {
      return this.requireTournament(
        await this.prisma.sportsMatch.findUnique({
          where: { id },
          select: {
            category: {
              select: { tournamentId: true },
            },
          },
        }),
        entity,
        id,
      );
    }
    if (entity === 'OFFICIAL') {
      return this.requireTournament(
        await this.prisma.sportsOfficialAssignment.findUnique({
          where: { id },
          select: { tournamentId: true },
        }),
        entity,
        id,
      );
    }
    if (entity === 'REPRESENTATIVE') {
      return this.requireTournament(
        await this.prisma.sportsTeamRepresentative.findUnique({
          where: { id },
          select: {
            team: {
              select: { tournamentId: true },
            },
          },
        }),
        entity,
        id,
      );
    }
    if (entity === 'APPLICATION') {
      return this.requireTournament(
        await this.prisma.sportsPlayerApplication.findUnique({
          where: { id },
          select: { tournamentId: true },
        }),
        entity,
        id,
      );
    }
    if (entity === 'TEAM_CHANGE') {
      return this.requireTournament(
        await this.prisma.sportsTeamChangeRequest.findUnique({
          where: { id },
          select: {
            team: {
              select: { tournamentId: true },
            },
          },
        }),
        entity,
        id,
      );
    }
    if (entity === 'ROSTER') {
      return this.requireTournament(
        await this.prisma.sportsMatchRoster.findUnique({
          where: { id },
          select: {
            match: {
              select: {
                category: {
                  select: { tournamentId: true },
                },
              },
            },
          },
        }),
        entity,
        id,
      );
    }
    if (entity === 'VENUE') {
      return this.requireTournament(
        await this.prisma.sportsVenue.findUnique({
          where: { id },
          select: { tournamentId: true },
        }),
        entity,
        id,
      );
    }
    return this.requireTournament(
      await this.prisma.sportsTournamentScoreEntry.findUnique({
        where: { id },
        select: { tournamentId: true },
      }),
      entity,
      id,
    );
  }

  private requireTournament(
    value:
      | { tournamentId: string }
      | { category: { tournamentId: string } }
      | { team: { tournamentId: string } }
      | { match: { category: { tournamentId: string } } }
      | null,
    entity: SportsMutationEntity,
    entityId: string,
  ): string {
    if (!value) {
      throw new NotFoundException(`Sports ${entity.toLowerCase()} ${entityId} was not found.`);
    }
    if ('tournamentId' in value) {
      return value.tournamentId;
    }
    if ('category' in value) {
      return value.category.tournamentId;
    }
    if ('team' in value) {
      return value.team.tournamentId;
    }
    return value.match.category.tournamentId;
  }

  private async resolveAffectedMatchIds(
    entity: SportsMutationEntity,
    entityId: string,
    tournamentId: string,
  ): Promise<string[]> {
    if (entity === 'MATCH') {
      return [entityId];
    }
    if (entity === 'ROSTER') {
      const roster = await this.prisma.sportsMatchRoster.findUnique({
        where: { id: entityId },
        select: { matchId: true },
      });
      return roster ? [roster.matchId] : [];
    }
    if (entity === 'OFFICIAL') {
      const assignment = await this.prisma.sportsOfficialAssignment.findUnique({
        where: { id: entityId },
        select: { matchId: true, categoryId: true },
      });
      if (assignment?.matchId) {
        return [assignment.matchId];
      }
      return this.findMatchIds(
        tournamentId,
        assignment?.categoryId ? { categoryId: assignment.categoryId } : undefined,
      );
    }
    if (entity === 'CATEGORY') {
      return this.findMatchIds(tournamentId, { categoryId: entityId });
    }
    if (entity === 'VENUE') {
      return this.findMatchIds(tournamentId, { venueId: entityId });
    }
    if (entity === 'REGISTRATION') {
      return this.findMatchIds(tournamentId, {
        OR: [
          { homeRegistrationId: entityId },
          { awayRegistrationId: entityId },
          { winnerRegistrationId: entityId },
          { loserRegistrationId: entityId },
        ],
      });
    }
    if (entity === 'TEAM' || entity === 'TEAM_CHANGE') {
      const teamId =
        entity === 'TEAM'
          ? entityId
          : (
              await this.prisma.sportsTeamChangeRequest.findUnique({
                where: { id: entityId },
                select: { teamId: true },
              })
            )?.teamId;
      if (!teamId) {
        return [];
      }
      return this.findMatchIds(tournamentId, {
        OR: [
          { homeRegistration: { teamId } },
          { awayRegistration: { teamId } },
          { winnerRegistration: { teamId } },
          { loserRegistration: { teamId } },
        ],
      });
    }
    return [];
  }

  private async findMatchIds(tournamentId: string, where?: Prisma.SportsMatchWhereInput): Promise<string[]> {
    const matches = await this.prisma.sportsMatch.findMany({
      where: {
        category: { tournamentId },
        ...where,
      },
      select: { id: true },
    });
    return matches.map((match) => match.id);
  }
}
