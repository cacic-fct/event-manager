import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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

@Injectable()
export class SportsMutationEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: SportsRealtimeService,
  ) {}

  async publishForEntity(
    entity: SportsMutationEntity,
    entityId: string,
    includePublic: boolean,
  ): Promise<void> {
    const tournamentId = await this.resolveTournamentId(entity, entityId);
    const payload = {
      type: 'INVALIDATE',
      entity,
      entityId,
      tournamentId,
      occurredAt: new Date().toISOString(),
    };
    const matchIds = includePublic
      ? await this.resolveAffectedMatchIds(entity, entityId, tournamentId)
      : [];
    await Promise.all([
      this.realtime.publish(
        this.realtime.scope('admin-tournament', tournamentId),
        payload,
      ),
      ...(includePublic
        ? [
            this.realtime.publish(
              this.realtime.scope('tournament', tournamentId),
              payload,
            ),
            ...matchIds.map((matchId) =>
              this.realtime.publish(
                this.realtime.scope('match', matchId),
                payload,
              ),
            ),
          ]
        : []),
    ]);
  }

  private async resolveTournamentId(
    entity: SportsMutationEntity,
    id: string,
  ): Promise<string> {
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
      throw new NotFoundException(
        `Sports ${entity.toLowerCase()} ${entityId} was not found.`,
      );
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
      const assignment =
        await this.prisma.sportsOfficialAssignment.findUnique({
          where: { id: entityId },
          select: { matchId: true, categoryId: true },
        });
      if (assignment?.matchId) {
        return [assignment.matchId];
      }
      return this.findMatchIds(
        tournamentId,
        assignment?.categoryId
          ? { categoryId: assignment.categoryId }
          : undefined,
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

  private async findMatchIds(
    tournamentId: string,
    where?: Prisma.SportsMatchWhereInput,
  ): Promise<string[]> {
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
