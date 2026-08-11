export {
  sportsFormatLabel,
  sportsLossReasonLabel,
  sportsMatchStateLabel,
  sportsOfficialRoleLabel,
  sportsPresetLabel,
  sportsRosterRoleLabel,
  sportsStageLabel,
} from '@cacic-fct/shared-data-types/sports-metadata';
import type { PublicSportsMatch } from './sports-viewer.types';

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

export function matchParticipantName(match: PublicSportsMatch, side: 'home' | 'away'): string {
  return (side === 'home' ? match.homeTeam : match.awayTeam)?.name ?? 'A definir';
}

export function matchLocation(match: PublicSportsMatch): string {
  const parts = [match.schedule.venueName, match.schedule.courtLabel, match.schedule.locationDescription].filter(
    (value): value is string => Boolean(value?.trim()),
  );
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
