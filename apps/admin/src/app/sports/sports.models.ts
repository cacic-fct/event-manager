import type {
  SportsApplicationStatus,
  SportsCategoryStatus,
  SportsFormat,
  SportsMatchState,
  SportsOfficialRole,
  SportsPreset,
  SportsRegistrationStatus,
  SportsReviewStatus,
  SportsScoringMode,
  SportsStageType,
  SportsTeamChangeRequestStatus,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@cacic-fct/shared-data-types';

export interface SportsTournamentSummary {
  id: string;
  majorEventId: string;
  status: SportsTournamentStatus;
  scoringMode: SportsScoringMode;
  selfSubscriptionEnabled: boolean;
  selfSubscriptionAllowNoTeam: boolean;
  selfSubscriptionAllowNoCategory: boolean;
  allowPlayerMultipleTeams: boolean;
  revision: number;
  finishedAt?: string | null;
}

export interface SportsCategorySummary {
  id: string;
  tournamentId: string;
  eventGroupId: string;
  eventGroup?: { id: string; emoji: string } | null;
  name: string;
  sport: SportsPreset;
  customSportName?: string | null;
  division?: string | null;
  format: SportsFormat;
  status: SportsCategoryStatus;
  registrationStartDate?: string | null;
  registrationEndDate?: string | null;
  minimumRosterSize?: number | null;
  maximumRosterSize?: number | null;
  maximumCaptains?: number | null;
  maximumCoaches?: number | null;
  allowPlayerMultipleTeams?: boolean | null;
  periodsEnabled: boolean;
  maximumPeriods?: number | null;
  periodLabel?: string | null;
  timerRulesJson: string;
  scoreRulesJson: string;
  overallScoringRulesJson: string;
  rosterRulesJson: string;
  bracketRulesJson: string;
  standingsRulesJson: string;
  rulesText?: string | null;
  registrationFormId?: string | null;
  revision: number;
}

export interface SportsTeamSummary {
  id: string;
  tournamentId: string;
  name: string;
  institution?: string | null;
  status: SportsTeamStatus;
  logoUrl?: string | null;
  revision: number;
  fieldRevisionsJson: string;
}

export interface SportsRegistrationSummary {
  id: string;
  teamId: string;
  categoryId: string;
  status: SportsRegistrationStatus;
  seed?: number | null;
  formAnswersJson?: string | null;
  revision: number;
}

export interface SportsStageSummary {
  id: string;
  categoryId: string;
  name: string;
  type: SportsStageType;
  displayOrder: number;
  generationRevision: number;
}

export interface SportsScoreboard {
  homeScore: number;
  awayScore: number;
}

export interface SportsMatchSummary {
  id: string;
  eventId: string;
  event?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    locationDescription?: string | null;
  } | null;
  categoryId: string;
  stageId?: string | null;
  venueId?: string | null;
  homeRegistrationId?: string | null;
  awayRegistrationId?: string | null;
  state: SportsMatchState;
  canonicalState: SportsMatchState;
  reviewStatus: SportsReviewStatus;
  scoreboard: SportsScoreboard;
  revision: number;
  roundNumber?: number | null;
  bracketPosition?: number | null;
  groupKey?: string | null;
  notes?: string | null;
  livestreamProvider?: 'YOUTUBE' | 'TWITCH' | 'GENERAL' | null;
  livestreamUrl?: string | null;
}

export interface SportsStandingSummary {
  id: string;
  registrationId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
}

export interface SportsScoreEntrySummary {
  id: string;
  tournamentId: string;
  teamId: string;
  source: string;
  points: number;
  reason: string;
  revision: number;
}

export interface SportsVenueSummary {
  id: string;
  tournamentId: string;
  placePresetId: string;
  name: string;
  courtLabel?: string | null;
  capacity?: number | null;
  notes?: string | null;
  parentVenueId?: string | null;
  revision: number;
}

export interface SportsOfficialSummary {
  id: string;
  tournamentId: string;
  categoryId?: string | null;
  matchId?: string | null;
  personId: string;
  role: SportsOfficialRole;
  active: boolean;
  assignedAt: string;
  revision: number;
}

export interface SportsTournamentRead {
  tournament: SportsTournamentSummary;
  categories: SportsCategorySummary[];
  teams: SportsTeamSummary[];
  scoreEntries: SportsScoreEntrySummary[];
  venues: SportsVenueSummary[];
  officials: SportsOfficialSummary[];
  teamSummaries: {
    team: SportsTeamSummary;
    registrations: {
      id: string;
      categoryId: string;
      categoryName: string;
      categoryEmoji: string;
      status: SportsRegistrationStatus;
    }[];
  }[];
}

export interface SportsTournamentListItem {
  tournament: SportsTournamentSummary;
  majorEvent: {
    id: string;
    name: string;
    emoji: string;
    startDate: string;
    endDate: string;
    isPaymentRequired: boolean;
  };
  categoryCount: number;
  teamCount: number;
  pendingApplicationCount: number;
  pendingReviewCount: number;
}

export interface SportsCategoryRead {
  category: SportsCategorySummary;
  registrations: SportsRegistrationSummary[];
  stages: SportsStageSummary[];
  matches: SportsMatchSummary[];
  standings: SportsStandingSummary[];
  placements: { id: string; registrationId: string; placement: number; pointsAwarded?: number | null }[];
  officials: SportsOfficialSummary[];
}

export interface SportsTeamRead {
  team: SportsTeamSummary;
  members: {
    id: string;
    teamId: string;
    participantId: string;
    status: SportsTeamMemberStatus;
    revision: number;
    person: { id: string; name: string };
    categoryAssignments: {
      registrationId: string;
      categoryId: string;
      categoryName: string;
      categoryEmoji: string;
    }[];
  }[];
  representatives: {
    id: string;
    personId: string;
    person: { id: string; name: string };
    active: boolean;
    assignedAt: string;
  }[];
  registrations: SportsRegistrationSummary[];
  changeRequests: {
    id: string;
    type: string;
    status: SportsTeamChangeRequestStatus;
    requestRevision: number;
    baseRevision: number;
    deltaJson: string;
    reviewMessage?: string | null;
    updatedAt: string;
  }[];
}

export interface SportsMatchReview {
  match: SportsMatchSummary;
  actions: {
    id: string;
    type: string;
    payloadJson: string;
    reviewStatus: SportsReviewStatus;
    offline: boolean;
    authoredAt: string;
  }[];
  rosters: {
    id: string;
    registrationId: string;
    status: string;
    revision: number;
    entries: {
      id: string;
      registrationMemberId: string;
      status: string;
      role: string;
      shirtNumber?: string | null;
      roleMetadataJson?: string | null;
    }[];
  }[];
  officials: {
    id: string;
    personId: string;
    role: SportsOfficialRole;
    active: boolean;
    revision: number;
  }[];
}

export interface SportsPendingMatchAction {
  action: {
    id: string;
    matchId: string;
    type: string;
    payloadJson: string;
    reviewStatus: SportsReviewStatus;
    offline: boolean;
    authoredAt: string;
  };
  match: SportsMatchSummary;
  categoryName: string;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
}

export interface SportsRegistrationRead {
  registration: SportsRegistrationSummary;
  members: {
    id: string;
    registrationId: string;
    categoryId: string;
    teamMemberId: string;
    role: string;
    eligibility: string;
    person: { id: string; name: string };
  }[];
  rosters: {
    id: string;
    matchId: string;
    registrationId: string;
    status: string;
    revision: number;
    entries: {
      id: string;
      registrationMemberId: string;
      status: string;
      role: string;
      shirtNumber?: string | null;
      roleMetadataJson?: string | null;
    }[];
  }[];
}

export interface SportsApplication {
  id: string;
  tournamentId: string;
  applicant: { personId: string; name: string };
  requestedTeam: { id: string; name: string; institution?: string | null; logoUrl?: string | null };
  categories: { id: string; name: string; division?: string | null }[];
  status: SportsApplicationStatus;
  participantStatus?: string | null;
  paymentStatus?: string | null;
  paymentTier?: string | null;
  imageLicenseAgreementAccepted: boolean;
  reviewMessage?: string | null;
  createdAt: string;
}
