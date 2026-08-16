import type {
  SportsApplicationStatus,
  SportsCategoryStatus,
  SportsEligibilityStatus,
  SportsFormat,
  SportsIdentityClaimStatus,
  SportsIdentityType,
  SportsLivestreamProvider,
  SportsLossReason,
  SportsMatchActionType,
  SportsMatchState,
  SportsOfficialRole,
  SportsParticipantStatus,
  PublicationState,
  SportsPaymentStatus,
  SportsPreset,
  SportsRegistrationStatus,
  SportsReviewStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsScoringMode,
  SportsScoreEntrySource,
  SportsStageType,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@cacic-fct/shared-data-types';
import type { SportsMatchScheduleView, SportsScoreboardView, SportsTeamView } from '@cacic-fct/shared-frontend-types';

export interface SportsTournamentSummary {
  id: string;
  majorEventId: string;
  status: SportsTournamentStatus;
  registrationStartDate?: string | null;
  registrationEndDate?: string | null;
  scoringMode: SportsScoringMode;
  selfSubscriptionEnabled: boolean;
  selfSubscriptionAllowNoTeam: boolean;
  selfSubscriptionAllowNoCategory: boolean;
  allowPlayerMultipleTeams: boolean;
  shouldIssueCertificate: boolean;
  revision: number;
  finishedAt?: string | null;
  majorEvent?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    subscriptionStartDate?: string | null;
    subscriptionEndDate?: string | null;
    requiresImageLicenseAgreement: boolean;
    isPaymentRequired: boolean;
    majorEventPrices?: {
      id: string;
      tiers: { id: string; name: string; value: number }[];
    }[] | null;
  } | null;
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
  shouldIssueCertificate?: boolean | null;
  registrationStartDate?: string | null;
  registrationEndDate?: string | null;
  minimumRosterSize?: number | null;
  maximumRosterSize?: number | null;
  maximumCaptains?: number | null;
  maximumCoaches?: number | null;
  allowPlayerMultipleTeams?: boolean | null;
  athleteIdentifierMode: 'SHIRT_NUMBER' | 'GAME_ACCOUNT';
  joiningInstructions?: string | null;
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

export interface SportsTeamSummary extends SportsTeamView {
  tournamentId: string;
  status: SportsTeamStatus;
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

export type SportsScoreboard = SportsScoreboardView;

export interface SportsMatchSummary {
  id: string;
  eventId: string;
  event?:
    | (SportsMatchScheduleView & {
        id: string;
        name: string;
        isPubliclyListed: boolean;
        publicationState: PublicationState;
      })
    | null;
  categoryId: string;
  stageId?: string | null;
  venueId?: string | null;
  homeRegistrationId?: string | null;
  awayRegistrationId?: string | null;
  state: SportsMatchState;
  canonicalState: SportsMatchState;
  reviewStatus: SportsReviewStatus;
  scoreboard: SportsScoreboard;
  winnerRegistrationId?: string | null;
  loserRegistrationId?: string | null;
  lossReason?: SportsLossReason | null;
  lossReasonDetail?: string | null;
  drawWillReschedule?: boolean | null;
  revision: number;
  roundNumber?: number | null;
  bracketPosition?: number | null;
  groupKey?: string | null;
  notes?: string | null;
  livestreamProvider?: SportsLivestreamProvider | null;
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
  source: SportsScoreEntrySource;
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
  person?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  } | null;
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
    subscriptionStartDate?: string | null;
    subscriptionEndDate?: string | null;
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
      registrationMemberId: string;
      registrationId: string;
      categoryId: string;
      categoryName: string;
      categoryEmoji: string;
      athleteIdentifierMode: 'SHIRT_NUMBER' | 'GAME_ACCOUNT';
      shirtNumber?: string | null;
      gameNickname?: string | null;
      gameAccountName?: string | null;
      gameAccountUrl?: string | null;
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
    type: SportsTeamChangeRequestType;
    status: SportsTeamChangeRequestStatus;
    requestRevision: number;
    baseRevision: number;
    deltaJson: string;
    pendingLogoUrl?: string | null;
    identityClaims: {
      id: string;
      type: SportsIdentityType;
      displayHint: string;
      status: SportsIdentityClaimStatus;
      resolvedPersonId?: string | null;
      resolvedPerson?: { id: string; name: string } | null;
      resolvedAt?: string | null;
    }[];
    reviewMessage?: string | null;
    updatedAt: string;
  }[];
}

export interface SportsMatchReview {
  match: SportsMatchSummary;
  actions: {
    id: string;
    type: SportsMatchActionType;
    payloadJson: string;
    reviewStatus: SportsReviewStatus;
    offline: boolean;
    authoredAt: string;
  }[];
  rosters: {
    id: string;
    registrationId: string;
    status: SportsRosterStatus;
    revision: number;
    entries: {
      id: string;
      registrationMemberId: string;
      status: SportsRosterEntryStatus;
      role: SportsRosterRole;
      shirtNumber?: string | null;
      roleMetadataJson?: string | null;
    }[];
  }[];
  officials: SportsOfficialSummary[];
}

export interface SportsPendingMatchAction {
  action: {
    id: string;
    matchId: string;
    type: SportsMatchActionType;
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
    role: SportsRosterRole;
    eligibility: SportsEligibilityStatus;
    shirtNumber?: string | null;
    gameNickname?: string | null;
    gameAccountName?: string | null;
    gameAccountUrl?: string | null;
    person: { id: string; name: string };
  }[];
  lineupMembers: {
    id: string;
    registrationMemberId?: string | null;
    teamMemberId: string;
    role: SportsRosterRole;
    eligibility: SportsEligibilityStatus;
    shirtNumber?: string | null;
    person: { id: string; name: string };
  }[];
  rosters: {
    id: string;
    matchId: string;
    registrationId: string;
    status: SportsRosterStatus;
    revision: number;
    entries: {
      id: string;
      registrationMemberId: string;
      status: SportsRosterEntryStatus;
      role: SportsRosterRole;
      shirtNumber?: string | null;
      roleMetadataJson?: string | null;
    }[];
  }[];
}

export interface SportsApplication {
  id: string;
  tournamentId: string;
  applicant: { personId: string; name: string };
  requestedTeam?: SportsTeamView | null;
  categories: { id: string; name: string; division?: string | null }[];
  status: SportsApplicationStatus;
  participantStatus?: SportsParticipantStatus | null;
  paymentStatus?: SportsPaymentStatus | null;
  paymentTier?: string | null;
  noticeAcceptedAt: string;
  imageLicenseAgreementAccepted: boolean;
  reviewMessage?: string | null;
  createdAt: string;
}
