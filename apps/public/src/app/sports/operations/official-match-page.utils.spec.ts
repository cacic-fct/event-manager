import { describe, expect, it } from 'vitest';
import { formatSportsElapsed, parseMatchOccurrences, sortCheckInEntries } from './official-match-page.utils';

describe('official match page utilities', () => {
  it('formats elapsed durations for the operations clock', () => {
    expect(formatSportsElapsed(3_723_000)).toBe('01:02:03');
  });

  it('keeps only valid match occurrences', () => {
    expect(
      parseMatchOccurrences(
        JSON.stringify([
          { occurrenceId: 'valid', kind: 'INJURY', note: 'Atendimento' },
          { occurrenceId: 'invalid', kind: 'UNKNOWN', note: 'Ignorar' },
        ]),
      ),
    ).toEqual([{ occurrenceId: 'valid', kind: 'INJURY', note: 'Atendimento' }]);
    expect(parseMatchOccurrences('{')).toEqual([]);
  });

  it('sorts live check-in entries by shirt number and then name', () => {
    const entries = [
      { id: '1', name: 'Zeca', team: 'home' as const, checkedIn: true, role: 'PLAYER' as const, shirtNumber: null },
      { id: '2', name: 'Ana', team: 'home' as const, checkedIn: true, role: 'PLAYER' as const, shirtNumber: '10' },
      { id: '3', name: 'Bia', team: 'home' as const, checkedIn: true, role: 'PLAYER' as const, shirtNumber: '2' },
      { id: '4', name: 'Outra equipe', team: 'away' as const, checkedIn: true, role: 'PLAYER' as const },
    ];

    expect(sortCheckInEntries(entries, 'home', 'LIVE').map((entry) => entry.id)).toEqual(['3', '2', '1']);
    expect(sortCheckInEntries(entries, 'home', 'CHECK_IN').map((entry) => entry.id)).toEqual(['2', '3', '1']);
  });
});
