import { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  SportsCategoryStatus,
  SportsMatchActionType,
  SportsReviewStatus,
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
import { evaluateSportsMatchReadiness } from '../operations/sports-match-readiness';

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
            athleteIdentifierMode: true,
            minimumRosterSize: true,
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
                    shirtNumber: true,
                    teamMember: {
                      select: {
                        participant: {
                          select: {
                            personId: true,
                            paymentStatus: true,
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
        actions: {
          where: {
            type: SportsMatchActionType.CHECK_IN,
            reviewStatus: SportsReviewStatus.APPROVED,
          },
          orderBy: { sequence: 'asc' },
          select: { payload: true },
        },
        winnerSources: {
          where: { deletedAt: null },
          select: {
            id: true,
            canonicalState: true,
            reviewStatus: true,
            winnerRegistrationId: true,
          },
        },
        loserSources: {
          where: { deletedAt: null },
          select: {
            id: true,
            canonicalState: true,
            reviewStatus: true,
            loserRegistrationId: true,
          },
        },
      },
    });
    if (!match) {
      throw new NotFoundException(`Sports match ${matchId} was not found.`);
    }
    const attendanceSyncKeys = new Map<string, string>();
    const attendanceSyncKey = (personId: string): string => {
      const existing = attendanceSyncKeys.get(personId);
      if (existing) {
        return existing;
      }
      const key = randomUUID();
      attendanceSyncKeys.set(personId, key);
      return key;
    };
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
    const rosterEntryPersonIdById = new Map(
      match.rosters.flatMap((roster) =>
        roster.entries.map((entry) => [entry.id, entry.registrationMember.teamMember.participant.personId] as const),
      ),
    );
    const checkInAtByPersonId = this.checkInAtByPersonId(match.actions, rosterEntryPersonIdById);
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
        const hasMatchCheckIn = checkInAtByPersonId.has(assignment.person.id);
        return [
          {
            id: assignment.id,
            attendanceSyncKey: attendanceSyncKey(assignment.person.id),
            name: toSportsPublicOfficialName(assignment.person.name),
            role: assignment.role,
            checkedInAt: hasMatchCheckIn
              ? (checkInAtByPersonId.get(assignment.person.id) ?? null)
              : attendance?.status === 'PRESENT'
                ? attendance.attendedAt
                : null,
          },
        ];
      })
      .sort(
        (left, right) =>
          (officialRoleOrder[left.role] ?? Number.MAX_SAFE_INTEGER) -
            (officialRoleOrder[right.role] ?? Number.MAX_SAFE_INTEGER) ||
          left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }),
      );
    const readiness = evaluateSportsMatchReadiness({
      minimumRosterSize: match.category.minimumRosterSize ?? null,
      homeRegistrationId: match.homeRegistrationId,
      awayRegistrationId: match.awayRegistrationId,
      rosters: match.rosters,
      assignments: assignments.map((assignment) => ({
        ...assignment,
        personId: assignment.person.id,
      })),
      actions: match.actions ?? [],
      winnerSources: match.winnerSources ?? [],
      loserSources: match.loserSources ?? [],
      attendances: [],
    });
    return {
      matchId: match.id,
      revision: match.revision,
      state: match.state,
      readiness,
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
        entries: roster.entries.map((entry) => {
          const personId = entry.registrationMember.teamMember.participant.personId;
          const hasMatchCheckIn = checkInAtByPersonId.has(personId);
          return {
            id: entry.id,
            attendanceSyncKey: attendanceSyncKey(personId),
            name: toSportsPublicPlayerName(entry.registrationMember.teamMember.participant.person.name),
            role: entry.role,
            status: entry.status,
            checkedInAt: hasMatchCheckIn ? (checkInAtByPersonId.get(personId) ?? null) : entry.checkedInAt,
            shirtNumber:
              match.category.athleteIdentifierMode === 'SHIRT_NUMBER'
                ? (entry.shirtNumber ?? entry.registrationMember.shirtNumber)
                : null,
            roleMetadataJson: entry.roleMetadata === null ? null : this.mapper.serializeJson(entry.roleMetadata),
          };
        }),
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

  private checkInAtByPersonId(
    actions: Array<{ payload: unknown }> | undefined,
    rosterEntryPersonIdById: ReadonlyMap<string, string>,
  ): Map<string, Date | null> {
    const checkIns = new Map<string, Date | null>();
    for (const action of actions ?? []) {
      if (!action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) {
        continue;
      }
      const payload = action.payload as Record<string, unknown>;
      const kind = payload['kind'];
      let personId: string | undefined;
      if (kind === 'OFFICIAL_CHECK_IN' && typeof payload['personId'] === 'string') {
        personId = payload['personId'];
      } else if (kind === 'ROSTER_ENTRY_CHECK_IN' && typeof payload['rosterEntryId'] === 'string') {
        personId = rosterEntryPersonIdById.get(payload['rosterEntryId']);
      } else {
        continue;
      }
      if (!personId) {
        continue;
      }
      if (payload['present'] === false) {
        checkIns.set(personId, null);
        continue;
      }
      const checkedInAt = typeof payload['checkedInAt'] === 'string' ? new Date(payload['checkedInAt']) : null;
      checkIns.set(personId, checkedInAt && !Number.isNaN(checkedInAt.getTime()) ? checkedInAt : null);
    }
    return checkIns;
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
          shirtNumber: true,
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
        shirtNumber: shirtNumbersByMemberId.get(member.id) ?? member.shirtNumber ?? null,
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
