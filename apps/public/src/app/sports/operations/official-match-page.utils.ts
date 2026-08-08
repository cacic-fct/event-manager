import { SportsMatchActionType, SportsOperationalMatch } from './sports-operations.types';

export interface CheckInEntry {
  id: string;
  name: string;
  team: 'home' | 'away';
  checkedIn: boolean;
  role: 'PLAYER' | 'CAPTAIN' | 'COACH';
  shirtNumber?: string | null;
}

export interface MatchOccurrence {
  occurrenceId: string;
  kind: 'SUBSTITUTION' | 'INJURY' | 'DISCIPLINE' | 'GENERAL';
  note: string;
  authoredAt?: string;
}

export function formatSportsElapsed(value: number): string {
  const totalSeconds = Math.floor(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export function isSportsTimerAction(type: SportsMatchActionType): boolean {
  return type === 'START' || type === 'PAUSE' || type === 'RESUME' || type === 'PERIOD_ROLL' || type === 'TIMER_RECONCILE';
}

export function parseMatchOccurrences(value: string | null | undefined): MatchOccurrence[] {
  try {
    const parsed = JSON.parse(value ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is MatchOccurrence => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return (
        typeof record['occurrenceId'] === 'string' &&
        isMatchOccurrenceKind(record['kind']) &&
        typeof record['note'] === 'string'
      );
    });
  } catch {
    return [];
  }
}

export function isMatchOccurrenceKind(value: unknown): value is MatchOccurrence['kind'] {
  return value === 'SUBSTITUTION' || value === 'INJURY' || value === 'DISCIPLINE' || value === 'GENERAL';
}

export function sortCheckInEntries(
  entries: CheckInEntry[],
  team: CheckInEntry['team'],
  state: SportsOperationalMatch['state'] | undefined,
): CheckInEntry[] {
  const sortByShirt = state !== 'SCHEDULED' && state !== 'CHECK_IN';
  return entries.filter((entry) => entry.team === team).sort((left, right) => {
    if (sortByShirt) {
      const leftHasShirt = Boolean(left.shirtNumber?.trim());
      const rightHasShirt = Boolean(right.shirtNumber?.trim());
      if (leftHasShirt !== rightHasShirt) {
        return leftHasShirt ? -1 : 1;
      }
      if (leftHasShirt && rightHasShirt) {
        const shirtOrder = (left.shirtNumber ?? '').localeCompare(right.shirtNumber ?? '', 'pt-BR', {
          numeric: true,
          sensitivity: 'base',
        });
        if (shirtOrder !== 0) {
          return shirtOrder;
        }
      }
    }
    return left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });
  });
}
