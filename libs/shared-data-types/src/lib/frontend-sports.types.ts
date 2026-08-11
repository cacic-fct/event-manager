export interface SportsTeamView {
  id: string;
  name: string;
  institution?: string | null;
  logoUrl?: string | null;
}

export interface SportsScorePeriodView {
  number: number;
  label: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
}

export interface SportsScoreboardView {
  homeScore: number;
  awayScore: number;
  periods: SportsScorePeriodView[];
  activePeriod?: number | null;
}

export interface SportsMatchPeriodTimerView {
  periodNumber: number;
  startedAtUnixMs?: number | null;
  pausedAtUnixMs?: number | null;
  elapsedBeforePauseMs: number;
  scheduledStartOffsetMs: number;
  capMs?: number | null;
  allowOvertime: boolean;
}

export interface SportsMatchScheduleView {
  startDate: string;
  endDate: string;
  locationDescription?: string | null;
}

export interface SportsVenueLocationView {
  venueName?: string | null;
  courtLabel?: string | null;
}
