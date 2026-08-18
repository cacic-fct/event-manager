import { Permission } from '@cacic-fct/shared-permissions';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AdminSportsTournamentListItem } from './sports-read.models';
import { ADMIN_TOURNAMENT_SELECT } from './sports-read.records';

export class SportsReadAdminListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
  ) {}

  async adminTournamentList(
    user: AuthenticatedUser | undefined,
    input: { query?: string; skip?: number; take?: number },
  ): Promise<AdminSportsTournamentListItem[]> {
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(
      user,
      Permission.SportsTournament.Read,
    );
    const where: Prisma.SportsTournamentWhereInput = {
      deletedAt: null,
    };

    if (accessibleTargets) {
      const scopes: Prisma.SportsTournamentWhereInput[] = [];
      if (accessibleTargets.majorEventIds.size > 0) {
        scopes.push({ majorEventId: { in: [...accessibleTargets.majorEventIds] } });
      }
      if (accessibleTargets.eventGroupIds.size > 0) {
        scopes.push({
          categories: {
            some: {
              deletedAt: null,
              eventGroupId: { in: [...accessibleTargets.eventGroupIds] },
            },
          },
        });
      }
      if (accessibleTargets.eventIds.size > 0) {
        scopes.push({
          categories: {
            some: {
              deletedAt: null,
              matches: {
                some: {
                  deletedAt: null,
                  eventId: { in: [...accessibleTargets.eventIds] },
                },
              },
            },
          },
        });
      }
      if (scopes.length === 0) {
        return [];
      }
      where.OR = scopes;
    }

    const normalizedQuery = input.query?.trim();
    if (normalizedQuery) {
      where.majorEvent = {
        deletedAt: null,
        name: { contains: normalizedQuery, mode: 'insensitive' },
      };
    } else {
      where.majorEvent = { deletedAt: null };
    }

    const skip = Math.max(0, input.skip ?? 0);
    const take = Math.min(100, Math.max(1, input.take ?? 25));
    const categoryVisibility: Prisma.SportsCategoryWhereInput = accessibleTargets
      ? {
          OR: [
            ...(accessibleTargets.majorEventIds.size > 0
              ? [{ tournament: { majorEventId: { in: [...accessibleTargets.majorEventIds] } } }]
              : []),
            ...(accessibleTargets.eventGroupIds.size > 0
              ? [{ eventGroupId: { in: [...accessibleTargets.eventGroupIds] } }]
              : []),
            ...(accessibleTargets.eventIds.size > 0
              ? [
                  {
                    matches: {
                      some: {
                        deletedAt: null,
                        eventId: { in: [...accessibleTargets.eventIds] },
                      },
                    },
                  },
                ]
              : []),
          ],
        }
      : {};
    const categoryManagementVisibility: Prisma.SportsCategoryWhereInput = accessibleTargets
      ? {
          OR: [
            ...(accessibleTargets.majorEventIds.size > 0
              ? [{ tournament: { majorEventId: { in: [...accessibleTargets.majorEventIds] } } }]
              : []),
            ...(accessibleTargets.eventGroupIds.size > 0
              ? [{ eventGroupId: { in: [...accessibleTargets.eventGroupIds] } }]
              : []),
          ],
        }
      : {};
    const matchVisibility: Prisma.SportsMatchWhereInput = accessibleTargets
      ? {
          OR: [
            ...(accessibleTargets.majorEventIds.size > 0
              ? [{ category: { tournament: { majorEventId: { in: [...accessibleTargets.majorEventIds] } } } }]
              : []),
            ...(accessibleTargets.eventGroupIds.size > 0
              ? [{ category: { eventGroupId: { in: [...accessibleTargets.eventGroupIds] } } }]
              : []),
            ...(accessibleTargets.eventIds.size > 0 ? [{ eventId: { in: [...accessibleTargets.eventIds] } }] : []),
          ],
        }
      : {};
    const teamVisibility: Prisma.SportsTeamWhereInput = accessibleTargets
      ? {
          OR: [
            ...(accessibleTargets.majorEventIds.size > 0
              ? [{ tournament: { majorEventId: { in: [...accessibleTargets.majorEventIds] } } }]
              : []),
            {
              registrations: {
                some: {
                  deletedAt: null,
                  category: categoryVisibility,
                },
              },
            },
          ],
        }
      : {};
    const fullTournamentVisibility: Prisma.SportsTournamentWhereInput = accessibleTargets
      ? { majorEventId: { in: [...accessibleTargets.majorEventIds] } }
      : {};
    const select = {
      ...ADMIN_TOURNAMENT_SELECT,
      majorEvent: {
        select: {
          id: true,
          name: true,
          emoji: true,
          startDate: true,
          endDate: true,
          subscriptionStartDate: true,
          subscriptionEndDate: true,
          isPaymentRequired: true,
        },
      },
      _count: {
        select: {
          categories: {
            where: { deletedAt: null, ...categoryVisibility },
          },
          teams: { where: { deletedAt: null, ...teamVisibility } },
          playerApplications: {
            where: {
              deletedAt: null,
              status: 'PENDING',
              tournament: fullTournamentVisibility,
            },
          },
        },
      },
      categories: {
        where: { deletedAt: null, ...categoryVisibility },
        select: {
          _count: {
            select: {
              matches: {
                where: {
                  deletedAt: null,
                  reviewStatus: 'PENDING',
                  ...matchVisibility,
                },
              },
              registrations: {
                where: {
                  deletedAt: null,
                  status: { in: ['PENDING', 'CHANGES_REQUESTED'] },
                  category: categoryManagementVisibility,
                },
              },
            },
          },
        },
      },
      teams: {
        where: { deletedAt: null, ...teamVisibility },
        select: {
          _count: {
            select: {
              changeRequests: {
                where: {
                  status: { in: ['PENDING', 'CONFLICT', 'CHANGES_REQUESTED'] },
                  team: {
                    tournament: fullTournamentVisibility,
                  },
                },
              },
            },
          },
        },
      },
    } satisfies Prisma.SportsTournamentSelect;
    const tournaments = await this.prisma.sportsTournament.findMany({
      where,
      orderBy: [{ majorEvent: { startDate: 'desc' } }, { id: 'asc' }],
      skip,
      take,
      select,
    });

    return tournaments.map((record) => {
      const { majorEvent, _count, categories, teams, ...tournament } = record;
      return {
        tournament,
        majorEvent,
        categoryCount: _count.categories,
        teamCount: _count.teams,
        pendingApplicationCount: _count.playerApplications,
        pendingReviewCount:
          categories.reduce((total, category) => total + category._count.matches + category._count.registrations, 0) +
          teams.reduce((total, team) => total + team._count.changeRequests, 0),
      };
    });
  }
}
