import { SPORTS_BRACKET_FIXTURES } from './sports-bracket.fixtures';
import {
  sportsBracketFormatLabel,
  sportsBracketMatchStateLabel,
} from './sports-bracket.models';

describe('sports bracket shared contract', () => {
  it('provides rich, deterministic examples for every supported format', () => {
    expect(Object.keys(SPORTS_BRACKET_FIXTURES)).toEqual([
      'SINGLE_ELIMINATION',
      'ROUND_ROBIN',
      'GROUP_STAGE_ELIMINATION',
      'DOUBLE_ELIMINATION',
      'SWISS',
      'CUSTOM',
    ]);
    expect(SPORTS_BRACKET_FIXTURES.SINGLE_ELIMINATION.stages[0]?.matches.length).toBeGreaterThan(8);
    expect(SPORTS_BRACKET_FIXTURES.DOUBLE_ELIMINATION.stages.length).toBeGreaterThan(1);
    expect(SPORTS_BRACKET_FIXTURES.SWISS.standings.length).toBeGreaterThan(8);
  });

  it('translates formats and match states instead of exposing enums', () => {
    expect(sportsBracketFormatLabel('GROUP_STAGE_ELIMINATION')).toBe('Grupos e eliminatórias');
    expect(sportsBracketMatchStateLabel('CANCELED')).toBe('Cancelada');
    expect(sportsBracketMatchStateLabel('AWAITING_REVIEW')).toBe('Em revisão');
  });
});
