import {
  assertSportsOverallScoringRules,
  normalizeSportsOverallScoringRules,
  sportsOverallScoringUsesFinalPlacement,
  sportsOverallScoringUsesMatchResult,
} from './sports-overall-scoring';

describe('sports overall scoring rules', () => {
  it('normalizes match and final-placement scoring independently', () => {
    const rules = normalizeSportsOverallScoringRules({
      mode: 'MATCH_RESULT_AND_FINAL_PLACEMENT',
      match: { win: 3, draw: 1, loss: 0 },
      placement: { '1': 10, '2': 6 },
    });

    expect(rules).toEqual({
      mode: 'MATCH_RESULT_AND_FINAL_PLACEMENT',
      match: { win: 3, draw: 1, loss: 0 },
      placement: { '1': 10, '2': 6 },
    });
    expect(sportsOverallScoringUsesMatchResult(rules.mode)).toBe(true);
    expect(sportsOverallScoringUsesFinalPlacement(rules.mode)).toBe(true);
  });

  it('keeps legacy bracket placement points working until the category is configured', () => {
    expect(normalizeSportsOverallScoringRules({}, { '1': 10, '2': 6 })).toMatchObject({
      mode: 'FINAL_PLACEMENT',
      placement: { '1': 10, '2': 6 },
    });
  });

  it('rejects unknown fields and unsafe point values', () => {
    expect(() => assertSportsOverallScoringRules({ unexpected: true })).toThrow(
      'Campos desconhecidos nas regras de pontuação geral',
    );
    expect(() => assertSportsOverallScoringRules({ match: { win: -1 } })).toThrow('win em match');
    expect(() => assertSportsOverallScoringRules({ placement: { '101': 1 } })).toThrow('posições');
  });
});
