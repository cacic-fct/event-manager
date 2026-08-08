import { SportsLossReason } from '@prisma/client';
import {
  assertSportsOutcomeMatchesRules,
  SportsScoreRules,
} from './sports-score-rules';

const rules: SportsScoreRules = {
  strategy: 'TOTAL',
  allowDraw: true,
  higherWins: true,
  pointStep: 1,
};

describe('sports score outcome rules', () => {
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
