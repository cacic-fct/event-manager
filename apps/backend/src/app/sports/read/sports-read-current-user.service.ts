import { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  SportsCategoryStatus,
  SportsRegistrationStatus,
  SportsRosterEntryStatus,
  SportsRosterStatus,
  SportsTeamStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { toSportsPublicOfficialName, toSportsPublicPlayerName } from '../domain/sports-public-name';
import {
  CurrentUserSportsLineupRead,
  CurrentUserSportsMatchOperationsRead,
  CurrentUserSportsTournamentDetail,
  PublicSportsMatch,
} from './sports-read.models';
import { PUBLIC_TEAM_SELECT } from './sports-read.records';
import { SportsReadAdminMapper } from './sports-read-admin.mapper';
import { SportsReadPublicService } from './sports-read-public.service';
import { SportsReadRepresentativeService } from './sports-read-representative.service';

const SELF_SUBSCRIPTION_CATEGORY_STATUSES = [
  SportsCategoryStatus.REGISTRATION_OPEN,
  SportsCategoryStatus.ACTIVE,
] as const;

const SELF_SUBSCRIPTION_REGISTRATION_STATUSES = [
  SportsRegistrationStatus.APPROVED,
  SportsRegistrationStatus.WAITING_PAYMENT,
  SportsRegistrationStatus.ACTIVE,
] as const;

export class SportsReadCurrentUserService {
  private readonly mapper = new SportsReadAdminMapper();
  private readonly representativeReader: SportsReadRepresentativeService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly publicReader: SportsReadPublicService,
  ) {
    this.representativeReader = new SportsReadRepresentativeService(prisma, publicReader);
  }

  async currentUserTournament(
    input: { tournamentId?: string | null; majorEventId?: string | null },
    personId: string,
    requestedTeamId?: string | null,
  ): Promise<CurrentUserSportsTournamentDetail> {
    const tournament = await this.publicReader.publicTournament(input);
    const tournamentForResponse =
      requestedTeamId === undefined
        ? tournament
        : await this.filterSelfSubscriptionCategories(tournament, requestedTeamId);
    const [teamMemberships, rosterEntries, majorEventSubscription, athleteProfiles] = await Promise.all([
      this.prisma.sportsTeamMember.findMany({
        where: {
          status: 'APPROVED',
          deletedAt: null,
          team: {
            tournamentId: tournament.id,
            deletedAt: null,
          },
          participant: {
            personId,
            deletedAt: null,
          },
        },
        select: {
          teamId: true,
        },
      }),
      this.prisma.sportsMatchRosterEntry.findMany({
        where: {
          status: SportsRosterEntryStatus.APPROVED,
          deletedAt: null,
          roster: {
            status: SportsRosterStatus.APPROVED,
            deletedAt: null,
            match: {
              deletedAt: null,
              category: {
                tournamentId: tournament.id,
              },
            },
          },
          registrationMember: {
            deletedAt: null,
            teamMember: {
              deletedAt: null,
              participant: {
                personId,
                deletedAt: null,
              },
            },
          },
        },
        select: {
          roster: {
            select: {
              matchId: true,
            },
          },
        },
      }),
      this.prisma.majorEventSubscription.findFirst({
        where: {
          majorEventId: tournament.majorEventId,
          personId,
          deletedAt: null,
          subscriptionStatus: { not: 'CANCELED' },
        },
        select: {
          imageLicenseAgreementAccepted: true,
        },
      }),
      this.prisma.sportsRegistrationMember.findMany({
        where: {
          deletedAt: null,
          eligibility: 'ELIGIBLE',
          category: {
            tournamentId: tournament.id,
            deletedAt: null,
          },
          registration: {
            deletedAt: null,
            status: {
              in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
            },
          },
          teamMember: {
            deletedAt: null,
            status: 'APPROVED',
            participant: {
              personId,
              deletedAt: null,
              status: 'ACTIVE',
            },
          },
        },
        select: {
          id: true,
          categoryId: true,
          gameNickname: true,
          gameAccountName: true,
          gameAccountUrl: true,
          category: {
            select: {
              name: true,
              athleteIdentifierMode: true,
              joiningInstructions: true,
              eventGroup: { select: { emoji: true } },
            },
          },
        },
        orderBy: [{ category: { name: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const playerMatchIds = new Set(rosterEntries.map((entry) => entry.roster.matchId));
    const teamIds = new Set(teamMemberships.map((membership) => membership.teamId));

    const orderedMatches = [...tournament.matches].sort((left, right) => {
      const leftPriority = this.currentUserMatchPriority(left, playerMatchIds, teamIds);
      const rightPriority = this.currentUserMatchPriority(right, playerMatchIds, teamIds);
      return (
        leftPriority - rightPriority ||
        left.schedule.startDate.getTime() - right.schedule.startDate.getTime() ||
        left.id.localeCompare(right.id)
      );
    });
    return {
      tournament: tournamentForResponse,
      imageLicenseAgreementAccepted: majorEventSubscription?.imageLicenseAgreementAccepted ?? false,
      orderedMatches,
      athleteProfiles: athleteProfiles.map((profile) => ({
        registrationMemberId: profile.id,
        categoryId: profile.categoryId,
        categoryName: profile.category.name,
        categoryEmoji: profile.category.eventGroup.emoji || '🏅',
        athleteIdentifierMode: profile.category.athleteIdentifierMode,
        joiningInstructions: profile.category.joiningInstructions,
        gameNickname: profile.gameNickname,
        gameAccountName: profile.gameAccountName,
        gameAccountUrl: profile.gameAccountUrl,
      })),
    };
  }

  private async filterSelfSubscriptionCategories(
    tournament: CurrentUserSportsTournamentDetail['tournament'],
    requestedTeamId: string | null,
  ) {
    const categories = await this.prisma.sportsCategory.findMany({
      where: {
        tournamentId: tournament.id,
        deletedAt: null,
        status: { in: [...SELF_SUBSCRIPTION_CATEGORY_STATUSES] },
        ...(requestedTeamId
          ? {
              registrations: {
                some: {
                  teamId: requestedTeamId,
                  deletedAt: null,
                  status: { in: [...SELF_SUBSCRIPTION_REGISTRATION_STATUSES] },
                  team: {
                    tournamentId: tournament.id,
                    deletedAt: null,
                    status: SportsTeamStatus.ACTIVE,
                  },
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });
    const availableCategoryIds = new Set(categories.map((category) => category.id));
    return {
      ...tournament,
      selfSubscriptionAllowNoCategory: tournament.selfSubscriptionAllowNoCategory || categories.length === 0,
      categories: tournament.categories.filter((category) => availableCategoryIds.has(category.id)),
    };
  }

  async representativeTeamWorkspace(
    ...args: Parameters<SportsReadRepresentativeService['representativeTeamWorkspace']>
  ): ReturnType<SportsReadRepresentativeService['representativeTeamWorkspace']> {
    return this.representativeReader.representativeTeamWorkspace(...args);
  }

  async currentUserMatchOperations(matchId: string): Promise<CurrentUserSportsMatchOperationsRead> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: { id: matchId, deletedAt: null },
      select: {
        id: true,
        revision: true,
        state: true,
        eventId: true,
        categoryId: true,
        notes: true,
        occurrences: true,
        homeRegistrationId: true,
        awayRegistrationId: true,
        category: {
          select: {
            id: true,
            tournament: { select: { id: true } },
          },
        },
        rosters: {
          where: {
            deletedAt: null,
            status: SportsRosterStatus.APPROVED,
          },
          select: {
            id: true,
            registrationId: true,
            revision: true,
            status: true,
            registration: {
              select: {
                team: {
                  select: PUBLIC_TEAM_SELECT,
                },
              },
            },
            entries: {
              where: {
                deletedAt: null,
                status: SportsRosterEntryStatus.APPROVED,
              },
              select: {
                id: true,
                role: true,
                status: true,
                checkedInAt: true,
                shirtNumber: true,
                roleMetadata: true,
                registrationMember: {
                  select: {
                    teamMember: {
                      select: {
                        participant: {
                          select: {
                            person: {
                              select: { name: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            },
          },
          orderBy: [{ registrationId: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!match) {
      throw new NotFoundException(`Sports match ${matchId} was not found.`);
    }
    const assignments = await this.prisma.sportsOfficialAssignment.findMany({
      where: {
        tournamentId: match.category.tournament.id,
        active: true,
        revokedAt: null,
        OR: [
          { matchId: match.id },
          { categoryId: match.categoryId, matchId: null },
          { categoryId: null, matchId: null },
        ],
        person: { deletedAt: null },
      },
      select: {
        id: true,
        matchId: true,
        categoryId: true,
        role: true,
        assignedAt: true,
        person: {
          select: {
            id: true,
            name: true,
            attendances: {
              where: { eventId: match.eventId },
              select: { status: true, attendedAt: true },
            },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { assignedAt: 'asc' }, { id: 'asc' }],
    });
    const officialRoleOrder: Record<string, number> = {
      REFEREE: 0,
      INTERMEDIATOR: 1,
      SCOREKEEPER: 2,
    };
    const seenOfficials = new Set<string>();
    const officials = [...assignments]
      .sort(
        (left, right) =>
          this.officialAssignmentScopeRank(left, match.id, match.categoryId) -
            this.officialAssignmentScopeRank(right, match.id, match.categoryId) ||
          left.assignedAt.getTime() - right.assignedAt.getTime() ||
          left.id.localeCompare(right.id),
      )
      .flatMap((assignment) => {
        const key = `${assignment.person.id}:${assignment.role}`;
        if (seenOfficials.has(key)) {
          return [];
        }
        seenOfficials.add(key);
        const attendance = assignment.person.attendances[0];
        return [
          {
            id: assignment.id,
            name: toSportsPublicOfficialName(assignment.person.name),
            role: assignment.role,
            checkedInAt: attendance?.status === 'PRESENT' ? attendance.attendedAt : null,
          },
        ];
      })
      .sort(
        (left, right) =>
          (officialRoleOrder[left.role] ?? Number.MAX_SAFE_INTEGER) -
            (officialRoleOrder[right.role] ?? Number.MAX_SAFE_INTEGER) ||
          left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
      );
    return {
      matchId: match.id,
      revision: match.revision,
      state: match.state,
      homeRegistrationId: match.homeRegistrationId,
      awayRegistrationId: match.awayRegistrationId,
      notes: match.notes,
      occurrencesJson: this.mapper.serializeJson(match.occurrences),
      officials,
      rosters: match.rosters.map((roster) => ({
        id: roster.id,
        registrationId: roster.registrationId,
        revision: roster.revision,
        status: roster.status,
        team: this.publicReader.mapPublicTeam(roster.registration.team),
        entries: roster.entries.map((entry) => ({
          id: entry.id,
          name: toSportsPublicPlayerName(entry.registrationMember.teamMember.participant.person.name),
          role: entry.role,
          status: entry.status,
          checkedInAt: entry.checkedInAt,
          shirtNumber: entry.shirtNumber,
          roleMetadataJson: entry.roleMetadata === null ? null : this.mapper.serializeJson(entry.roleMetadata),
        })),
      })),
    };
  }

  private officialAssignmentScopeRank(
    assignment: { matchId: string | null; categoryId: string | null },
    matchId: string,
    categoryId: string,
  ): number {
    if (assignment.matchId === matchId) {
      return 0;
    }
    if (assignment.categoryId === categoryId && assignment.matchId === null) {
      return 1;
    }
    return 2;
  }

  async currentUserLineup(matchId: string, registrationId: string): Promise<CurrentUserSportsLineupRead> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: {
        id: matchId,
        deletedAt: null,
        OR: [{ homeRegistrationId: registrationId }, { awayRegistrationId: registrationId }],
      },
      select: {
        id: true,
        revision: true,
        categoryId: true,
        homeRegistrationId: true,
        awayRegistrationId: true,
      },
    });
    if (!match) {
      throw new NotFoundException('A inscrição não participa desta partida.');
    }
    const [eligibleMembers, roster] = await Promise.all([
      this.prisma.sportsRegistrationMember.findMany({
        where: {
          registrationId,
          categoryId: match.categoryId,
          deletedAt: null,
          eligibility: 'ELIGIBLE',
          registration: {
            deletedAt: null,
            status: {
              in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
            },
          },
          teamMember: {
            deletedAt: null,
            status: 'APPROVED',
            participant: {
              deletedAt: null,
              status: 'ACTIVE',
            },
          },
        },
        select: {
          id: true,
          role: true,
          teamMember: {
            select: {
              participant: {
                select: {
                  person: {
                    select: { name: true },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsMatchRoster.findFirst({
        where: {
          matchId,
          registrationId,
          deletedAt: null,
        },
        select: {
          id: true,
          revision: true,
          status: true,
          entries: {
            where: { deletedAt: null },
            select: {
              id: true,
              registrationMemberId: true,
              role: true,
              status: true,
              checkedInAt: true,
              shirtNumber: true,
              roleMetadata: true,
            },
            orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      }),
    ]);
    const shirtNumbersByMemberId = new Map(
      roster?.entries.map((entry) => [entry.registrationMemberId, entry.shirtNumber]) ?? [],
    );
    return {
      matchId: match.id,
      matchRevision: match.revision,
      registrationId,
      homeRegistrationId: match.homeRegistrationId,
      awayRegistrationId: match.awayRegistrationId,
      eligibleMembers: eligibleMembers.map((member) => ({
        registrationMemberId: member.id,
        name: toSportsPublicPlayerName(member.teamMember.participant.person.name),
        role: member.role,
        shirtNumber: shirtNumbersByMemberId.get(member.id) ?? null,
      })),
      roster: roster
        ? {
            ...roster,
            entries: roster.entries.map((entry) => ({
              id: entry.id,
              registrationMemberId: entry.registrationMemberId,
              role: entry.role,
              status: entry.status,
              checkedInAt: entry.checkedInAt,
              shirtNumber: entry.shirtNumber,
              roleMetadataJson: entry.roleMetadata === null ? null : this.mapper.serializeJson(entry.roleMetadata),
            })),
          }
        : null,
    };
  }

  private currentUserMatchPriority(
    match: PublicSportsMatch,
    playerMatchIds: Set<string>,
    teamIds: Set<string>,
  ): number {
    if (playerMatchIds.has(match.id)) {
      return 0;
    }
    if ((match.homeTeam && teamIds.has(match.homeTeam.id)) || (match.awayTeam && teamIds.has(match.awayTeam.id))) {
      return 1;
    }
    return 2;
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
