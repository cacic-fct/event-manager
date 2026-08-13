import { SportsRosterEntryStatus, SportsRosterStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toSportsPublicOfficialName, toSportsPublicPlayerName } from '../domain/sports-public-name';
import { PublicSportsOfficial, PublicSportsRoster } from './sports-read.models';

import { PUBLIC_TEAM_SELECT, PublicOfficialRecord, PublicRosterRecord } from './sports-read.records';

import { SportsReadPublicMapper } from './sports-read-public.mapper';

export class SportsReadPublicLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: SportsReadPublicMapper,
  ) {}

  async loadPublicRosters(matchIds: string[]): Promise<Map<string, PublicSportsRoster[]>> {
    if (matchIds.length === 0) {
      return new Map();
    }
    const rosters = (await this.prisma.sportsMatchRoster.findMany({
      where: {
        matchId: { in: matchIds },
        status: SportsRosterStatus.APPROVED,
        deletedAt: null,
      },
      select: {
        matchId: true,
        registration: {
          select: {
            team: {
              select: PUBLIC_TEAM_SELECT,
            },
          },
        },
        entries: {
          where: {
            status: SportsRosterEntryStatus.APPROVED,
            deletedAt: null,
          },
          select: {
            role: true,
            shirtNumber: true,
            registrationMember: {
              select: {
                gameNickname: true,
                gameAccountName: true,
                gameAccountUrl: true,
                category: {
                  select: { athleteIdentifierMode: true },
                },
                teamMember: {
                  select: {
                    participant: {
                      select: {
                        person: {
                          select: {
                            name: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ matchId: 'asc' }, { createdAt: 'asc' }],
    })) as PublicRosterRecord[];

    return this.groupBy(
      rosters.map((roster): [string, PublicSportsRoster] => [
        roster.matchId,
        {
          team: this.mapper.mapPublicTeam(roster.registration.team),
          entries: roster.entries.map((entry) => ({
            name: toSportsPublicPlayerName(entry.registrationMember.teamMember.participant.person.name),
            role: entry.role,
            athleteIdentifierMode: entry.registrationMember.category.athleteIdentifierMode,
            shirtNumber:
              entry.registrationMember.category.athleteIdentifierMode === 'SHIRT_NUMBER' ? entry.shirtNumber : null,
            gameNickname:
              entry.registrationMember.category.athleteIdentifierMode === 'GAME_ACCOUNT'
                ? entry.registrationMember.gameNickname
                : null,
            gameAccountName:
              entry.registrationMember.category.athleteIdentifierMode === 'GAME_ACCOUNT'
                ? entry.registrationMember.gameAccountName
                : null,
            gameAccountUrl:
              entry.registrationMember.category.athleteIdentifierMode === 'GAME_ACCOUNT'
                ? entry.registrationMember.gameAccountUrl
                : null,
          })),
        },
      ]),
      ([matchId]) => matchId,
      ([, roster]) => roster,
    );
  }

  async loadPublicOfficials(categoryId: string, matchIds: string[]): Promise<Map<string, PublicSportsOfficial[]>> {
    const category = await this.prisma.sportsCategory.findUnique({
      where: { id: categoryId },
      select: { tournamentId: true },
    });
    if (!category) {
      return new Map();
    }
    const matches = matchIds.map((id) => ({ id, categoryId }));
    return this.loadPublicOfficialsForTournament(category.tournamentId, matches);
  }

  async loadPublicOfficialsForTournament(
    tournamentId: string,
    matches: readonly { id: string; categoryId: string }[],
  ): Promise<Map<string, PublicSportsOfficial[]>> {
    if (matches.length === 0) {
      return new Map();
    }
    const assignments = (await this.prisma.sportsOfficialAssignment.findMany({
      where: {
        tournamentId,
        active: true,
        revokedAt: null,
        OR: [
          { matchId: { in: matches.map((match) => match.id) } },
          { categoryId: { in: [...new Set(matches.map((match) => match.categoryId))] }, matchId: null },
          { categoryId: null, matchId: null },
        ],
        person: {
          deletedAt: null,
        },
      },
      select: {
        tournamentId: true,
        categoryId: true,
        matchId: true,
        role: true,
        person: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { assignedAt: 'asc' }],
    })) as PublicOfficialRecord[];

    const result = new Map<string, PublicSportsOfficial[]>();
    for (const match of matches) {
      const seen = new Set<string>();
      const officials: PublicSportsOfficial[] = [];
      for (const assignment of assignments) {
        if (
          (assignment.matchId && assignment.matchId !== match.id) ||
          (!assignment.matchId && assignment.categoryId && assignment.categoryId !== match.categoryId)
        ) {
          continue;
        }
        const name = toSportsPublicOfficialName(assignment.person.name);
        const key = `${assignment.role}:${name}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        officials.push({ name, role: assignment.role });
      }
      result.set(match.id, officials);
    }
    return result;
  }

  private groupBy<T, K, V = T>(
    values: readonly T[],
    key: (value: T) => K,
    map: (value: T) => V = (value) => value as unknown as V,
  ): Map<K, V[]> {
    const result = new Map<K, V[]>();
    for (const value of values) {
      const groupKey = key(value);
      const current = result.get(groupKey) ?? [];
      current.push(map(value));
      result.set(groupKey, current);
    }
    return result;
  }
}
