import type {
  SportsFormat,
  SportsLossReason,
  SportsMatchState,
  SportsOfficialRole,
  SportsPreset,
  SportsRosterRole,
  SportsStageType,
} from '@cacic-fct/shared-data-types';
import type { PublicSportsMatch } from './sports-viewer.types';

const MATCH_STATE_LABELS: Record<SportsMatchState, string> = {
  SCHEDULED: 'Agendada',
  CHECK_IN: 'Credenciamento',
  LIVE: 'Ao vivo',
  PAUSED: 'Pausada',
  AWAITING_REVIEW: 'Em revisão',
  CANCELED: 'Cancelada',
  DRAW: 'Empate',
  FINISHED: 'Encerrada',
};

const SPORT_LABELS: Record<SportsPreset, string> = {
  SOCCER: 'Futebol',
  FUTSAL: 'Futsal',
  TENNIS: 'Tênis',
  BASKETBALL: 'Basquete',
  ESPORTS: 'E-sports',
  CHESS: 'Xadrez',
  VOLLEYBALL: 'Vôlei',
  SWIMMING: 'Natação',
  TABLE_TENNIS: 'Tênis de mesa',
  HANDBALL: 'Handebol',
  OTHER: 'Outro esporte',
};

const FORMAT_LABELS: Record<SportsFormat, string> = {
  SINGLE_ELIMINATION: 'Eliminação simples',
  ROUND_ROBIN: 'Todos contra todos',
  GROUP_STAGE_ELIMINATION: 'Grupos e eliminatórias',
  DOUBLE_ELIMINATION: 'Eliminação dupla',
  SWISS: 'Sistema suíço',
  CUSTOM: 'Formato personalizado',
};

const STAGE_LABELS: Record<SportsStageType, string> = {
  GROUP: 'Fase de grupos',
  ELIMINATION: 'Eliminatória',
  WINNERS_BRACKET: 'Chave dos vencedores',
  LOSERS_BRACKET: 'Chave de repescagem',
  SWISS: 'Rodadas suíças',
  FINAL: 'Final',
};

const OFFICIAL_ROLE_LABELS: Record<SportsOfficialRole, string> = {
  REFEREE: 'Arbitragem',
  INTERMEDIATOR: 'Intermediação',
  SCOREKEEPER: 'Mesário',
};

const ROSTER_ROLE_LABELS: Record<SportsRosterRole, string> = {
  PLAYER: 'Atleta',
  CAPTAIN: 'Capitão',
  COACH: 'Técnico',
};

const LOSS_REASON_LABELS: Record<SportsLossReason, string> = {
  SCORE: 'Placar',
  WALKOVER: 'W.O.',
  FORFEIT: 'Desistência',
  DISQUALIFICATION: 'Desclassificação',
  INJURY: 'Lesão',
  NO_SHOW: 'Ausência',
  OTHER: 'Outro motivo',
};

export function sportsMatchStateLabel(state: SportsMatchState): string {
  return MATCH_STATE_LABELS[state];
}

export function sportsPresetLabel(sport: SportsPreset, customName?: string | null): string {
  return sport === 'OTHER' && customName?.trim() ? customName.trim() : SPORT_LABELS[sport];
}

export function sportsFormatLabel(format: SportsFormat): string {
  return FORMAT_LABELS[format];
}

export function sportsStageLabel(stage: SportsStageType): string {
  return STAGE_LABELS[stage];
}

export function sportsOfficialRoleLabel(role: SportsOfficialRole): string {
  return OFFICIAL_ROLE_LABELS[role];
}

export function sportsRosterRoleLabel(role: SportsRosterRole): string {
  return ROSTER_ROLE_LABELS[role];
}

export function sportsLossReasonLabel(reason: SportsLossReason): string {
  return LOSS_REASON_LABELS[reason];
}

export function publicPlayerName(name: string): string {
  const parts = normalizedNameParts(name);
  if (parts.length <= 2) {
    return parts.join(' ');
  }
  return `${parts[0]} ${parts.at(-1)}`;
}

export function publicOfficialName(name: string): string {
  const parts = normalizedNameParts(name);
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }
  return `${parts[0]} ${parts.at(-1)?.charAt(0).toLocaleUpperCase('pt-BR')}.`;
}

export function isRosterPublic(match: PublicSportsMatch): boolean {
  return match.state === 'FINISHED' || match.state === 'DRAW';
}

export function matchParticipantName(
  match: PublicSportsMatch,
  side: 'home' | 'away',
): string {
  return (side === 'home' ? match.homeTeam : match.awayTeam)?.name ?? 'A definir';
}

export function matchLocation(match: PublicSportsMatch): string {
  const parts = [
    match.schedule.venueName,
    match.schedule.courtLabel,
    match.schedule.locationDescription,
  ].filter((value): value is string => Boolean(value?.trim()));
  return [...new Set(parts)].join(' · ') || 'Local a definir';
}

export function compareSportsMatches(left: PublicSportsMatch, right: PublicSportsMatch): number {
  return new Date(left.schedule.startDate).getTime() - new Date(right.schedule.startDate).getTime();
}

function normalizedNameParts(name: string): string[] {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
