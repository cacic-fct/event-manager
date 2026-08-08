import type {
  SportsFormat,
  SportsLossReason,
  SportsMatchState,
  SportsOfficialRole,
  SportsPreset,
  SportsRosterRole,
  SportsStageType,
} from '@cacic-fct/shared-data-types';

export interface PublicSportsTeam {
  id: string;
  name: string;
  institution?: string | null;
  logoUrl?: string | null;
}

export interface PublicSportsScorePeriod {
  number: number;
  label: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
}

export interface PublicSportsScoreboard {
  homeScore: number;
  awayScore: number;
  periods: PublicSportsScorePeriod[];
  activePeriod?: number | null;
}

export interface PublicSportsMatchSchedule {
  startDate: string;
  endDate: string;
  locationDescription?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  venueName?: string | null;
  courtLabel?: string | null;
}

export interface PublicSportsRosterEntry {
  name: string;
  role: SportsRosterRole;
}

export interface PublicSportsRoster {
  team: PublicSportsTeam;
  entries: PublicSportsRosterEntry[];
}

export interface PublicSportsOfficial {
  name: string;
  role: SportsOfficialRole;
}

export interface PublicSportsMatch {
  id: string;
  eventId: string;
  categoryId: string;
  stageId?: string | null;
  homeTeam?: PublicSportsTeam | null;
  awayTeam?: PublicSportsTeam | null;
  state: SportsMatchState;
  scoreboard: PublicSportsScoreboard;
  winner?: PublicSportsTeam | null;
  loser?: PublicSportsTeam | null;
  lossReason?: SportsLossReason | null;
  lossReasonDetail?: string | null;
  drawWillReschedule?: boolean | null;
  timerStartedAt?: string | null;
  timerStartedAtUnixMs?: number | null;
  timerPausedAt?: string | null;
  timerPausedAtUnixMs?: number | null;
  elapsedBeforePauseMs: number;
  periodTimers: Array<{
    periodNumber: number;
    startedAtUnixMs?: number | null;
    pausedAtUnixMs?: number | null;
    elapsedBeforePauseMs: number;
    scheduledStartOffsetMs: number;
    capMs?: number | null;
    allowOvertime: boolean;
  }>;
  overallTimerEnabled: boolean;
  periodTimerEnabled: boolean;
  timerPeriodDurationMs?: number | null;
  timerPeriodStartOffsetsMs: number[];
  timerAllowOvertime: boolean;
  roundNumber?: number | null;
  bracketPosition?: number | null;
  groupKey?: string | null;
  schedule: PublicSportsMatchSchedule;
  rosters: PublicSportsRoster[];
  officials: PublicSportsOfficial[];
  livestreamProvider?: 'YOUTUBE' | 'TWITCH' | 'GENERAL' | null;
  livestreamUrl?: string | null;
}

export interface PublicSportsStanding {
  team: PublicSportsTeam;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
  rank?: number | null;
}

export interface PublicSportsPlacement {
  team: PublicSportsTeam;
  placement: number;
  pointsAwarded?: number | null;
}

export interface PublicSportsBracket {
  id: string;
  name: string;
  type: SportsStageType;
  displayOrder: number;
  matches: PublicSportsMatch[];
}

export interface PublicSportsCategory {
  id: string;
  name: string;
  emoji: string;
  sport: SportsPreset;
  customSportName?: string | null;
  division?: string | null;
  format: SportsFormat;
  rulesText?: string | null;
  standings: PublicSportsStanding[];
  placements: PublicSportsPlacement[];
  brackets: PublicSportsBracket[];
  matches: PublicSportsMatch[];
}

export interface PublicSportsOverallScore {
  team: PublicSportsTeam;
  points: number;
}

export interface PublicSportsTournamentDetail {
  id: string;
  majorEventId: string;
  name: string;
  emoji: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  selfSubscriptionEnabled: boolean;
  isPaymentRequired: boolean;
  paymentTiers: Array<{ id: string; name: string; value: number }>;
  teams: PublicSportsTeam[];
  categories: PublicSportsCategory[];
  matches: PublicSportsMatch[];
  overallScores: PublicSportsOverallScore[];
  matchesArePersonalized?: boolean;
}

export type SportsViewerPageState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; liveConnectionLost: boolean }
  | { status: 'error'; message: string };

export interface SportsViewerInvalidation {
  type?: string;
  matchId?: string;
  tournamentId?: string;
  categoryId?: string;
  state?: SportsMatchState;
  scoreboard?: PublicSportsScoreboard;
  revision?: number;
}
