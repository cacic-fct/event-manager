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
  timerPausedAt?: string | null;
  elapsedBeforePauseMs: number;
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

interface QueuedSportsOperationBase {
  id: string;
  userScope: string;
  attempts: number;
  queuedAt: string;
  lastError?: string;
}

export type QueuedSportsOperation =
  | (QueuedSportsOperationBase & { kind: 'ACTION'; action: SportsMatchAction })
  | (QueuedSportsOperationBase & { kind: 'CHECK_IN'; checkIn: SportsRosterCheckIn });

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
  status:
    | 'PENDING'
    | 'CONFLICT'
    | 'CHANGES_REQUESTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'SUPERSEDED';
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
