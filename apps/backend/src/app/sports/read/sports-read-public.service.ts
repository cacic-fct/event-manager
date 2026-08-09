import { BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import {
  Prisma,
  PublicationState,
  SportsCategoryStatus,
  SportsRegistrationStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PublicSportsBracket,
  PublicSportsCategory,
  PublicSportsMatch,
  PublicSportsOverallScore,
  PublicSportsPlacement,
  PublicSportsStanding,
  PublicSportsTournamentDetail,
} from './sports-read.models';
import { PUBLIC_SPORTS_MATCH_RELATIONS_WHERE } from '../security/sports-public-visibility';

import { PUBLIC_MATCH_SELECT, PUBLIC_TEAM_SELECT } from './sports-read.records';

import { SportsReadPublicCache } from './sports-read-public.cache';
import { SportsReadPublicLoader } from './sports-read-public.loader';
import { SportsReadPublicMapper } from './sports-read-public.mapper';

export class SportsReadPublicService {
  private readonly publicTournamentRefreshes = new Map<string, Promise<PublicSportsTournamentDetail>>();
  private readonly cache: SportsReadPublicCache;
  private readonly mapper = new SportsReadPublicMapper();
  private readonly loader: SportsReadPublicLoader;
  readonly mapPublicTeam: SportsReadPublicMapper['mapPublicTeam'];

  constructor(
    private readonly prisma: PrismaService,
    @Optional() redis?: Redis,
  ) {
    this.cache = new SportsReadPublicCache(redis);
    this.loader = new SportsReadPublicLoader(prisma, this.mapper);
    this.mapPublicTeam = this.mapper.mapPublicTeam.bind(this.mapper);
  }

  async publicTournament(input: {
    tournamentId?: string | null;
    majorEventId?: string | null;
  }): Promise<PublicSportsTournamentDetail> {
    const target = this.normalizePublicTarget(input);
    const tournament = await this.prisma.sportsTournament.findFirst({
      where: {
        ...(target.tournamentId ? { id: target.tournamentId } : { majorEventId: target.majorEventId }),
        deletedAt: null,
        status: { not: SportsTournamentStatus.DRAFT },
        majorEvent: {
          deletedAt: null,
          publicationState: PublicationState.PUBLISHED,
        },
      },
      select: {
        id: true,
        majorEventId: true,
        selfSubscriptionEnabled: true,
        selfSubscriptionAllowNoTeam: true,
        selfSubscriptionAllowNoCategory: true,
        majorEvent: {
          select: {
            name: true,
            emoji: true,
            description: true,
            startDate: true,
            endDate: true,
            requiresImageLicenseAgreement: true,
            isPaymentRequired: true,
            majorEventPrices: {
              select: {
                tiers: {
                  select: {
                    id: true,
                    name: true,
                    value: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!tournament) {
      throw new NotFoundException('Sports tournament was not found.');
    }
    return this.loadPublicTournament(tournament);
  }

  async publicMatch(matchId: string): Promise<PublicSportsMatch> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: this.publicMatchWhere({ id: matchId }),
      select: PUBLIC_MATCH_SELECT,
    });
    if (!match) {
      throw new NotFoundException(`Sports match ${matchId} was not found.`);
    }
    const projected = this.mapper.projectPublicMatch(match);
    const [rosters, officials] = await Promise.all([
      this.loader.loadPublicRosters(this.mapper.canRevealRoster(projected.state) ? [match.id] : []),
      this.loader.loadPublicOfficials(match.categoryId, [match.id]),
    ]);
    return this.mapper.mapPublicMatch(match, projected, rosters.get(match.id) ?? [], officials.get(match.id) ?? []);
  }

  private async loadPublicTournament(tournament: {
    id: string;
    majorEventId: string;
    selfSubscriptionEnabled: boolean;
    selfSubscriptionAllowNoTeam: boolean;
    selfSubscriptionAllowNoCategory: boolean;
    majorEvent: {
      name: string;
      emoji: string;
      description: string | null;
      startDate: Date;
      endDate: Date;
      requiresImageLicenseAgreement: boolean;
      isPaymentRequired: boolean;
      majorEventPrices: Array<{
        tiers: Array<{ id: string; name: string; value: number }>;
      }>;
    };
  }): Promise<PublicSportsTournamentDetail> {
    const cached = await this.cache.getCachedPublicTournament(tournament.id);
    if (cached) {
      return {
        ...cached,
        majorEventId: tournament.majorEventId,
        name: tournament.majorEvent.name,
        emoji: tournament.majorEvent.emoji,
        description: tournament.majorEvent.description,
        startDate: tournament.majorEvent.startDate,
        endDate: tournament.majorEvent.endDate,
        selfSubscriptionEnabled: tournament.selfSubscriptionEnabled,
        selfSubscriptionAllowNoTeam: tournament.selfSubscriptionAllowNoTeam,
        selfSubscriptionAllowNoCategory: tournament.selfSubscriptionAllowNoCategory,
        requiresImageLicenseAgreement: tournament.majorEvent.requiresImageLicenseAgreement,
        isPaymentRequired: tournament.majorEvent.isPaymentRequired,
        paymentTiers: tournament.majorEvent.majorEventPrices.flatMap((price) => price.tiers),
      };
    }

    const inFlight = this.publicTournamentRefreshes.get(tournament.id);
    if (inFlight) {
      return inFlight;
    }

    const refresh = this.generateAndCachePublicTournament(tournament);
    this.publicTournamentRefreshes.set(tournament.id, refresh);
    try {
      return await refresh;
    } finally {
      this.publicTournamentRefreshes.delete(tournament.id);
    }
  }

  private async generateAndCachePublicTournament(tournament: {
    id: string;
    majorEventId: string;
    selfSubscriptionEnabled: boolean;
    selfSubscriptionAllowNoTeam: boolean;
    selfSubscriptionAllowNoCategory: boolean;
    majorEvent: {
      name: string;
      emoji: string;
      description: string | null;
      startDate: Date;
      endDate: Date;
      requiresImageLicenseAgreement: boolean;
      isPaymentRequired: boolean;
      majorEventPrices: Array<{
        tiers: Array<{ id: string; name: string; value: number }>;
      }>;
    };
  }): Promise<PublicSportsTournamentDetail> {
    const cacheVersion = await this.cache.readPublicTournamentCacheVersion(tournament.id);
    const [categories, teams, stages, matches, standings, placements, scoreEntries] = await Promise.all([
      this.prisma.sportsCategory.findMany({
        where: {
          tournamentId: tournament.id,
          deletedAt: null,
          status: {
            not: SportsCategoryStatus.DRAFT,
          },
        },
        select: {
          id: true,
          name: true,
          sport: true,
          customSportName: true,
          division: true,
          format: true,
          rulesText: true,
          eventGroup: {
            select: { emoji: true },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsTeam.findMany({
        where: {
          tournamentId: tournament.id,
          deletedAt: null,
          status: SportsTeamStatus.ACTIVE,
        },
        select: PUBLIC_TEAM_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsStage.findMany({
        where: {
          deletedAt: null,
          category: {
            tournamentId: tournament.id,
            deletedAt: null,
            status: { not: SportsCategoryStatus.DRAFT },
          },
        },
        select: {
          id: true,
          categoryId: true,
          name: true,
          type: true,
          displayOrder: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsMatch.findMany({
        where: this.publicMatchWhere({ tournamentId: tournament.id }),
        select: PUBLIC_MATCH_SELECT,
        orderBy: [{ event: { startDate: 'asc' } }, { id: 'asc' }],
      }),
      this.prisma.sportsStanding.findMany({
        where: {
          stage: {
            deletedAt: null,
            category: {
              tournamentId: tournament.id,
              deletedAt: null,
              status: { not: SportsCategoryStatus.DRAFT },
            },
          },
          registration: {
            deletedAt: null,
            status: {
              in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
            },
          },
        },
        select: {
          stage: {
            select: {
              categoryId: true,
            },
          },
          registrationId: true,
          registration: {
            select: {
              team: {
                select: PUBLIC_TEAM_SELECT,
              },
            },
          },
          played: true,
          wins: true,
          draws: true,
          losses: true,
          scoreFor: true,
          scoreAgainst: true,
          points: true,
          rank: true,
        },
        orderBy: [{ rank: 'asc' }, { points: 'desc' }, { registrationId: 'asc' }],
      }),
      this.prisma.sportsCategoryPlacement.findMany({
        where: {
          category: {
            tournamentId: tournament.id,
            deletedAt: null,
            status: { not: SportsCategoryStatus.DRAFT },
          },
          registration: {
            deletedAt: null,
            status: {
              in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
            },
          },
        },
        select: {
          categoryId: true,
          registration: {
            select: {
              team: {
                select: PUBLIC_TEAM_SELECT,
              },
            },
          },
          placement: true,
          pointsAwarded: true,
        },
        orderBy: [{ placement: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsTournamentScoreEntry.findMany({
        where: {
          tournamentId: tournament.id,
          deletedAt: null,
          team: {
            deletedAt: null,
            status: SportsTeamStatus.ACTIVE,
          },
        },
        select: {
          teamId: true,
          team: {
            select: PUBLIC_TEAM_SELECT,
          },
          points: true,
        },
      }),
    ]);

    const projectedMatches = matches.map((match) => ({
      match,
      projection: this.mapper.projectPublicMatch(match),
    }));
    const rosterVisibleMatchIds = projectedMatches
      .filter(({ projection }) => this.mapper.canRevealRoster(projection.state))
      .map(({ match }) => match.id);
    const [rostersByMatch, officialsByMatch] = await Promise.all([
      this.loader.loadPublicRosters(rosterVisibleMatchIds),
      this.loader.loadPublicOfficialsForTournament(tournament.id, matches),
    ]);
    const publicMatches = projectedMatches.map(({ match, projection }) =>
      this.mapper.mapPublicMatch(
        match,
        projection,
        rostersByMatch.get(match.id) ?? [],
        officialsByMatch.get(match.id) ?? [],
      ),
    );
    const matchesByCategory = this.groupBy(publicMatches, (match) => match.categoryId);
    const stagesByCategory = this.groupBy(stages, (stage) => stage.categoryId);
    const standingsByCategory = this.groupBy(standings, (standing) => standing.stage.categoryId);
    const placementsByCategory = this.groupBy(placements, (placement) => placement.categoryId);

    const publicCategories: PublicSportsCategory[] = categories.map((category) => {
      const categoryMatches = matchesByCategory.get(category.id) ?? [];
      return {
        id: category.id,
        name: category.name,
        emoji: category.eventGroup.emoji || '🏅',
        sport: category.sport,
        customSportName: category.customSportName,
        division: category.division,
        format: category.format,
        rulesText: category.rulesText,
        standings: (standingsByCategory.get(category.id) ?? []).map(
          (standing): PublicSportsStanding => ({
            team: this.mapper.mapPublicTeam(standing.registration.team),
            played: standing.played,
            wins: standing.wins,
            draws: standing.draws,
            losses: standing.losses,
            scoreFor: standing.scoreFor,
            scoreAgainst: standing.scoreAgainst,
            points: standing.points,
            rank: standing.rank,
          }),
        ),
        placements: (placementsByCategory.get(category.id) ?? []).map(
          (placement): PublicSportsPlacement => ({
            team: this.mapper.mapPublicTeam(placement.registration.team),
            placement: placement.placement,
            pointsAwarded: placement.pointsAwarded,
          }),
        ),
        brackets: (stagesByCategory.get(category.id) ?? []).map(
          (stage): PublicSportsBracket => ({
            id: stage.id,
            name: stage.name,
            type: stage.type,
            displayOrder: stage.displayOrder,
            matches: categoryMatches.filter((match) => match.stageId === stage.id),
          }),
        ),
        matches: categoryMatches,
      };
    });

    const overallScoreByTeam = new Map<string, PublicSportsOverallScore>();
    for (const entry of scoreEntries) {
      const current = overallScoreByTeam.get(entry.teamId);
      if (current) {
        current.points += entry.points;
      } else {
        overallScoreByTeam.set(entry.teamId, {
          team: this.mapper.mapPublicTeam(entry.team),
          points: entry.points,
        });
      }
    }

    const detail: PublicSportsTournamentDetail = {
      id: tournament.id,
      majorEventId: tournament.majorEventId,
      name: tournament.majorEvent.name,
      emoji: tournament.majorEvent.emoji,
      description: tournament.majorEvent.description,
      startDate: tournament.majorEvent.startDate,
      endDate: tournament.majorEvent.endDate,
      selfSubscriptionEnabled: tournament.selfSubscriptionEnabled,
      selfSubscriptionAllowNoTeam: tournament.selfSubscriptionAllowNoTeam,
      selfSubscriptionAllowNoCategory: tournament.selfSubscriptionAllowNoCategory,
      requiresImageLicenseAgreement: tournament.majorEvent.requiresImageLicenseAgreement,
      isPaymentRequired: tournament.majorEvent.isPaymentRequired,
      paymentTiers: tournament.majorEvent.majorEventPrices.flatMap((price) => price.tiers),
      teams: teams.map((team) => this.mapper.mapPublicTeam(team)),
      categories: publicCategories,
      matches: publicMatches,
      overallScores: [...overallScoreByTeam.values()].sort(
        (left, right) => right.points - left.points || left.team.name.localeCompare(right.team.name),
      ),
    };
    await this.cache.cachePublicTournamentIfCurrent(tournament.id, cacheVersion, detail);
    return detail;
  }

  private publicMatchWhere(target: { id?: string; tournamentId?: string }): Prisma.SportsMatchWhereInput {
    return {
      ...(target.id ? { id: target.id } : {}),
      deletedAt: null,
      category: {
        ...(target.tournamentId ? { tournamentId: target.tournamentId } : {}),
        ...PUBLIC_SPORTS_MATCH_RELATIONS_WHERE.category,
      },
      event: PUBLIC_SPORTS_MATCH_RELATIONS_WHERE.event,
    };
  }

  private normalizePublicTarget(input: { tournamentId?: string | null; majorEventId?: string | null }): {
    tournamentId?: string;
    majorEventId?: string;
  } {
    const tournamentId = input.tournamentId?.trim();
    const majorEventId = input.majorEventId?.trim();
    if (Boolean(tournamentId) === Boolean(majorEventId)) {
      throw new BadRequestException('Provide exactly one of tournamentId or majorEventId.');
    }
    return tournamentId ? { tournamentId } : { majorEventId };
  }

  private groupBy<T, K>(values: readonly T[], key: (value: T) => K): Map<K, T[]> {
    const result = new Map<K, T[]>();
    for (const value of values) {
      const groupKey = key(value);
      const current = result.get(groupKey) ?? [];
      current.push(value);
      result.set(groupKey, current);
    }
    return result;
  }
}
