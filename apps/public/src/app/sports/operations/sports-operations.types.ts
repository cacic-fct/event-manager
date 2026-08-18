import type {
  SportsApplicationStatus,
  SportsEligibilityStatus,
  SportsIdentityType,
  SportsMatchState,
  SportsOfficialRole,
  SportsRegistrationStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
} from '@cacic-fct/shared-data-types';
import type {
  SportsMatchPeriodTimerView,
  SportsMatchScheduleView,
  SportsScorePeriodView,
  SportsScoreboardView,
  SportsTeamView,
  SportsVenueLocationView,
} from '@cacic-fct/shared-frontend-types';
import type {
  OfflineSportsMatchAction,
  OfflineSportsMatchActionType,
  OfflineSportsOperationQueueItem,
  OfflineSportsOfficialCheckIn,
  OfflineSportsRosterCheckIn,
  OfflineSportsScannerCheckIn,
  OfflineSportsTimerSnapshot,
} from '@cacic-fct/public-indexed-db';

export type { SportsMatchState } from '@cacic-fct/shared-data-types';

/** Actions available from the public official operations workspace. */
export type SportsMatchActionType = OfflineSportsMatchActionType;

export type SportsTeamSummary = SportsTeamView;
export type SportsScorePeriod = SportsScorePeriodView;
export type SportsMatchPeriodTimer = SportsMatchPeriodTimerView;
export type SportsScoreboard = SportsScoreboardView;
export type SportsOperationalMatchSchedule = SportsMatchScheduleView & SportsVenueLocationView;

export interface SportsOperationalMatch {
  id: string;
  eventId: string;
  categoryId: string;
  revision: number;
  homeRegistrationId?: string | null;
  awayRegistrationId?: string | null;
  homeTeam?: SportsTeamSummary | null;
  awayTeam?: SportsTeamSummary | null;
  state: SportsMatchState;
  scoreboard: SportsScoreboard;
  timerStartedAt?: string | null;
  timerStartedAtUnixMs?: number | null;
  timerPausedAt?: string | null;
  timerPausedAtUnixMs?: number | null;
  elapsedBeforePauseMs: number;
  periodTimers: SportsMatchPeriodTimer[];
  overallTimerEnabled: boolean;
  periodTimerEnabled: boolean;
  timerPeriodDurationMs?: number | null;
  timerPeriodStartOffsetsMs: number[];
  timerAllowOvertime: boolean;
  schedule: SportsOperationalMatchSchedule;
  rosters: SportsOperationsRoster[];
  officials: SportsOperationsOfficial[];
  readiness: SportsMatchReadiness;
  notes?: string | null;
  occurrencesJson?: string | null;
}

export interface SportsMatchReadinessIssue {
  code: 'MINIMUM_ROSTER' | 'ATHLETE_ATTENDANCE' | 'OFFICIAL_ATTENDANCE' | 'PRIOR_BRACKET_RESULT' | 'PAYMENT';
  message: string;
  registrationId?: string | null;
  missing?: number | null;
  required?: number | null;
  actual?: number | null;
}

export interface SportsMatchReadiness {
  ready: boolean;
  issues: SportsMatchReadinessIssue[];
}

export interface SportsOperationsRosterEntry {
  id: string;
  attendanceSyncKey?: string | null;
  name: string;
  role: SportsRosterRole;
  status: SportsRosterEntryStatus;
  checkedInAt?: string | null;
  shirtNumber?: string | null;
}

export interface SportsOperationsRoster {
  id: string;
  registrationId: string;
  revision: number;
  status: SportsRosterStatus;
  team: SportsTeamSummary;
  entries: SportsOperationsRosterEntry[];
}

export interface SportsOperationsOfficial {
  id: string;
  attendanceSyncKey?: string | null;
  name: string;
  role: SportsOfficialRole;
  checkedInAt?: string | null;
}

export interface SportsLineupRead {
  matchId: string;
  matchRevision: number;
  registrationId: string;
  homeRegistrationId?: string | null;
  awayRegistrationId?: string | null;
  eligibleMembers: Array<{
    registrationMemberId: string;
    name: string;
    role: SportsRosterRole;
    shirtNumber?: string | null;
  }>;
  roster?: {
    id: string;
    revision: number;
    status: SportsRosterStatus;
    entries: Array<{
      id: string;
      registrationMemberId: string;
      role: SportsRosterRole;
      status: SportsRosterEntryStatus;
      checkedInAt?: string | null;
      shirtNumber?: string | null;
    }>;
  } | null;
}

export type SportsMatchAction = OfflineSportsMatchAction;
export type SportsRosterCheckIn = OfflineSportsRosterCheckIn;
export type SportsOfficialCheckIn = OfflineSportsOfficialCheckIn;
export type SportsScannerCheckIn = OfflineSportsScannerCheckIn;
export type SportsTimerSnapshot = OfflineSportsTimerSnapshot;

export interface SportsTimerRestoration extends SportsTimerSnapshot {
  state: Extract<SportsMatchState, 'LIVE' | 'PAUSED'>;
}

export interface SportsTimerConflict {
  matchId: string;
  queuedActionIds: string[];
  device: SportsTimerSnapshot;
}

export interface SportsOfflineCollectorCredential {
  credential: string;
  collectorPersonId: string;
  issuedAt: string;
}

export type QueuedSportsOperation = OfflineSportsOperationQueueItem;

export interface RepresentativeIdentityHint {
  clientKey: string;
  type: SportsIdentityType;
  displayHint: string;
}

export interface RepresentativeTeamChange {
  id: string;
  type: SportsTeamChangeRequestType;
  status: SportsTeamChangeRequestStatus;
  requestRevision: number;
  baseRevision: number;
  deltaJson: string;
  reviewMessage?: string | null;
  identityHints: RepresentativeIdentityHint[];
  updatedAt: string;
}

export interface RepresentativeTeamWorkspace {
  team: SportsTeamSummary;
  teamRevision: number;
  queuedChanges: RepresentativeTeamChange[];
  members: Array<{
    id: string;
    name: string;
    status: SportsTeamMemberStatus;
    revision: number;
    categoryRoles: Array<{
      registrationId: string;
      categoryId: string;
      categoryName: string;
      role: SportsRosterRole;
      eligibility: SportsEligibilityStatus;
    }>;
  }>;
  registrations: Array<{
    id: string;
    categoryId: string;
    categoryName: string;
    categoryEmoji: string;
    status: SportsRegistrationStatus;
  }>;
  matches: Array<{
    id: string;
    eventId: string;
    state: SportsMatchState;
    startDate: string;
    endDate: string;
    homeRegistrationId?: string | null;
    awayRegistrationId?: string | null;
    categoryId: string;
    categoryName: string;
    categoryEmoji: string;
    homeTeam?: SportsTeamSummary | null;
    awayTeam?: SportsTeamSummary | null;
  }>;
  joinQueueCount: number;
}

export interface SportsApplicationOption {
  id: string;
  name: string;
  emoji: string;
  division?: string | null;
}

export interface CurrentUserSportsPlayerApplication {
  id: string;
  tournamentId: string;
  requestedTeam: SportsTeamSummary | null;
  categories: Array<{ id: string; name: string; division?: string | null }>;
  status: SportsApplicationStatus;
  participantStatus?: string | null;
  paymentStatus?: string | null;
  paymentTier?: string | null;
  imageLicenseAgreementAccepted: boolean;
  reviewedAt?: string | null;
  reviewMessage?: string | null;
}

export interface CurrentUserTournamentOperations {
  imageLicenseAgreementAccepted: boolean;
  tournament: {
    id: string;
    name: string;
    emoji: string;
    isPaymentRequired: boolean;
    requiresImageLicenseAgreement: boolean;
    selfSubscriptionAllowNoTeam: boolean;
    selfSubscriptionAllowNoCategory: boolean;
    paymentTiers: Array<{ id: string; name: string; value: number }>;
    teams: SportsTeamSummary[];
    categories: SportsApplicationOption[];
  };
}
