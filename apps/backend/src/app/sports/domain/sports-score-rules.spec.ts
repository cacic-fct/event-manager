import { SportsLossReason } from '@prisma/client';
import {
  assertSportsOutcomeMatchesRules,
  assertSportsScoreDeltaMatchesRules,
  normalizeSportsScoreRules,
  SportsScoreRules,
} from './sports-score-rules';

const rules: SportsScoreRules = {
  strategy: 'TOTAL',
  allowDraw: true,
  higherWins: true,
  pointStep: 1,
};

describe('sports score outcome rules', () => {
  it('keeps pure score defaults and step validation on the shared compatibility surface', () => {
    expect(normalizeSportsScoreRules(null)).toEqual(rules);
    expect(normalizeSportsScoreRules({ strategy: 'SETS', allowDraw: false, pointStep: 0.5 })).toEqual({
      strategy: 'SETS',
      allowDraw: false,
      higherWins: true,
      pointStep: 0.5,
    });
    expect(() => assertSportsScoreDeltaMatchesRules(1.5, { ...rules, pointStep: 0.5 })).not.toThrow();
    expect(() => assertSportsScoreDeltaMatchesRules(1.25, { ...rules, pointStep: 0.5 })).toThrow(
      'A alteração de placar deve respeitar o passo de 0.5.',
    );
  });
  it('rejects a draw when the scoreboard is not tied', () => {
    expect(() =>
      assertSportsOutcomeMatchesRules({
        draw: true,
        drawWillReschedule: false,
        scoreboard: {
          home: 2,
          away: 1,
          periods: [],
          activePeriodNumber: null,
        },
        winnerSide: null,
        lossReason: null,
        rules,
      }),
    ).toThrow('Um empate exige placares iguais.');
  });

  it('rejects a tied score when a score-based winner is supplied', () => {
    expect(() =>
      assertSportsOutcomeMatchesRules({
        draw: false,
        drawWillReschedule: false,
        scoreboard: {
          home: 1,
          away: 1,
          periods: [],
          activePeriodNumber: null,
        },
        winnerSide: 'HOME',
        lossReason: SportsLossReason.SCORE,
        rules,
      }),
    ).toThrow('Um placar empatado não pode definir um vencedor.');
  });
});
