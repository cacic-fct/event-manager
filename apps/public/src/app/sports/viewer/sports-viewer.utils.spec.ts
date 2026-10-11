import type { PublicSportsMatch } from './sports-viewer.types';
import {
  isMatchStarted,
  matchLocation,
  publicOfficialName,
  publicPlayerName,
  sportsFormatLabel,
  sportsLossReasonLabel,
  sportsMatchStateLabel,
  sportsOfficialRoleLabel,
  sportsPresetLabel,
  sportsRosterRoleLabel,
  sportsStageLabel,
} from './sports-viewer.utils';

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

  it('uses canonical shared sports labels while preserving custom sport names', () => {
    expect(sportsMatchStateLabel('CHECK_IN')).toBe('Credenciamento');
    expect(sportsPresetLabel('VOLLEYBALL')).toBe('Vôlei');
    expect(sportsPresetLabel('OTHER', '  Queimada  ')).toBe('Queimada');
    expect(sportsFormatLabel('DOUBLE_ELIMINATION')).toBe('Eliminação dupla');
    expect(sportsStageLabel('LOSERS_BRACKET')).toBe('Chave de repescagem');
    expect(sportsOfficialRoleLabel('REFEREE')).toBe('Arbitragem');
    expect(sportsRosterRoleLabel('CAPTAIN')).toBe('Capitão');
    expect(sportsLossReasonLabel('DISQUALIFICATION')).toBe('Desclassificação');
  });

  it.each([
    ['SCHEDULED', false],
    ['CHECK_IN', false],
    ['LIVE', true],
    ['PAUSED', true],
    ['AWAITING_REVIEW', false],
    ['FINISHED', true],
    ['DRAW', true],
    ['CANCELED', false],
  ] as const)('makes match details public after match start for %s: %s', (state, expected) => {
    expect(isMatchStarted({ state } as PublicSportsMatch)).toBe(expected);
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
    ).toBe('Ginásio central, Quadra 1');
    expect(matchLocation({ schedule: {} } as PublicSportsMatch)).toBe('Local a definir');
  });
});
