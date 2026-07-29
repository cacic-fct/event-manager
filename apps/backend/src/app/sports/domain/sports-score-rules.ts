import { SportsLossReason } from '@prisma/client';
import { SportsScoreboard } from './sports-scoreboard';

export interface SportsScoreRules {
  readonly strategy: 'TOTAL' | 'SETS' | 'ROUNDS' | 'PLACEMENT' | 'CUSTOM';
  readonly allowDraw: boolean;
  readonly higherWins: boolean;
  readonly pointStep: number;
}

const DEFAULT_RULES: SportsScoreRules = {
  strategy: 'TOTAL',
  allowDraw: true,
  higherWins: true,
  pointStep: 1,
};

export function normalizeSportsScoreRules(value: unknown): SportsScoreRules {
  if (!isRecord(value)) {
    return DEFAULT_RULES;
  }
  const strategy = value['strategy'];
  const pointStep = value['pointStep'];
  return {
    strategy:
      strategy === 'TOTAL' ||
      strategy === 'SETS' ||
      strategy === 'ROUNDS' ||
      strategy === 'PLACEMENT' ||
      strategy === 'CUSTOM'
        ? strategy
        : DEFAULT_RULES.strategy,
    allowDraw:
      typeof value['allowDraw'] === 'boolean'
        ? value['allowDraw']
        : DEFAULT_RULES.allowDraw,
    higherWins:
      typeof value['higherWins'] === 'boolean'
        ? value['higherWins']
        : DEFAULT_RULES.higherWins,
    pointStep:
      typeof pointStep === 'number' &&
      Number.isFinite(pointStep) &&
      pointStep > 0
        ? pointStep
        : DEFAULT_RULES.pointStep,
  };
}

export function assertSportsScoreDeltaMatchesRules(
  amount: number,
  rules: SportsScoreRules,
): void {
  const units = Math.abs(amount) / rules.pointStep;
  if (Math.abs(units - Math.round(units)) > 1e-9) {
    throw new RangeError(
      `A alteração de placar deve respeitar o passo de ${rules.pointStep}.`,
    );
  }
}

export function assertSportsOutcomeMatchesRules(input: {
  draw: boolean;
  drawWillReschedule: boolean;
  scoreboard: SportsScoreboard;
  winnerSide: 'HOME' | 'AWAY' | null;
  lossReason: SportsLossReason | null;
  rules: SportsScoreRules;
}): void {
  if (input.draw) {
    if (!input.rules.allowDraw && !input.drawWillReschedule) {
      throw new RangeError('Esta modalidade não permite empate como resultado final.');
    }
    return;
  }
  if (
    input.lossReason !== SportsLossReason.SCORE ||
    input.winnerSide === null ||
    input.scoreboard.home === input.scoreboard.away
  ) {
    return;
  }
  const expectedWinnerSide = input.rules.higherWins
    ? input.scoreboard.home > input.scoreboard.away
      ? 'HOME'
      : 'AWAY'
    : input.scoreboard.home < input.scoreboard.away
      ? 'HOME'
      : 'AWAY';
  if (input.winnerSide !== expectedWinnerSide) {
    throw new RangeError(
      'O vencedor informado não corresponde ao placar e às regras da modalidade.',
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
