import {
  SportsCategory,
  SportsCategoryPlacement,
  SportsMatch,
  SportsMatchAction,
  SportsMatchRoster,
  SportsMatchRosterEntry,
  SportsOfficialAssignment,
  SportsRegistration,
  SportsScoreboard,
  SportsStage,
  SportsStanding,
  SportsTeam,
  SportsTeamChangeRequest,
  SportsTournament,
  SportsTournamentScoreEntry,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import Redis from 'ioredis';
import {
  Prisma,
  PublicationState,
  SportsCategoryStatus,
  SportsMatchState,
  SportsRegistrationStatus,
  SportsReviewStatus,
  SportsRosterEntryStatus,
  SportsRosterStatus,
  SportsTeamChangeRequestStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeSportsScoreboard } from '../domain/sports-scoreboard';
import { projectSportsMatch } from '../operations/sports-match-projector';
import { toSportsPublicOfficialName, toSportsPublicPlayerName } from '../domain/sports-public-name';
import {
  AdminSportsCategoryRead,
  AdminSportsMatchReviewRead,
  AdminSportsRegistrationMemberSummary,
  AdminSportsRegistrationRead,
  AdminSportsTeamMemberSummary,
  AdminSportsTeamRepresentativeSummary,
  AdminSportsTeamRead,
  AdminSportsTournamentRead,
  CurrentUserSportsTournamentDetail,
  PublicSportsBracket,
  PublicSportsCategory,
  PublicSportsMatch,
  PublicSportsOfficial,
  PublicSportsOverallScore,
  PublicSportsPlacement,
  PublicSportsRoster,
  PublicSportsScoreboard,
  PublicSportsStanding,
  PublicSportsTeam,
  PublicSportsTournamentDetail,
  RepresentativeSportsTeamWorkspace,
} from './sports-read.models';
import { PUBLIC_SPORTS_MATCH_RELATIONS_WHERE } from '../security/sports-public-visibility';
import {
  SPORTS_PUBLIC_TOURNAMENT_CACHE_TTL_SECONDS,
  sportsPublicTournamentCacheKey,
  sportsPublicTournamentCacheVersionKey,
} from '../realtime/sports-realtime.service';

const CACHE_PUBLIC_TOURNAMENT_IF_CURRENT_SCRIPT = `
local currentVersion = redis.call('GET', KEYS[2]) or '0'
if currentVersion ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;

interface CachedPublicSportsTournament {
  version: string;
  tournament: PublicSportsTournamentDetail;
}

const ADMIN_TOURNAMENT_SELECT = {
  id: true,
  majorEventId: true,
  majorEvent: true,
  status: true,
  scoringMode: true,
  selfSubscriptionEnabled: true,
  allowPlayerMultipleTeams: true,
  revision: true,
  finishedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
  deletedAt: true,
} satisfies Prisma.SportsTournamentSelect;

const ADMIN_CATEGORY_SELECT = {
  id: true,
  tournamentId: true,
  eventGroupId: true,
  eventGroup: true,
  name: true,
  sport: true,
  customSportName: true,
  division: true,
  format: true,
  status: true,
  registrationStartDate: true,
  registrationEndDate: true,
  minimumRosterSize: true,
  maximumRosterSize: true,
  maximumCaptains: true,
  maximumCoaches: true,
  allowPlayerMultipleTeams: true,
  periodsEnabled: true,
  maximumPeriods: true,
  periodLabel: true,
  scoreRules: true,
  rosterRules: true,
  bracketRules: true,
  standingsRules: true,
  rulesText: true,
  registrationFormId: true,
  revision: true,
  finishedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
  deletedAt: true,
} satisfies Prisma.SportsCategorySelect;

const ADMIN_TEAM_SELECT = {
  id: true,
  tournamentId: true,
  name: true,
  institution: true,
  status: true,
  logoObjectKey: true,
  logoSha256: true,
  logoMimeType: true,
  logoSizeBytes: true,
  revision: true,
  fieldRevisions: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
  deletedAt: true,
} satisfies Prisma.SportsTeamSelect;

const ADMIN_REGISTRATION_SELECT = {
  id: true,
  teamId: true,
  categoryId: true,
  status: true,
  seed: true,
  formAnswers: true,
  formSchemaSnapshot: true,
  revision: true,
  approvedAt: true,
  approvedById: true,
  rejectedAt: true,
  rejectedById: true,
  rejectionReason: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
  deletedAt: true,
} satisfies Prisma.SportsRegistrationSelect;

const PUBLIC_TEAM_SELECT = {
  id: true,
  name: true,
  institution: true,
  logoSha256: true,
} satisfies Prisma.SportsTeamSelect;

const PUBLIC_MATCH_SELECT = {
  id: true,
  eventId: true,
  categoryId: true,
  stageId: true,
  homeRegistrationId: true,
  homeRegistration: {
    select: {
      team: {
        select: PUBLIC_TEAM_SELECT,
      },
    },
  },
  awayRegistrationId: true,
  awayRegistration: {
    select: {
      team: {
        select: PUBLIC_TEAM_SELECT,
      },
    },
  },
  winnerRegistrationId: true,
  winnerRegistration: {
    select: {
      team: {
        select: PUBLIC_TEAM_SELECT,
      },
    },
  },
  loserRegistrationId: true,
  loserRegistration: {
    select: {
      team: {
        select: PUBLIC_TEAM_SELECT,
      },
    },
  },
  roundNumber: true,
  bracketPosition: true,
  groupKey: true,
  event: {
    select: {
      startDate: true,
      endDate: true,
      locationDescription: true,
      latitude: true,
      longitude: true,
    },
  },
  venue: {
    select: {
      name: true,
      courtLabel: true,
    },
  },
  category: {
    select: {
      maximumPeriods: true,
      periodLabel: true,
    },
  },
  rosters: {
    where: {
      deletedAt: null,
    },
    select: {
      entries: {
        where: {
          deletedAt: null,
          checkedInAt: {
            not: null,
          },
        },
        select: {
          id: true,
        },
        take: 1,
      },
    },
  },
  actions: {
    where: {
      reviewStatus: {
        in: [
          SportsReviewStatus.NOT_REQUIRED,
          SportsReviewStatus.PENDING,
          SportsReviewStatus.APPROVED,
        ],
      },
    },
    select: {
      type: true,
      payload: true,
      authoredAt: true,
      reviewStatus: true,
    },
    orderBy: {
      sequence: 'asc',
    },
  },
} satisfies Prisma.SportsMatchSelect;

type AdminTournamentRecord = Prisma.SportsTournamentGetPayload<{
  select: typeof ADMIN_TOURNAMENT_SELECT;
}>;
type AdminCategoryRecord = Prisma.SportsCategoryGetPayload<{
  select: typeof ADMIN_CATEGORY_SELECT;
}>;
type AdminTeamRecord = Prisma.SportsTeamGetPayload<{
  select: typeof ADMIN_TEAM_SELECT;
}>;
type AdminRegistrationRecord = Prisma.SportsRegistrationGetPayload<{
  select: typeof ADMIN_REGISTRATION_SELECT;
}>;
type PublicTeamRecord = Prisma.SportsTeamGetPayload<{
  select: typeof PUBLIC_TEAM_SELECT;
}>;
type PublicMatchRecord = Prisma.SportsMatchGetPayload<{
  select: typeof PUBLIC_MATCH_SELECT;
}>;

type PublicRosterRecord = {
  matchId: string;
  registration: {
    team: PublicTeamRecord;
  };
  entries: {
    role: Prisma.SportsMatchRosterEntryGetPayload<{
      select: { role: true };
    }>['role'];
    registrationMember: {
      teamMember: {
        participant: {
          person: {
            name: string;
          };
        };
      };
    };
  }[];
};

type PublicOfficialRecord = {
  tournamentId: string;
  categoryId: string | null;
  matchId: string | null;
  role: Prisma.SportsOfficialAssignmentGetPayload<{
    select: { role: true };
  }>['role'];
  person: {
    name: string;
  };
};

@Injectable()
export class SportsReadService {
  private readonly logger = new Logger(SportsReadService.name);
  private readonly publicTournamentRefreshes = new Map<
    string,
    Promise<PublicSportsTournamentDetail>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    @Optional() private readonly redis?: Redis,
  ) {}

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
      if (
        await this.hasScopedPermission(
          user,
          Permission.SportsTournament.Read,
          { sportsCategoryId: category.id },
        )
      ) {
        readableCategories.push(category);
      }
    }
    const canReadAllCategories =
      readableCategories.length === categories.length;
    const readableCategoryIds = readableCategories.map(
      (category) => category.id,
    );
    const [teams, scoreEntries] = await Promise.all([
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
        select: ADMIN_TEAM_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.sportsTournamentScoreEntry.findMany({
        where: {
          tournamentId,
          deletedAt: null,
          ...(canReadAllCategories
            ? {}
            : { categoryId: { in: readableCategoryIds } }),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      tournament: this.mapAdminTournament(tournament),
      categories: readableCategories.map((category) =>
        this.mapAdminCategory(category),
      ),
      teams: teams.map((team) => this.mapAdminTeam(team)),
      scoreEntries: scoreEntries.map((entry) => this.mapAdminScoreEntry(entry)),
    };
  }

  async adminCategory(user: AuthenticatedUser | undefined, categoryId: string): Promise<AdminSportsCategoryRead> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.SportsCategory.Read], {
      sportsCategoryId: categoryId,
    });
    const [category, registrations, stages, matches, standings, placements] = await Promise.all([
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
    ]);
    if (!category) {
      throw new NotFoundException(`Sports category ${categoryId} was not found.`);
    }
    return {
      category: this.mapAdminCategory(category),
      registrations: registrations.map((registration) => this.mapAdminRegistration(registration)),
      stages: stages.map((stage) => this.mapAdminStage(stage)),
      matches: matches.map((match) => this.mapAdminMatch(match)),
      standings: standings.map((standing) => this.mapAdminStanding(standing)),
      placements: placements.map((placement) => this.mapAdminPlacement(placement)),
    };
  }

  async adminTeam(user: AuthenticatedUser | undefined, teamId: string): Promise<AdminSportsTeamRead> {
    await this.authorizationPolicy.assertPermissions(user, [Permission.SportsTeam.Read], {
      sportsTeamId: teamId,
    });
    const [team, representatives, registrations] = await Promise.all([
      this.prisma.sportsTeam.findFirst({
        where: { id: teamId, deletedAt: null },
        select: ADMIN_TEAM_SELECT,
      }),
      this.prisma.sportsTeamRepresentative.findMany({
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
    const readableCategoryIds = readableRegistrations.map(
      (registration) => registration.categoryId,
    );
    const canReadAllMembers =
      readableRegistrations.length === registrations.length;
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
    const canReview = await this.hasScopedPermission(
      user,
      Permission.SportsTeam.Review,
      { sportsTeamId: teamId },
    );
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
      team: this.mapAdminTeam(team),
      members: members.map((member) => this.mapAdminTeamMember(member)),
      representatives: representatives.map((representative) => this.mapAdminRepresentative(representative)),
      registrations: readableRegistrations.map((registration) =>
        this.mapAdminRegistration(registration),
      ),
      changeRequests: changeRequests.map((request) => this.mapAdminChangeRequest(request)),
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
      registration: this.mapAdminRegistration(registration),
      members: members.map((member) => this.mapAdminRegistrationMember(member)),
      rosters: rosters.map((roster) => this.mapAdminRoster(roster)),
    };
  }

  async adminMatchReview(
    user: AuthenticatedUser | undefined,
    matchId: string,
  ): Promise<AdminSportsMatchReviewRead> {
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
      match: this.mapAdminMatch(match),
      actions: actions.map((action) => this.mapAdminAction(action)),
      rosters: rosters.map((roster) => this.mapAdminRoster(roster)),
      officials: officials.map((official) => this.mapAdminOfficial(official)),
    };
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
        majorEvent: {
          select: {
            name: true,
            emoji: true,
            description: true,
            startDate: true,
            endDate: true,
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
    const projected = this.projectPublicMatch(match);
    const [rosters, officials] = await Promise.all([
      this.loadPublicRosters(this.canRevealRoster(projected.state) ? [match.id] : []),
      this.loadPublicOfficials(match.categoryId, [match.id]),
    ]);
    return this.mapPublicMatch(match, projected, rosters.get(match.id) ?? [], officials.get(match.id) ?? []);
  }

  async currentUserTournament(
    input: { tournamentId?: string | null; majorEventId?: string | null },
    personId: string,
  ): Promise<CurrentUserSportsTournamentDetail> {
    const tournament = await this.publicTournament(input);
    const [teamMemberships, rosterEntries] = await Promise.all([
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
      tournament,
      orderedMatches,
    };
  }

  async representativeTeamWorkspace(
    teamId: string,
    representativePersonId: string,
  ): Promise<RepresentativeSportsTeamWorkspace> {
    const team = await this.prisma.sportsTeam.findFirst({
      where: {
        id: teamId,
        deletedAt: null,
        representatives: {
          some: {
            personId: representativePersonId,
            active: true,
            revokedAt: null,
          },
        },
      },
      select: {
        ...PUBLIC_TEAM_SELECT,
        revision: true,
        changeRequests: {
          where: {
            submittedByPersonId: representativePersonId,
            status: {
              in: [
                SportsTeamChangeRequestStatus.PENDING,
                SportsTeamChangeRequestStatus.CHANGES_REQUESTED,
                SportsTeamChangeRequestStatus.CONFLICT,
              ],
            },
          },
          select: {
            id: true,
            type: true,
            status: true,
            requestRevision: true,
            baseRevision: true,
            delta: true,
            reviewMessage: true,
            updatedAt: true,
            identityClaims: {
              select: {
                clientKey: true,
                type: true,
                displayHint: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
    if (!team) {
      throw new NotFoundException(`Sports team ${teamId} was not found.`);
    }
    return {
      team: {
        id: team.id,
        name: team.name,
        institution: team.institution,
        logoUrl: team.logoSha256
          ? `/api/sports/teams/${team.id}/logo/${team.logoSha256}`
          : null,
      },
      teamRevision: team.revision,
      queuedChanges: team.changeRequests.map((request) => ({
        id: request.id,
        type: request.type,
        status: request.status,
        requestRevision: request.requestRevision,
        baseRevision: request.baseRevision,
        deltaJson: this.serializeRepresentativeDelta(request.delta),
        reviewMessage: request.reviewMessage,
        identityHints: request.identityClaims,
        updatedAt: request.updatedAt,
      })),
    };
  }

  private async loadPublicTournament(tournament: {
    id: string;
    majorEventId: string;
    majorEvent: {
      name: string;
      emoji: string;
      description: string | null;
      startDate: Date;
      endDate: Date;
    };
  }): Promise<PublicSportsTournamentDetail> {
    const cached = await this.getCachedPublicTournament(tournament.id);
    if (cached) {
      return {
        ...cached,
        majorEventId: tournament.majorEventId,
        name: tournament.majorEvent.name,
        emoji: tournament.majorEvent.emoji,
        description: tournament.majorEvent.description,
        startDate: tournament.majorEvent.startDate,
        endDate: tournament.majorEvent.endDate,
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
    majorEvent: {
      name: string;
      emoji: string;
      description: string | null;
      startDate: Date;
      endDate: Date;
    };
  }): Promise<PublicSportsTournamentDetail> {
    const cacheVersion = await this.readPublicTournamentCacheVersion(
      tournament.id,
    );
    const [categories, teams, stages, matches, standings, placements, scoreEntries] =
      await Promise.all([
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
      projection: this.projectPublicMatch(match),
    }));
    const rosterVisibleMatchIds = projectedMatches
      .filter(({ projection }) => this.canRevealRoster(projection.state))
      .map(({ match }) => match.id);
    const [rostersByMatch, officialsByMatch] = await Promise.all([
      this.loadPublicRosters(rosterVisibleMatchIds),
      this.loadPublicOfficialsForTournament(tournament.id, matches),
    ]);
    const publicMatches = projectedMatches.map(({ match, projection }) =>
      this.mapPublicMatch(
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
        ...category,
        standings: (standingsByCategory.get(category.id) ?? []).map(
          (standing): PublicSportsStanding => ({
            team: this.mapPublicTeam(standing.registration.team),
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
            team: this.mapPublicTeam(placement.registration.team),
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
          team: this.mapPublicTeam(entry.team),
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
      teams: teams.map((team) => this.mapPublicTeam(team)),
      categories: publicCategories,
      matches: publicMatches,
      overallScores: [...overallScoreByTeam.values()].sort(
        (left, right) => right.points - left.points || left.team.name.localeCompare(right.team.name),
      ),
    };
    await this.cachePublicTournamentIfCurrent(
      tournament.id,
      cacheVersion,
      detail,
    );
    return detail;
  }

  private async getCachedPublicTournament(
    tournamentId: string,
  ): Promise<PublicSportsTournamentDetail | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const [serialized, currentVersion] = await this.redis.mget(
        sportsPublicTournamentCacheKey(tournamentId),
        sportsPublicTournamentCacheVersionKey(tournamentId),
      );
      if (!serialized) {
        return null;
      }
      const cached = JSON.parse(serialized) as Partial<CachedPublicSportsTournament>;
      if (
        typeof cached.version !== 'string' ||
        cached.version !== (currentVersion ?? '0')
      ) {
        return null;
      }
      return this.rehydratePublicTournament(cached.tournament, tournamentId);
    } catch (error) {
      this.logger.warn(
        `Sports public tournament cache read failed for tournament ${tournamentId}; loading from the database.`,
        error,
      );
      return null;
    }
  }

  private async readPublicTournamentCacheVersion(
    tournamentId: string,
  ): Promise<string | null> {
    if (!this.redis) {
      return null;
    }
    try {
      return (
        (await this.redis.get(
          sportsPublicTournamentCacheVersionKey(tournamentId),
        )) ?? '0'
      );
    } catch (error) {
      this.logger.warn(
        `Sports public tournament cache version read failed for tournament ${tournamentId}; skipping cache storage.`,
        error,
      );
      return null;
    }
  }

  private async cachePublicTournamentIfCurrent(
    tournamentId: string,
    cacheVersion: string | null,
    tournament: PublicSportsTournamentDetail,
  ): Promise<void> {
    if (!this.redis || cacheVersion === null) {
      return;
    }
    const cached: CachedPublicSportsTournament = {
      version: cacheVersion,
      tournament,
    };
    try {
      await this.redis.eval(
        CACHE_PUBLIC_TOURNAMENT_IF_CURRENT_SCRIPT,
        2,
        sportsPublicTournamentCacheKey(tournamentId),
        sportsPublicTournamentCacheVersionKey(tournamentId),
        cacheVersion,
        JSON.stringify(cached),
        SPORTS_PUBLIC_TOURNAMENT_CACHE_TTL_SECONDS.toString(),
      );
    } catch (error) {
      this.logger.warn(
        `Sports public tournament cache write failed for tournament ${tournamentId}.`,
        error,
      );
    }
  }

  private rehydratePublicTournament(
    value: unknown,
    expectedTournamentId: string,
  ): PublicSportsTournamentDetail | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const tournament = value as PublicSportsTournamentDetail;
    if (
      tournament.id !== expectedTournamentId ||
      !Array.isArray(tournament.matches) ||
      !Array.isArray(tournament.categories)
    ) {
      return null;
    }

    const startDate = this.parseCachedDate(tournament.startDate);
    const endDate = this.parseCachedDate(tournament.endDate);
    if (!startDate || !endDate) {
      return null;
    }
    tournament.startDate = startDate;
    tournament.endDate = endDate;
    if (!this.rehydratePublicMatches(tournament.matches)) {
      return null;
    }
    for (const category of tournament.categories) {
      if (
        !category ||
        !Array.isArray(category.matches) ||
        !Array.isArray(category.brackets) ||
        !this.rehydratePublicMatches(category.matches)
      ) {
        return null;
      }
      for (const bracket of category.brackets) {
        if (
          !bracket ||
          !Array.isArray(bracket.matches) ||
          !this.rehydratePublicMatches(bracket.matches)
        ) {
          return null;
        }
      }
    }
    return tournament;
  }

  private rehydratePublicMatches(matches: PublicSportsMatch[]): boolean {
    for (const match of matches) {
      if (!match?.schedule) {
        return false;
      }
      const startDate = this.parseCachedDate(match.schedule.startDate);
      const endDate = this.parseCachedDate(match.schedule.endDate);
      if (!startDate || !endDate) {
        return false;
      }
      match.schedule.startDate = startDate;
      match.schedule.endDate = endDate;
      if (match.timerStartedAt) {
        const timerStartedAt = this.parseCachedDate(match.timerStartedAt);
        if (!timerStartedAt) {
          return false;
        }
        match.timerStartedAt = timerStartedAt;
      }
      if (match.timerPausedAt) {
        const timerPausedAt = this.parseCachedDate(match.timerPausedAt);
        if (!timerPausedAt) {
          return false;
        }
        match.timerPausedAt = timerPausedAt;
      }
    }
    return true;
  }

  private parseCachedDate(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value !== 'string') {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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

  private async loadPublicRosters(matchIds: string[]): Promise<Map<string, PublicSportsRoster[]>> {
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
            registrationMember: {
              select: {
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
      rosters.map(
        (roster): [string, PublicSportsRoster] => [
          roster.matchId,
          {
            team: this.mapPublicTeam(roster.registration.team),
            entries: roster.entries.map((entry) => ({
              name: toSportsPublicPlayerName(
                entry.registrationMember.teamMember.participant.person.name,
              ),
              role: entry.role,
            })),
          },
        ],
      ),
      ([matchId]) => matchId,
      ([, roster]) => roster,
    );
  }

  private async loadPublicOfficials(
    categoryId: string,
    matchIds: string[],
  ): Promise<Map<string, PublicSportsOfficial[]>> {
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

  private async loadPublicOfficialsForTournament(
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

  private projectPublicMatch(match: PublicMatchRecord) {
    return projectSportsMatch(match.actions, {
      approvedOnly: false,
      hasCheckedInPlayers: match.rosters.some((roster) => roster.entries.length > 0),
      maximumPeriods: match.category.maximumPeriods,
      periodLabel: match.category.periodLabel,
    });
  }

  private mapPublicMatch(
    match: PublicMatchRecord,
    projection: ReturnType<typeof projectSportsMatch>,
    rosters: PublicSportsRoster[],
    officials: PublicSportsOfficial[],
  ): PublicSportsMatch {
    const teamByRegistrationId = new Map(
      [
        match.homeRegistrationId && match.homeRegistration
          ? [match.homeRegistrationId, this.mapPublicTeam(match.homeRegistration.team)]
          : null,
        match.awayRegistrationId && match.awayRegistration
          ? [match.awayRegistrationId, this.mapPublicTeam(match.awayRegistration.team)]
          : null,
      ].filter((entry): entry is [string, PublicSportsTeam] => entry !== null),
    );
    return {
      id: match.id,
      eventId: match.eventId,
      categoryId: match.categoryId,
      stageId: match.stageId,
      homeTeam: match.homeRegistration ? this.mapPublicTeam(match.homeRegistration.team) : null,
      awayTeam: match.awayRegistration ? this.mapPublicTeam(match.awayRegistration.team) : null,
      state: projection.state,
      scoreboard: this.mapPublicScoreboard(projection.scoreboard),
      winner: projection.winnerRegistrationId
        ? (teamByRegistrationId.get(projection.winnerRegistrationId) ?? null)
        : null,
      loser: projection.loserRegistrationId
        ? (teamByRegistrationId.get(projection.loserRegistrationId) ?? null)
        : null,
      lossReason: projection.lossReason,
      lossReasonDetail: projection.lossReasonDetail,
      drawWillReschedule: projection.drawWillReschedule,
      timerStartedAt: projection.timerStartedAt,
      timerPausedAt: projection.timerPausedAt,
      elapsedBeforePauseMs: projection.elapsedBeforePauseMs,
      roundNumber: match.roundNumber,
      bracketPosition: match.bracketPosition,
      groupKey: match.groupKey,
      schedule: {
        startDate: match.event.startDate,
        endDate: match.event.endDate,
        locationDescription: match.event.locationDescription,
        latitude: match.event.latitude,
        longitude: match.event.longitude,
        venueName: match.venue?.name ?? null,
        courtLabel: match.venue?.courtLabel ?? null,
      },
      rosters,
      officials,
    };
  }

  private mapPublicScoreboard(
    scoreboard: ReturnType<typeof normalizeSportsScoreboard>,
  ): PublicSportsScoreboard {
    return {
      homeScore: scoreboard.home,
      awayScore: scoreboard.away,
      activePeriod: scoreboard.activePeriodNumber,
      periods: scoreboard.periods.map((period) => ({
        number: period.number,
        label: period.label,
        homeScore: period.home,
        awayScore: period.away,
        completed: period.closed,
      })),
    };
  }

  private mapPublicTeam(team: PublicTeamRecord): PublicSportsTeam {
    return {
      id: team.id,
      name: team.name,
      institution: team.institution,
      logoUrl: team.logoSha256
        ? `/api/sports/public/teams/${team.id}/logo/${team.logoSha256}`
        : null,
    };
  }

  private serializeRepresentativeDelta(value: Prisma.JsonValue): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return '{}';
    }
    const record = value as Record<string, unknown>;
    const logo =
      record['logo'] &&
      typeof record['logo'] === 'object' &&
      !Array.isArray(record['logo'])
        ? (record['logo'] as Record<string, unknown>)
        : undefined;
    return JSON.stringify({
      ...(record['set'] !== undefined ? { set: record['set'] } : {}),
      ...(record['categoryIds'] !== undefined
        ? { categoryIds: record['categoryIds'] }
        : {}),
      ...(record['memberChanges'] !== undefined
        ? { memberChanges: record['memberChanges'] }
        : {}),
      ...(record['categoryRoleChanges'] !== undefined
        ? { categoryRoleChanges: record['categoryRoleChanges'] }
        : {}),
      ...(logo
        ? {
            logo: {
              sha256: logo['sha256'],
              mimeType: logo['mimeType'],
              sizeBytes: logo['sizeBytes'],
            },
          }
        : {}),
    });
  }

  private canRevealRoster(state: SportsMatchState | undefined): boolean {
    return (
      state === SportsMatchState.FINISHED ||
      state === SportsMatchState.DRAW
    );
  }

  private currentUserMatchPriority(
    match: PublicSportsMatch,
    playerMatchIds: Set<string>,
    teamIds: Set<string>,
  ): number {
    if (playerMatchIds.has(match.id)) {
      return 0;
    }
    if (
      (match.homeTeam && teamIds.has(match.homeTeam.id)) ||
      (match.awayTeam && teamIds.has(match.awayTeam.id))
    ) {
      return 1;
    }
    return 2;
  }

  private normalizePublicTarget(input: {
    tournamentId?: string | null;
    majorEventId?: string | null;
  }): { tournamentId?: string; majorEventId?: string } {
    const tournamentId = input.tournamentId?.trim();
    const majorEventId = input.majorEventId?.trim();
    if (Boolean(tournamentId) === Boolean(majorEventId)) {
      throw new BadRequestException('Provide exactly one of tournamentId or majorEventId.');
    }
    return tournamentId ? { tournamentId } : { majorEventId };
  }

  private async hasScopedPermission(
    user: AuthenticatedUser | undefined,
    permission: Permission,
    context: Parameters<AuthorizationPolicyService['assertPermissions']>[2],
  ): Promise<boolean> {
    try {
      await this.authorizationPolicy.assertPermissions(
        user,
        [permission],
        context,
      );
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return false;
      }
      throw error;
    }
  }

  private mapAdminTournament(record: AdminTournamentRecord): SportsTournament {
    return record;
  }

  private mapAdminCategory(record: AdminCategoryRecord): SportsCategory {
    return {
      ...record,
      scoreRulesJson: this.serializeJson(record.scoreRules),
      rosterRulesJson: this.serializeJson(record.rosterRules),
      bracketRulesJson: this.serializeJson(record.bracketRules),
      standingsRulesJson: this.serializeJson(record.standingsRules),
    };
  }

  private mapAdminTeam(record: AdminTeamRecord): SportsTeam {
    return {
      ...record,
      logoUrl: record.logoSha256
        ? `/api/sports/admin/teams/${record.id}/logo/${record.logoSha256}`
        : null,
      fieldRevisionsJson: this.serializeJson(record.fieldRevisions),
    };
  }

  private mapAdminRegistration(record: AdminRegistrationRecord): SportsRegistration {
    return {
      ...record,
      formAnswersJson: record.formAnswers === null ? null : this.serializeJson(record.formAnswers),
      formSchemaSnapshotJson:
        record.formSchemaSnapshot === null ? null : this.serializeJson(record.formSchemaSnapshot),
    };
  }

  private mapAdminStage(record: Prisma.SportsStageGetPayload<object>): SportsStage {
    return {
      ...record,
      settingsJson: this.serializeJson(record.settings),
    };
  }

  private mapAdminMatch(
    record: Prisma.SportsMatchGetPayload<{ include: { event: true } }>,
  ): SportsMatch {
    return {
      ...record,
      scoreboard: this.mapAdminScoreboard(record.scoreboard),
      canonicalScoreboard: this.mapAdminScoreboard(record.canonicalScoreboard),
    };
  }

  private mapAdminScoreboard(value: Prisma.JsonValue): SportsScoreboard {
    try {
      const scoreboard = normalizeSportsScoreboard(value);
      return {
        homeScore: scoreboard.home,
        awayScore: scoreboard.away,
        activePeriod: scoreboard.activePeriodNumber,
        periods: scoreboard.periods.map((period) => ({
          number: period.number,
          label: period.label,
          homeScore: period.home,
          awayScore: period.away,
          completed: period.closed,
        })),
        metadataJson: null,
      };
    } catch {
      return {
        homeScore: 0,
        awayScore: 0,
        activePeriod: null,
        periods: [],
        metadataJson: this.serializeJson({ invalidScoreboard: value }),
      };
    }
  }

  private mapAdminStanding(record: Prisma.SportsStandingGetPayload<object>): SportsStanding {
    return {
      ...record,
      tiebreakDataJson: this.serializeJson(record.tiebreakData),
    };
  }

  private mapAdminPlacement(
    record: Prisma.SportsCategoryPlacementGetPayload<object>,
  ): SportsCategoryPlacement {
    return record;
  }

  private mapAdminTeamMember(
    record: Prisma.SportsTeamMemberGetPayload<{
      select: {
        id: true;
        teamId: true;
        participantId: true;
        status: true;
        revision: true;
        participant: {
          select: { person: { select: { id: true; name: true } } };
        };
      };
    }>,
  ): AdminSportsTeamMemberSummary {
    return {
      id: record.id,
      teamId: record.teamId,
      participantId: record.participantId,
      status: record.status,
      revision: record.revision,
      person: {
        id: record.participant.person.id,
        name: toSportsPublicPlayerName(record.participant.person.name),
      },
    };
  }

  private mapAdminRepresentative(
    record: Prisma.SportsTeamRepresentativeGetPayload<{
      select: {
        id: true;
        teamId: true;
        personId: true;
        person: { select: { id: true; name: true } };
        active: true;
        assignedAt: true;
        revokedAt: true;
      };
    }>,
  ): AdminSportsTeamRepresentativeSummary {
    return {
      ...record,
      person: {
        id: record.person.id,
        name: toSportsPublicPlayerName(record.person.name),
      },
    };
  }

  private mapAdminChangeRequest(
    record: Prisma.SportsTeamChangeRequestGetPayload<{ include: { identityClaims: true } }>,
  ): SportsTeamChangeRequest {
    return {
      ...record,
      baseFieldRevisionsJson: this.serializeJson(record.baseFieldRevisions),
      deltaJson: this.serializeJson(record.delta),
      resolvedDeltaJson: record.resolvedDelta === null ? null : this.serializeJson(record.resolvedDelta),
    };
  }

  private mapAdminRegistrationMember(
    record: Prisma.SportsRegistrationMemberGetPayload<{
      include: {
        teamMember: {
          select: {
            participant: {
              select: { person: { select: { id: true; name: true } } };
            };
          };
        };
      };
    }>,
  ): AdminSportsRegistrationMemberSummary {
    return {
      id: record.id,
      registrationId: record.registrationId,
      categoryId: record.categoryId,
      teamMemberId: record.teamMemberId,
      role: record.role,
      eligibility: record.eligibility,
      person: {
        id: record.teamMember.participant.person.id,
        name: toSportsPublicPlayerName(
          record.teamMember.participant.person.name,
        ),
      },
    };
  }

  private mapAdminRoster(
    record: Prisma.SportsMatchRosterGetPayload<{ include: { entries: true } }>,
  ): SportsMatchRoster {
    return {
      ...record,
      entries: record.entries.map((entry): SportsMatchRosterEntry => entry),
    };
  }

  private mapAdminAction(record: Prisma.SportsMatchActionGetPayload<object>): SportsMatchAction {
    return {
      ...record,
      payloadJson: this.serializeJson(record.payload),
    };
  }

  private mapAdminOfficial(
    record: Prisma.SportsOfficialAssignmentGetPayload<{ include: { person: true } }>,
  ): SportsOfficialAssignment {
    return record;
  }

  private mapAdminScoreEntry(
    record: Prisma.SportsTournamentScoreEntryGetPayload<object>,
  ): SportsTournamentScoreEntry {
    return record;
  }

  private serializeJson(value: Prisma.JsonValue | Prisma.InputJsonValue): string {
    return JSON.stringify(value);
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
