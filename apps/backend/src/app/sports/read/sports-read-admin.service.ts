import { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminSportsCategoryRead,
  AdminSportsMatchReviewRead,
  AdminSportsRegistrationRead,
  AdminSportsTeamRead,
  AdminSportsTournamentRead,
} from './sports-read.models';
import {
  ADMIN_CATEGORY_SELECT,
  ADMIN_REGISTRATION_SELECT,
  ADMIN_TEAM_SELECT,
  ADMIN_TOURNAMENT_SELECT,
} from './sports-read.records';
import { SportsReadAdminMapper } from './sports-read-admin.mapper';
import { SportsReadAdminListService } from './sports-read-admin-list.service';

export class SportsReadAdminService {
  private readonly mapper = new SportsReadAdminMapper();
  private readonly listReader: SportsReadAdminListService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
  ) {
    this.listReader = new SportsReadAdminListService(prisma, authorizationPolicy);
  }

  async adminTournamentList(
    ...args: Parameters<SportsReadAdminListService['adminTournamentList']>
  ): ReturnType<SportsReadAdminListService['adminTournamentList']> {
    return this.listReader.adminTournamentList(...args);
  }

  async adminTournament(user: AuthenticatedUser | undefined, tournamentId: string): Promise<AdminSportsTournamentRead> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.SportsTournament.Read], {
      sportsTournamentId: tournamentId,
    });
    const [tournament, categories] = await Promise.all([
      this.prisma.sportsTournament.findFirst({
        where: { id: tournamentId, deletedAt: null },
        select: ADMIN_TOURNAMENT_SELECT,
      }),
      this.prisma.sportsCategory.findMany({
        where: { tournamentId, deletedAt: null },
        select: ADMIN_CATEGORY_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    if (!tournament) {
      throw new NotFoundException(`Sports tournament ${tournamentId} was not found.`);
    }
    const readableCategories = [];
    for (const category of categories) {
      if (await this.hasScopedPermission(user, Permission.SportsTournament.Read, { sportsCategoryId: category.id })) {
        readableCategories.push(category);
      }
    }
    const canReadAllCategories = readableCategories.length === categories.length;
    const readableCategoryIds = readableCategories.map((category) => category.id);
    const canReadOfficials = await this.hasScopedPermission(user, Permission.SportsOfficial.Read, {
      sportsTournamentId: tournamentId,
    });
    const [teams, scoreEntries, venues, officials] = await Promise.all([
      this.prisma.sportsTeam.findMany({
        where: {
          tournamentId,
          deletedAt: null,
          ...(canReadAllCategories
            ? {}
            : {
                registrations: {
                  some: {
                    categoryId: { in: readableCategoryIds },
                    deletedAt: null,
                  },
                },
              }),
        },
        select: {
          ...ADMIN_TEAM_SELECT,
          registrations: {
            where: {
              deletedAt: null,
              ...(canReadAllCategories ? {} : { categoryId: { in: readableCategoryIds } }),
            },
            select: {
              id: true,
              categoryId: true,
              status: true,
              category: {
                select: {
                  name: true,
                  eventGroup: { select: { emoji: true } },
                },
              },
            },
            orderBy: [{ category: { name: 'asc' } }, { id: 'asc' }],
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsTournamentScoreEntry.findMany({
        where: {
          tournamentId,
          deletedAt: null,
          ...(canReadAllCategories ? {} : { categoryId: { in: readableCategoryIds } }),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsVenue.findMany({
        where: { tournamentId, deletedAt: null },
        orderBy: [{ name: 'asc' }, { courtLabel: 'asc' }, { id: 'asc' }],
      }),
      canReadOfficials
        ? this.prisma.sportsOfficialAssignment.findMany({
            where: {
              tournamentId,
              categoryId: null,
              matchId: null,
              active: true,
              revokedAt: null,
            },
            orderBy: [{ role: 'asc' }, { assignedAt: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
    ]);
    return {
      tournament: this.mapper.mapAdminTournament(tournament),
      categories: readableCategories.map((category) => this.mapper.mapAdminCategory(category)),
      teams: teams.map((team) => this.mapper.mapAdminTeam(team)),
      scoreEntries: scoreEntries.map((entry) => this.mapper.mapAdminScoreEntry(entry)),
      venues,
      officials,
      teamSummaries: teams.map((team) => ({
        team: this.mapper.mapAdminTeam(team),
        registrations: team.registrations.map((registration) => ({
          id: registration.id,
          categoryId: registration.categoryId,
          categoryName: registration.category.name,
          categoryEmoji: registration.category.eventGroup.emoji || '🏅',
          status: registration.status,
        })),
      })),
    };
  }

  async adminCategory(user: AuthenticatedUser | undefined, categoryId: string): Promise<AdminSportsCategoryRead> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.SportsCategory.Read], {
      sportsCategoryId: categoryId,
    });
    const canReadOfficials = await this.hasScopedPermission(user, Permission.SportsOfficial.Read, {
      sportsCategoryId: categoryId,
    });
    const [category, registrations, stages, matches, standings, placements, officials] = await Promise.all([
      this.prisma.sportsCategory.findFirst({
        where: { id: categoryId, deletedAt: null },
        select: ADMIN_CATEGORY_SELECT,
      }),
      this.prisma.sportsRegistration.findMany({
        where: { categoryId, deletedAt: null },
        select: ADMIN_REGISTRATION_SELECT,
        orderBy: [{ seed: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsStage.findMany({
        where: { categoryId, deletedAt: null },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsMatch.findMany({
        where: { categoryId, deletedAt: null },
        include: { event: true },
        orderBy: [{ roundNumber: 'asc' }, { bracketPosition: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsStanding.findMany({
        where: { stage: { categoryId, deletedAt: null } },
        orderBy: [{ rank: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsCategoryPlacement.findMany({
        where: { categoryId },
        orderBy: [{ placement: 'asc' }, { id: 'asc' }],
      }),
      canReadOfficials
        ? this.prisma.sportsOfficialAssignment.findMany({
            where: {
              categoryId,
              matchId: null,
              active: true,
              revokedAt: null,
            },
            orderBy: [{ role: 'asc' }, { assignedAt: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
    ]);
    if (!category) {
      throw new NotFoundException(`Sports category ${categoryId} was not found.`);
    }
    return {
      category: this.mapper.mapAdminCategory(category),
      registrations: registrations.map((registration) => this.mapper.mapAdminRegistration(registration)),
      stages: stages.map((stage) => this.mapper.mapAdminStage(stage)),
      matches: matches.map((match) => this.mapper.mapAdminMatch(match)),
      standings: standings.map((standing) => this.mapper.mapAdminStanding(standing)),
      placements: placements.map((placement) => this.mapper.mapAdminPlacement(placement)),
      officials,
    };
  }

  async adminTeam(user: AuthenticatedUser | undefined, teamId: string): Promise<AdminSportsTeamRead> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.SportsTeam.Read], {
      sportsTeamId: teamId,
    });
    const [team, registrations] = await Promise.all([
      this.prisma.sportsTeam.findFirst({
        where: { id: teamId, deletedAt: null },
        select: ADMIN_TEAM_SELECT,
      }),
      this.prisma.sportsRegistration.findMany({
        where: { teamId, deletedAt: null },
        select: ADMIN_REGISTRATION_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    if (!team) {
      throw new NotFoundException(`Sports team ${teamId} was not found.`);
    }
    const canReadRepresentatives = await this.hasScopedPermission(user, Permission.SportsTeam.Read, {
      sportsTournamentId: team.tournamentId,
    });
    const representatives = canReadRepresentatives
      ? await this.prisma.sportsTeamRepresentative.findMany({
          where: { teamId },
          select: {
            id: true,
            teamId: true,
            personId: true,
            person: { select: { id: true, name: true } },
            active: true,
            assignedAt: true,
            revokedAt: true,
          },
          orderBy: [{ active: 'desc' }, { assignedAt: 'asc' }],
        })
      : [];
    const readableRegistrations = [];
    for (const registration of registrations) {
      if (
        await this.hasScopedPermission(user, Permission.SportsTeam.Read, {
          sportsCategoryId: registration.categoryId,
        })
      ) {
        readableRegistrations.push(registration);
      }
    }
    const readableCategoryIds = readableRegistrations.map((registration) => registration.categoryId);
    const canReadAllMembers = readableRegistrations.length === registrations.length;
    const members = await this.prisma.sportsTeamMember.findMany({
      where: {
        teamId,
        deletedAt: null,
        ...(canReadAllMembers
          ? {}
          : {
              categoryAssignments: {
                some: {
                  categoryId: { in: readableCategoryIds },
                  deletedAt: null,
                },
              },
            }),
      },
      select: {
        id: true,
        teamId: true,
        participantId: true,
        status: true,
        revision: true,
        participant: {
          select: {
            person: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const canReview = await this.hasScopedPermission(user, Permission.SportsTeam.Review, { sportsTeamId: teamId });
    const changeRequests = canReview
      ? await this.prisma.sportsTeamChangeRequest.findMany({
          where: { teamId },
          include: {
            identityClaims: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })
      : [];
    return {
      team: this.mapper.mapAdminTeam(team),
      members: members.map((member) => this.mapper.mapAdminTeamMember(member)),
      representatives: representatives.map((representative) => this.mapper.mapAdminRepresentative(representative)),
      registrations: readableRegistrations.map((registration) => this.mapper.mapAdminRegistration(registration)),
      changeRequests: changeRequests.map((request) => this.mapper.mapAdminChangeRequest(request)),
    };
  }

  async adminRegistration(
    user: AuthenticatedUser | undefined,
    registrationId: string,
  ): Promise<AdminSportsRegistrationRead> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.SportsRegistration.Read], {
      sportsRegistrationId: registrationId,
    });
    const [registration, members, rosters] = await Promise.all([
      this.prisma.sportsRegistration.findFirst({
        where: { id: registrationId, deletedAt: null },
        select: ADMIN_REGISTRATION_SELECT,
      }),
      this.prisma.sportsRegistrationMember.findMany({
        where: { registrationId, deletedAt: null },
        include: {
          teamMember: {
            select: {
              participant: {
                select: {
                  person: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.sportsMatchRoster.findMany({
        where: { registrationId, deletedAt: null },
        include: {
          entries: {
            where: { deletedAt: null },
            orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    if (!registration) {
      throw new NotFoundException(`Sports registration ${registrationId} was not found.`);
    }
    return {
      registration: this.mapper.mapAdminRegistration(registration),
      members: members.map((member) => this.mapper.mapAdminRegistrationMember(member)),
      rosters: rosters.map((roster) => this.mapper.mapAdminRoster(roster)),
    };
  }

  async adminMatchReview(user: AuthenticatedUser | undefined, matchId: string): Promise<AdminSportsMatchReviewRead> {
    await this.authorizationPolicy.assertPermissions(
      user,
      [Permission.SportsMatch.Read, Permission.SportsMatch.Review],
      { sportsMatchId: matchId },
    );
    const [match, actions, rosters, officials] = await Promise.all([
      this.prisma.sportsMatch.findFirst({
        where: { id: matchId, deletedAt: null },
        include: { event: true },
      }),
      this.prisma.sportsMatchAction.findMany({
        where: { matchId },
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsMatchRoster.findMany({
        where: { matchId, deletedAt: null },
        include: {
          entries: {
            where: { deletedAt: null },
            orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsOfficialAssignment.findMany({
        where: { matchId },
        include: { person: true },
        orderBy: [{ role: 'asc' }, { assignedAt: 'asc' }],
      }),
    ]);
    if (!match) {
      throw new NotFoundException(`Sports match ${matchId} was not found.`);
    }
    return {
      match: this.mapper.mapAdminMatch(match),
      actions: actions.map((action) => this.mapper.mapAdminAction(action)),
      rosters: rosters.map((roster) => this.mapper.mapAdminRoster(roster)),
      officials: officials.map((official) => this.mapper.mapAdminOfficial(official)),
    };
  }

  private async hasScopedPermission(
    user: AuthenticatedUser | undefined,
    permission: Permission,
    context: Parameters<AuthorizationPolicyService['assertPermissions']>[2],
  ): Promise<boolean> {
    try {
      await this.authorizationPolicy.assertPermissions(user, [permission], context);
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return false;
      }
      throw error;
    }
  }
}
