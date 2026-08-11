import { SportsLossReason } from '@prisma/client';
import {
  assertSportsScoreDeltaMatchesRules,
  normalizeSportsScoreRules,
  SportsScoreRules,
} from '@cacic-fct/shared-data-types';
import { SportsScoreboard } from './sports-scoreboard';

export { assertSportsScoreDeltaMatchesRules, normalizeSportsScoreRules };
export type { SportsScoreRules };

export function assertSportsOutcomeMatchesRules(input: {
  draw: boolean;
  drawWillReschedule: boolean;
  scoreboard: SportsScoreboard;
  winnerSide: 'HOME' | 'AWAY' | null;
  lossReason: SportsLossReason | null;
  rules: SportsScoreRules;
}): void {
  if (input.draw) {
    if (input.scoreboard.home !== input.scoreboard.away) {
      throw new RangeError('Um empate exige placares iguais.');
    }
    if (!input.rules.allowDraw && !input.drawWillReschedule) {
      throw new RangeError('Esta modalidade não permite empate como resultado final.');
    }
    return;
  }
  if (input.lossReason !== SportsLossReason.SCORE || input.winnerSide === null) {
    return;
  }
  if (input.scoreboard.home === input.scoreboard.away) {
    throw new RangeError('Um placar empatado não pode definir um vencedor.');
  }
  const expectedWinnerSide = input.rules.higherWins
    ? input.scoreboard.home > input.scoreboard.away
      ? 'HOME'
      : 'AWAY'
    : input.scoreboard.home < input.scoreboard.away
      ? 'HOME'
      : 'AWAY';
  if (input.winnerSide !== expectedWinnerSide) {
    throw new RangeError('O vencedor informado não corresponde ao placar e às regras da modalidade.');
  }
}
