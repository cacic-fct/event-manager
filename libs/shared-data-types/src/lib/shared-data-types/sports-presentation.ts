import type {
  SportsFormat,
  SportsLossReason,
  SportsMatchState,
  SportsOfficialRole,
  SportsPreset,
  SportsRosterRole,
  SportsStageType,
} from './sports-enums';
import { SPORTS_PRESETS } from './sports-metadata';

export const SPORTS_MATCH_STATE_LABELS: Readonly<Record<SportsMatchState, string>> = {
  SCHEDULED: 'Agendada',
  CHECK_IN: 'Credenciamento',
  LIVE: 'Ao vivo',
  PAUSED: 'Pausada',
  AWAITING_REVIEW: 'Em revisão',
  CANCELED: 'Cancelada',
  DRAW: 'Empate',
  FINISHED: 'Finalizada',
};

export const SPORTS_PRESET_LABELS: Readonly<Record<SportsPreset, string>> = Object.fromEntries(
  Object.entries(SPORTS_PRESETS).map(([key, preset]) => [key, preset.label]),
) as Record<SportsPreset, string>;

export const SPORTS_FORMAT_LABELS: Readonly<Record<SportsFormat, string>> = {
  SINGLE_ELIMINATION: 'Eliminação simples',
  ROUND_ROBIN: 'Todos contra todos',
  GROUP_STAGE_ELIMINATION: 'Grupos e eliminatórias',
  DOUBLE_ELIMINATION: 'Eliminação dupla',
  SWISS: 'Sistema suíço',
  CUSTOM: 'Formato personalizado',
};

export const SPORTS_STAGE_LABELS: Readonly<Record<SportsStageType, string>> = {
  GROUP: 'Fase de grupos',
  ELIMINATION: 'Eliminatória',
  WINNERS_BRACKET: 'Chave dos vencedores',
  LOSERS_BRACKET: 'Chave de repescagem',
  SWISS: 'Rodadas suíças',
  FINAL: 'Final',
};

export const SPORTS_OFFICIAL_ROLE_LABELS: Readonly<Record<SportsOfficialRole, string>> = {
  REFEREE: 'Arbitragem',
  INTERMEDIATOR: 'Intermediação',
  SCOREKEEPER: 'Mesário',
};

export const SPORTS_ROSTER_ROLE_LABELS: Readonly<Record<SportsRosterRole, string>> = {
  PLAYER: 'Atleta',
  CAPTAIN: 'Capitão',
  COACH: 'Técnico',
};

export const SPORTS_LOSS_REASON_LABELS: Readonly<Record<SportsLossReason, string>> = {
  SCORE: 'Placar',
  WALKOVER: 'W.O.',
  FORFEIT: 'Desistência',
  DISQUALIFICATION: 'Desclassificação',
  INJURY: 'Lesão',
  NO_SHOW: 'Ausência',
  OTHER: 'Outro motivo',
};

export function sportsMatchStateLabel(state: SportsMatchState): string {
  return SPORTS_MATCH_STATE_LABELS[state];
}

export function sportsPresetLabel(sport: SportsPreset, customName?: string | null): string {
  return sport === 'OTHER' && customName?.trim() ? customName.trim() : SPORTS_PRESET_LABELS[sport];
}

export function sportsFormatLabel(format: SportsFormat): string {
  return SPORTS_FORMAT_LABELS[format];
}

export function sportsStageLabel(stage: SportsStageType): string {
  return SPORTS_STAGE_LABELS[stage];
}

export function sportsOfficialRoleLabel(role: SportsOfficialRole): string {
  return SPORTS_OFFICIAL_ROLE_LABELS[role];
}

export function sportsRosterRoleLabel(role: SportsRosterRole): string {
  return SPORTS_ROSTER_ROLE_LABELS[role];
}

export function sportsLossReasonLabel(reason: SportsLossReason): string {
  return SPORTS_LOSS_REASON_LABELS[reason];
}
