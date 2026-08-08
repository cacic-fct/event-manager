export type SportsMatchState =
  | 'SCHEDULED'
  | 'CHECK_IN'
  | 'LIVE'
  | 'PAUSED'
  | 'AWAITING_REVIEW'
  | 'CANCELED'
  | 'DRAW'
  | 'FINISHED';

export type SportsMatchActionType =
  | 'CHECK_IN'
  | 'START'
  | 'PAUSE'
  | 'RESUME'
  | 'SCORE_DELTA'
  | 'SCORE_CORRECTION'
  | 'PERIOD_ROLL'
  | 'TIMER_RECONCILE'
  | 'OCCURRENCE'
  | 'FINALIZE'
  | 'CANCEL'
  | 'FORFEIT';

export interface SportsTeamSummary {
  id: string;
  name: string;
  institution?: string | null;
  logoUrl?: string | null;
}

export interface SportsScorePeriod {
  number: number;
  label: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
}

export interface SportsMatchPeriodTimer {
  periodNumber: number;
  startedAtUnixMs?: number | null;
  pausedAtUnixMs?: number | null;
  elapsedBeforePauseMs: number;
  scheduledStartOffsetMs: number;
  capMs?: number | null;
  allowOvertime: boolean;
}

export interface SportsScoreboard {
  homeScore: number;
  awayScore: number;
  periods: SportsScorePeriod[];
  activePeriod?: number | null;
}

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
  schedule: {
    startDate: string;
    endDate: string;
    venueName?: string | null;
    courtLabel?: string | null;
    locationDescription?: string | null;
  };
  rosters: SportsOperationsRoster[];
  notes?: string | null;
  occurrencesJson?: string | null;
}

export interface SportsOperationsRosterEntry {
  id: string;
  name: string;
  role: 'PLAYER' | 'CAPTAIN' | 'COACH';
  status: 'EXPECTED' | 'CHECKED_IN' | 'ABSENT' | 'EXCUSED';
  checkedInAt?: string | null;
  shirtNumber?: string | null;
}

export interface SportsOperationsRoster {
  id: string;
  registrationId: string;
  revision: number;
  status: string;
  team: SportsTeamSummary;
  entries: SportsOperationsRosterEntry[];
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
    role: 'PLAYER' | 'CAPTAIN' | 'COACH';
    shirtNumber?: string | null;
  }>;
  roster?: {
    id: string;
    revision: number;
    status: string;
    entries: Array<{
      id: string;
      registrationMemberId: string;
      role: 'PLAYER' | 'CAPTAIN' | 'COACH';
      status: string;
      checkedInAt?: string | null;
      shirtNumber?: string | null;
    }>;
  } | null;
}

export interface SportsMatchAction {
  clientId: string;
  matchId: string;
  baseRevision: number;
  type: SportsMatchActionType;
  payloadJson: string;
  scorerRosterEntryId?: string | null;
  authoredAt: string;
  offline: boolean;
}

export interface SportsRosterCheckIn {
  clientId: string;
  matchId: string;
  rosterEntryId: string;
  checkedInAt: string;
  offline: boolean;
  present?: boolean;
}

export interface SportsScannerCheckIn {
  clientId: string;
  matchId: string;
  code: string;
  checkedInAt: string;
  offline: boolean;
}

export interface SportsTimerSnapshot {
  overall: {
    startedAtUnixMs: number | null;
    pausedAtUnixMs: number | null;
    elapsedBeforePauseMs: number;
  };
  periods: SportsMatchPeriodTimer[];
  activePeriod: number | null;
}

export interface SportsTimerConflict {
  matchId: string;
  queuedActionIds: string[];
  device: SportsTimerSnapshot;
}

interface QueuedSportsOperationBase {
  id: string;
  userScope: string;
  attempts: number;
  queuedAt: string;
  lastError?: string;
}

export type QueuedSportsOperation =
  | (QueuedSportsOperationBase & { kind: 'ACTION'; action: SportsMatchAction; timerSnapshot?: SportsTimerSnapshot })
  | (QueuedSportsOperationBase & { kind: 'CHECK_IN'; checkIn: SportsRosterCheckIn })
  | (QueuedSportsOperationBase & { kind: 'SCANNER'; scannerCheckIn: SportsScannerCheckIn });

export interface RepresentativeIdentityHint {
  clientKey: string;
  type: 'IDENTITY_DOCUMENT' | 'PHONE' | 'EMAIL';
  displayHint: string;
}

export interface RepresentativeTeamChange {
  id: string;
  type:
    | 'TEAM_DETAILS'
    | 'MEMBER_ADD'
    | 'MEMBER_REMOVE'
    | 'MEMBER_UPDATE'
    | 'LOGO'
    | 'REPRESENTATIVE'
    | 'CATEGORY_ROLE'
    | 'LINEUP';
  status: 'PENDING' | 'CONFLICT' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
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
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'WITHDRAWN';
    revision: number;
    categoryRoles: Array<{
      registrationId: string;
      categoryId: string;
      categoryName: string;
      role: 'PLAYER' | 'CAPTAIN' | 'COACH';
      eligibility: string;
    }>;
  }>;
  registrations: Array<{
    id: string;
    categoryId: string;
    categoryName: string;
    categoryEmoji: string;
    status: string;
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
  joinQueue: Array<{
    id: string;
    applicantName: string;
    identityDocumentHint?: string | null;
    categoryNames: string[];
    status: string;
  }>;
}

export interface SportsApplicationOption {
  id: string;
  name: string;
  emoji: string;
  division?: string | null;
}

export interface CurrentUserTournamentOperations {
  tournament: {
    id: string;
    name: string;
    emoji: string;
    isPaymentRequired: boolean;
    selfSubscriptionAllowNoTeam: boolean;
    selfSubscriptionAllowNoCategory: boolean;
    paymentTiers: Array<{ id: string; name: string; value: number }>;
    teams: SportsTeamSummary[];
    categories: SportsApplicationOption[];
  };
}
