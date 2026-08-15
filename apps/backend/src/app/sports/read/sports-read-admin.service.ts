import { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  SportsEligibilityStatus,
  SportsParticipantStatus,
  SportsRosterRole,
  SportsTeamMemberStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  AuthorizationPolicyService,
  type AccessibleEventGrantTargets,
} from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminSportsCategoryRead,
  AdminSportsMatchActionReview,
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
    const tournamentTargets = await this.authorizationPolicy.accessibleEventTargets(
      user,
      Permission.SportsTournament.Read,
    );
    const [tournament, categories] = await Promise.all([
      this.prisma.sportsTournament.findFirst({
        where: { id: tournamentId, deletedAt: null, ...this.tournamentVisibility(tournamentTargets) },
        select: ADMIN_TOURNAMENT_SELECT,
      }),
      this.prisma.sportsCategory.findMany({
        where: { tournamentId, deletedAt: null, ...this.categoryVisibility(tournamentTargets) },
        select: ADMIN_CATEGORY_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    if (!tournament) {
      throw new NotFoundException(`Sports tournament ${tournamentId} was not found.`);
    }
    const readableCategoryIds = categories.map((category) => category.id);
    const [canReadOfficials, canReadPersonContacts] = await Promise.all([
      this.hasScopedPermission(user, Permission.SportsOfficial.Read, {
        sportsTournamentId: tournamentId,
      }),
      this.hasScopedPermission(user, Permission.Person.Read, {}),
    ]);
    const officialPersonSelect = this.officialPersonSelect(canReadPersonContacts);
    const [canReadTeams, canReadRegistrations, canReadScores] = await Promise.all([
      this.hasScopedPermission(user, Permission.SportsTeam.Read, { sportsTournamentId: tournamentId }),
      this.hasScopedPermission(user, Permission.SportsRegistration.Read, { sportsTournamentId: tournamentId }),
      this.hasScopedPermission(user, Permission.SportsScore.Read, { sportsTournamentId: tournamentId }),
    ]);
    const teamTargets = canReadTeams
      ? await this.authorizationPolicy.accessibleEventTargets(user, Permission.SportsTeam.Read)
      : null;
    const registrationTargets = canReadRegistrations
      ? await this.authorizationPolicy.accessibleEventTargets(user, Permission.SportsRegistration.Read)
      : null;
    const registrationCategoryVisibility = this.categoryVisibility(registrationTargets);
    const canReadAllTournamentParticipants =
      registrationTargets === null || registrationTargets.majorEventIds.has(tournament.majorEventId);
    const [teams, participants, scoreEntries, venues, officials] = await Promise.all([
      canReadTeams
        ? this.prisma.sportsTeam.findMany({
            where: {
              tournamentId,
              deletedAt: null,
              ...this.teamVisibility(teamTargets),
            },
            select: {
              ...ADMIN_TEAM_SELECT,
              registrations: {
                where: {
                  deletedAt: null,
                  ...(readableCategoryIds.length
                    ? { categoryId: { in: readableCategoryIds } }
                    : { id: '__no_sports_registration_access__' }),
                  ...(canReadRegistrations ? {} : { id: '__no_sports_registration_access__' }),
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
          })
        : Promise.resolve([]),
      canReadRegistrations
        ? this.prisma.sportsTournamentParticipant.findMany({
            where: {
              tournamentId,
              deletedAt: null,
              person: { deletedAt: null },
              ...(canReadAllTournamentParticipants
                ? {}
                : {
                    teamMemberships: {
                      some: {
                        deletedAt: null,
                        status: SportsTeamMemberStatus.APPROVED,
                        categoryAssignments: {
                          some: {
                            deletedAt: null,
                            registration: {
                              deletedAt: null,
                              category: { deletedAt: null, ...registrationCategoryVisibility },
                            },
                          },
                        },
                      },
                    },
                  }),
            },
            select: {
              id: true,
              source: true,
              status: true,
              paymentStatus: true,
              person: { select: { id: true, name: true } },
              teamMemberships: {
                where: canReadTeams
                  ? {
                      deletedAt: null,
                      status: SportsTeamMemberStatus.APPROVED,
                      team: { deletedAt: null, ...this.teamVisibility(teamTargets) },
                    }
                  : { id: '__no_sports_team_access__' },
                select: {
                  id: true,
                  status: true,
                  team: { select: { id: true, name: true } },
                  categoryAssignments: {
                    where: {
                      deletedAt: null,
                      registration: {
                        deletedAt: null,
                        categoryId: { in: readableCategoryIds },
                        category: { deletedAt: null, ...registrationCategoryVisibility },
                      },
                    },
                    select: {
                      registration: {
                        select: {
                          category: { select: { id: true, name: true, division: true } },
                        },
                      },
                    },
                  },
                },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              },
            },
            orderBy: [{ person: { name: 'asc' } }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      canReadScores
        ? this.prisma.sportsTournamentScoreEntry.findMany({
            where: {
              tournamentId,
              deletedAt: null,
              ...(readableCategoryIds.length
                ? { categoryId: { in: readableCategoryIds } }
                : { id: '__no_sports_score_access__' }),
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
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
            include: { person: { select: officialPersonSelect } },
            orderBy: [{ role: 'asc' }, { assignedAt: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
    ]);
    return {
      tournament: this.mapper.mapAdminTournament(tournament),
      categories: categories.map((category) => this.mapper.mapAdminCategory(category)),
      teams: teams.map((team) => this.mapper.mapAdminTeam(team)),
      scoreEntries: scoreEntries.map((entry) => this.mapper.mapAdminScoreEntry(entry)),
      venues,
      officials: officials.map((official) => this.mapper.mapAdminOfficial(official, canReadPersonContacts)),
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
      participants: participants.map((participant) => ({
        id: participant.id,
        person: participant.person,
        source: participant.source,
        status: participant.status,
        paymentStatus: participant.paymentStatus,
        teams: participant.teamMemberships.map((membership) => ({
          memberId: membership.id,
          teamId: membership.team.id,
          teamName: membership.team.name,
          status: membership.status,
          categories: membership.categoryAssignments.map((assignment) => assignment.registration.category),
        })),
      })),
    };
  }

  async adminCategory(user: AuthenticatedUser | undefined, categoryId: string): Promise<AdminSportsCategoryRead> {
    const categoryTargets = await this.authorizationPolicy.accessibleEventTargets(user, Permission.SportsCategory.Read);
    const [canReadOfficials, canReadPersonContacts, canReadRegistrations, canReadMatches, canReadScores] =
      await Promise.all([
        this.hasScopedPermission(user, Permission.SportsOfficial.Read, { sportsCategoryId: categoryId }),
        this.hasScopedPermission(user, Permission.Person.Read, {}),
        this.hasScopedPermission(user, Permission.SportsRegistration.Read, { sportsCategoryId: categoryId }),
        this.hasScopedPermission(user, Permission.SportsMatch.Read, { sportsCategoryId: categoryId }),
        this.hasScopedPermission(user, Permission.SportsScore.Read, { sportsCategoryId: categoryId }),
      ]);
    const officialPersonSelect = this.officialPersonSelect(canReadPersonContacts);
    const [category, registrations, stages, matches, standings, placements, officials] = await Promise.all([
      this.prisma.sportsCategory.findFirst({
        where: { id: categoryId, deletedAt: null, ...this.categoryVisibility(categoryTargets) },
        select: ADMIN_CATEGORY_SELECT,
      }),
      canReadRegistrations
        ? this.prisma.sportsRegistration.findMany({
            where: { categoryId, deletedAt: null },
            select: ADMIN_REGISTRATION_SELECT,
            orderBy: [{ seed: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      this.prisma.sportsStage.findMany({
        where: { categoryId, deletedAt: null },
        orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
      }),
      canReadMatches
        ? this.prisma.sportsMatch.findMany({
            where: { categoryId, deletedAt: null },
            include: { event: true },
            orderBy: [{ roundNumber: 'asc' }, { bracketPosition: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      canReadScores
        ? this.prisma.sportsStanding.findMany({
            where: { stage: { categoryId, deletedAt: null } },
            orderBy: [{ rank: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      canReadScores
        ? this.prisma.sportsCategoryPlacement.findMany({
            where: { categoryId },
            orderBy: [{ placement: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      canReadOfficials
        ? this.prisma.sportsOfficialAssignment.findMany({
            where: {
              categoryId,
              matchId: null,
              active: true,
              revokedAt: null,
            },
            include: { person: { select: officialPersonSelect } },
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
      officials: officials.map((official) => this.mapper.mapAdminOfficial(official, canReadPersonContacts)),
    };
  }

  async adminTeam(user: AuthenticatedUser | undefined, teamId: string): Promise<AdminSportsTeamRead> {
    const teamTargets = await this.authorizationPolicy.accessibleEventTargets(user, Permission.SportsTeam.Read);
    const canReadRegistrations = await this.hasScopedPermission(user, Permission.SportsRegistration.Read, {
      sportsTeamId: teamId,
    });
    const [team, registrations] = await Promise.all([
      this.prisma.sportsTeam.findFirst({
        where: {
          id: teamId,
          deletedAt: null,
          ...this.teamVisibility(teamTargets),
        },
        select: ADMIN_TEAM_SELECT,
      }),
      canReadRegistrations
        ? this.prisma.sportsRegistration.findMany({
            where: { teamId, deletedAt: null },
            select: ADMIN_REGISTRATION_SELECT,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
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
        categoryAssignments: {
          where: {
            deletedAt: null,
            ...(readableCategoryIds.length ? { categoryId: { in: readableCategoryIds } } : {}),
          },
          select: {
            id: true,
            registrationId: true,
            categoryId: true,
            shirtNumber: true,
            gameNickname: true,
            gameAccountName: true,
            gameAccountUrl: true,
            category: {
              select: {
                athleteIdentifierMode: true,
                name: true,
                eventGroup: { select: { emoji: true } },
              },
            },
          },
          orderBy: [{ category: { name: 'asc' } }, { id: 'asc' }],
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
    const registration = await this.prisma.sportsRegistration.findFirst({
      where: { id: registrationId, deletedAt: null },
      select: ADMIN_REGISTRATION_SELECT,
    });
    if (!registration) {
      throw new NotFoundException(`Sports registration ${registrationId} was not found.`);
    }
    const [members, teamMembers, rosters] = await Promise.all([
      this.prisma.sportsRegistrationMember.findMany({
        where: { registrationId, deletedAt: null },
        include: {
          category: {
            select: { athleteIdentifierMode: true },
          },
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
      this.prisma.sportsTeamMember.findMany({
        where: {
          teamId: registration.teamId,
          deletedAt: null,
          participant: { deletedAt: null },
        },
        select: {
          id: true,
          participant: {
            select: {
              status: true,
              person: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
    const lineupMembers = teamMembers.map((teamMember) => {
      const registrationMember = members.find((member) => member.teamMemberId === teamMember.id);
      return this.mapper.mapAdminRegistrationLineupMember({
        id: registrationMember?.id ?? teamMember.id,
        registrationMemberId: registrationMember?.id ?? null,
        teamMemberId: teamMember.id,
        role: registrationMember?.role ?? SportsRosterRole.PLAYER,
        eligibility:
          registrationMember?.eligibility ??
          (teamMember.participant.status === SportsParticipantStatus.ACTIVE
            ? SportsEligibilityStatus.ELIGIBLE
            : SportsEligibilityStatus.PENDING),
        shirtNumber: registrationMember?.shirtNumber ?? null,
        person: teamMember.participant.person,
      });
    });
    const lineupTeamMemberIds = new Set(teamMembers.map((teamMember) => teamMember.id));
    for (const member of members) {
      if (lineupTeamMemberIds.has(member.teamMemberId)) {
        continue;
      }
      lineupMembers.push(
        this.mapper.mapAdminRegistrationLineupMember({
          id: member.id,
          registrationMemberId: member.id,
          teamMemberId: member.teamMemberId,
          role: member.role,
          eligibility: member.eligibility,
          shirtNumber: member.shirtNumber,
          person: member.teamMember.participant.person,
        }),
      );
    }
    return {
      registration: this.mapper.mapAdminRegistration(registration),
      members: members.map((member) => this.mapper.mapAdminRegistrationMember(member)),
      lineupMembers,
      rosters: rosters.map((roster) => this.mapper.mapAdminRoster(roster)),
    };
  }

  async adminMatchReview(user: AuthenticatedUser | undefined, matchId: string): Promise<AdminSportsMatchReviewRead> {
    await this.authorizationPolicy.assertPermissions(
      user,
      [Permission.SportsMatch.Read, Permission.SportsMatch.Review],
      { sportsMatchId: matchId },
    );
    const [canReadOfficials, canReadPersonContacts] = await Promise.all([
      this.hasScopedPermission(user, Permission.SportsOfficial.Read, { sportsMatchId: matchId }),
      this.hasScopedPermission(user, Permission.Person.Read, {}),
    ]);
    const officialPersonSelect = this.officialPersonSelect(canReadPersonContacts);
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
      canReadOfficials
        ? this.prisma.sportsOfficialAssignment.findMany({
            where: { matchId, active: true, revokedAt: null },
            include: { person: { select: officialPersonSelect } },
            orderBy: [{ role: 'asc' }, { assignedAt: 'asc' }],
          })
        : Promise.resolve([]),
    ]);
    if (!match) {
      throw new NotFoundException(`Sports match ${matchId} was not found.`);
    }
    return {
      match: this.mapper.mapAdminMatch(match),
      actions: actions.map((action) => this.mapper.mapAdminAction(action)),
      rosters: rosters.map((roster) => this.mapper.mapAdminRoster(roster)),
      officials: officials.map((official) => this.mapper.mapAdminOfficial(official, canReadPersonContacts)),
    };
  }

  async adminMatchActionReviewQueue(
    user: AuthenticatedUser | undefined,
    tournamentId: string,
  ): Promise<AdminSportsMatchActionReview[]> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.SportsTournament.Read], {
      sportsTournamentId: tournamentId,
    });
    const [readTargets, reviewTargets] = await Promise.all([
      this.authorizationPolicy.accessibleEventTargets(user, Permission.SportsMatch.Read),
      this.authorizationPolicy.accessibleEventTargets(user, Permission.SportsMatch.Review),
    ]);
    if (this.hasNoAccessibleTargets(readTargets) || this.hasNoAccessibleTargets(reviewTargets)) {
      return [];
    }

    const actions = await this.prisma.sportsMatchAction.findMany({
      where: {
        reviewStatus: 'PENDING',
        match: {
          deletedAt: null,
          category: {
            deletedAt: null,
            tournamentId,
          },
          event: { deletedAt: null },
          AND: [this.matchVisibility(readTargets), this.matchVisibility(reviewTargets)],
        },
      },
      include: {
        match: {
          include: {
            event: true,
            category: { select: { id: true, name: true } },
            homeRegistration: { select: { team: { select: { name: true } } } },
            awayRegistration: { select: { team: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ authoredAt: 'asc' }, { id: 'asc' }],
    });

    return actions.map((record) => ({
      action: this.mapper.mapAdminAction(record),
      match: this.mapper.mapAdminMatch(record.match),
      categoryName: record.match.category.name,
      homeTeamName: record.match.homeRegistration?.team.name ?? null,
      awayTeamName: record.match.awayRegistration?.team.name ?? null,
    }));
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

  private officialPersonSelect(includeContacts: boolean) {
    return includeContacts
      ? { id: true, name: true, email: true, phone: true }
      : { id: true, name: true };
  }

  private hasNoAccessibleTargets(targets: AccessibleEventGrantTargets | null): boolean {
    return Boolean(
      targets && targets.eventIds.size === 0 && targets.eventGroupIds.size === 0 && targets.majorEventIds.size === 0,
    );
  }

  private matchVisibility(targets: AccessibleEventGrantTargets | null): Prisma.SportsMatchWhereInput {
    if (targets === null) {
      return {};
    }
    const scopes: Prisma.SportsMatchWhereInput[] = [];
    if (targets.majorEventIds.size > 0) {
      scopes.push({ category: { tournament: { majorEventId: { in: [...targets.majorEventIds] } } } });
    }
    if (targets.eventGroupIds.size > 0) {
      scopes.push({ category: { eventGroupId: { in: [...targets.eventGroupIds] } } });
    }
    if (targets.eventIds.size > 0) {
      scopes.push({ eventId: { in: [...targets.eventIds] } });
    }
    return scopes.length ? { OR: scopes } : { id: '__no_sports_match_access__' };
  }

  private categoryVisibility(targets: AccessibleEventGrantTargets | null): Prisma.SportsCategoryWhereInput {
    if (targets === null) {
      return {};
    }
    const scopes: Prisma.SportsCategoryWhereInput[] = [];
    if (targets.majorEventIds.size > 0) {
      scopes.push({ tournament: { majorEventId: { in: [...targets.majorEventIds] } } });
    }
    if (targets.eventGroupIds.size > 0) {
      scopes.push({ eventGroupId: { in: [...targets.eventGroupIds] } });
    }
    if (targets.eventIds.size > 0) {
      scopes.push({ matches: { some: { deletedAt: null, eventId: { in: [...targets.eventIds] } } } });
    }
    return scopes.length ? { OR: scopes } : { id: '__no_sports_category_access__' };
  }

  private teamVisibility(targets: AccessibleEventGrantTargets | null): Prisma.SportsTeamWhereInput {
    if (targets === null) {
      return {};
    }
    const scopes: Prisma.SportsTeamWhereInput[] = [];
    if (targets.majorEventIds.size > 0) {
      scopes.push({ tournament: { majorEventId: { in: [...targets.majorEventIds] } } });
    }
    if (targets.eventGroupIds.size > 0 || targets.eventIds.size > 0) {
      scopes.push({
        registrations: {
          some: {
            deletedAt: null,
            category: this.categoryVisibility(targets),
          },
        },
      });
    }
    return scopes.length ? { OR: scopes } : { id: '__no_sports_team_access__' };
  }

  private tournamentVisibility(targets: AccessibleEventGrantTargets | null): Prisma.SportsTournamentWhereInput {
    if (targets === null) {
      return {};
    }
    const scopes: Prisma.SportsTournamentWhereInput[] = [];
    if (targets.majorEventIds.size > 0) {
      scopes.push({ majorEventId: { in: [...targets.majorEventIds] } });
    }
    if (targets.eventGroupIds.size > 0 || targets.eventIds.size > 0) {
      scopes.push({ categories: { some: { deletedAt: null, ...this.categoryVisibility(targets) } } });
    }
    return scopes.length ? { OR: scopes } : { id: '__no_sports_tournament_access__' };
  }
}
