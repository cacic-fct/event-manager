import {
  sportsFormatLabel,
  sportsMatchStateLabel,
  sportsStageLabel,
  type SportsFormat,
  type SportsMatchState,
  type SportsStageType,
} from '@cacic-fct/shared-data-types/sports-metadata';

export interface SportsBracketTeamView {
  id: string;
  name: string;
  logoUrl?: string | null;
}

export interface SportsBracketScoreView {
  homeScore: number;
  awayScore: number;
}

export interface SportsBracketMatchView {
  id: string;
  roundNumber?: number | null;
  bracketPosition?: number | null;
  groupKey?: string | null;
  state: SportsMatchState;
  homeTeam?: SportsBracketTeamView | null;
  awayTeam?: SportsBracketTeamView | null;
  scoreboard: SportsBracketScoreView;
}

export interface SportsBracketStageView {
  id: string;
  name: string;
  type: SportsStageType;
  displayOrder: number;
  matches: readonly SportsBracketMatchView[];
}

export interface SportsBracketStandingView {
  team: SportsBracketTeamView;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  rank?: number | null;
}

export type SportsBracketFormat = SportsFormat;

export function sportsBracketFormatLabel(format: SportsBracketFormat): string {
  return sportsFormatLabel(format);
}

export function sportsBracketStageLabel(type: SportsStageType): string {
  return sportsStageLabel(type);
}

export function sportsBracketMatchStateLabel(state: SportsMatchState): string {
  return sportsMatchStateLabel(state);
}
