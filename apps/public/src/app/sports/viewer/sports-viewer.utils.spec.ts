import type { PublicSportsMatch } from './sports-viewer.types';
import { isRosterPublic, matchLocation, publicOfficialName, publicPlayerName } from './sports-viewer.utils';

describe('sports viewer privacy and display utilities', () => {
  it('limits public player names to the first and last names', () => {
    expect(publicPlayerName('  Ana   Beatriz de Souza  ')).toBe('Ana Souza');
    expect(publicPlayerName('João Silva')).toBe('João Silva');
    expect(publicPlayerName('Madonna')).toBe('Madonna');
  });

  it('limits official names to first name and final surname initial', () => {
    expect(publicOfficialName('Maria Clara dos Santos')).toBe('Maria S.');
    expect(publicOfficialName('Ravi')).toBe('Ravi');
  });

  it.each([
    ['SCHEDULED', false],
    ['CHECK_IN', false],
    ['LIVE', false],
    ['AWAITING_REVIEW', false],
    ['FINISHED', true],
    ['DRAW', true],
    ['CANCELED', false],
  ] as const)('publishes rosters for %s: %s', (state, expected) => {
    expect(isRosterPublic({ state } as PublicSportsMatch)).toBe(expected);
  });

  it('deduplicates venue details and provides an explicit fallback', () => {
    expect(
      matchLocation({
        schedule: {
          venueName: 'Ginásio central',
          courtLabel: 'Quadra 1',
          locationDescription: 'Ginásio central',
        },
      } as PublicSportsMatch),
    ).toBe('Ginásio central · Quadra 1');
    expect(matchLocation({ schedule: {} } as PublicSportsMatch)).toBe('Local a definir');
  });
});
