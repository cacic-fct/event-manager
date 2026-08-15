import { Prisma, SportsReviewStatus } from '@prisma/client';

export const ADMIN_TOURNAMENT_SELECT = {
  id: true,
  majorEventId: true,
  majorEvent: true,
  status: true,
  registrationStartDate: true,
  registrationEndDate: true,
  scoringMode: true,
  selfSubscriptionEnabled: true,
  selfSubscriptionAllowNoTeam: true,
  selfSubscriptionAllowNoCategory: true,
  allowPlayerMultipleTeams: true,
  shouldIssueCertificate: true,
  revision: true,
  finishedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
  deletedAt: true,
} satisfies Prisma.SportsTournamentSelect;

export const ADMIN_CATEGORY_SELECT = {
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
  shouldIssueCertificate: true,
  athleteIdentifierMode: true,
  joiningInstructions: true,
  periodsEnabled: true,
  maximumPeriods: true,
  periodLabel: true,
  timerRules: true,
  scoreRules: true,
  overallScoringRules: true,
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

export const ADMIN_TEAM_SELECT = {
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

export const ADMIN_REGISTRATION_SELECT = {
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

export const PUBLIC_TEAM_SELECT = {
  id: true,
  name: true,
  institution: true,
  logoSha256: true,
} satisfies Prisma.SportsTeamSelect;

export const PUBLIC_MATCH_SELECT = {
  id: true,
  eventId: true,
  state: true,
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
  livestreamProvider: true,
  livestreamUrl: true,
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
      periodsEnabled: true,
      timerRules: true,
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
        in: [SportsReviewStatus.NOT_REQUIRED, SportsReviewStatus.PENDING, SportsReviewStatus.APPROVED],
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

export type AdminTournamentRecord = Prisma.SportsTournamentGetPayload<{
  select: typeof ADMIN_TOURNAMENT_SELECT;
}>;
export type AdminCategoryRecord = Prisma.SportsCategoryGetPayload<{
  select: typeof ADMIN_CATEGORY_SELECT;
}>;
export type AdminTeamRecord = Prisma.SportsTeamGetPayload<{
  select: typeof ADMIN_TEAM_SELECT;
}>;
export type AdminRegistrationRecord = Prisma.SportsRegistrationGetPayload<{
  select: typeof ADMIN_REGISTRATION_SELECT;
}>;
export type PublicTeamRecord = Prisma.SportsTeamGetPayload<{
  select: typeof PUBLIC_TEAM_SELECT;
}>;
export type PublicMatchRecord = Prisma.SportsMatchGetPayload<{
  select: typeof PUBLIC_MATCH_SELECT;
}>;

export type PublicRosterRecord = {
  matchId: string;
  registration: {
    team: PublicTeamRecord;
  };
  entries: {
    shirtNumber: string | null;
    role: Prisma.SportsMatchRosterEntryGetPayload<{
      select: { role: true };
    }>['role'];
    registrationMember: {
      gameNickname: string | null;
      gameAccountName: string | null;
      gameAccountUrl: string | null;
      category: {
        athleteIdentifierMode: Prisma.SportsCategoryGetPayload<{
          select: { athleteIdentifierMode: true };
        }>['athleteIdentifierMode'];
      };
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

export type PublicOfficialRecord = {
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
