import type {
  SportsFormat,
  SportsMatchState,
  SportsStageType,
} from '@cacic-fct/shared-data-types';

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
  return {
    SINGLE_ELIMINATION: 'Eliminação simples',
    ROUND_ROBIN: 'Todos contra todos',
    GROUP_STAGE_ELIMINATION: 'Grupos e eliminatórias',
    DOUBLE_ELIMINATION: 'Dupla eliminação',
    SWISS: 'Sistema suíço',
    CUSTOM: 'Formato personalizado',
  }[format];
}

export function sportsBracketStageLabel(type: SportsStageType): string {
  return {
    GROUP: 'Fase de grupos',
    ELIMINATION: 'Eliminatórias',
    WINNERS_BRACKET: 'Chave dos vencedores',
    LOSERS_BRACKET: 'Chave de repescagem',
    SWISS: 'Rodadas suíças',
    FINAL: 'Finais',
  }[type];
}

export function sportsBracketMatchStateLabel(state: SportsMatchState): string {
  return {
    SCHEDULED: 'Agendada',
    CHECK_IN: 'Check-in',
    LIVE: 'Ao vivo',
    PAUSED: 'Pausada',
    AWAITING_REVIEW: 'Em revisão',
    CANCELED: 'Cancelada',
    DRAW: 'Empate',
    FINISHED: 'Finalizada',
  }[state];
}
