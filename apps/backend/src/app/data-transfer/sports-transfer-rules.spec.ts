import { BadRequestException } from '@nestjs/common';
import { assertSportsScoreRules, assertSportsTimerRules } from './sports-transfer-rules';

describe('sports transfer rule validation', () => {
  it('accepts supported timer and score values at their boundaries', () => {
    expect(() =>
      assertSportsTimerRules({
        overallEnabled: true,
        periodEnabled: false,
        allowOvertime: true,
        periodDurationMs: 24 * 60 * 60 * 1000,
        periodStartOffsetsMs: [0, 7 * 24 * 60 * 60 * 1000],
      }),
    ).not.toThrow();

    expect(() =>
      assertSportsScoreRules({
        strategy: 'CUSTOM',
        allowDraw: false,
        higherWins: true,
        pointStep: Number.MIN_VALUE,
      }),
    ).not.toThrow();
  });

  it('rejects malformed or unsafe timer rules', () => {
    const invalid: unknown[] = [
      null,
      [],
      'start-match',
      { command: 'start-match' },
      { overallEnabled: 'true' },
      { periodEnabled: 1 },
      { allowOvertime: null },
      { periodDurationMs: -1 },
      { periodDurationMs: 24 * 60 * 60 * 1000 + 1 },
      { periodDurationMs: 90_000.5 },
      { periodDurationMs: Number.MAX_SAFE_INTEGER },
      { periodStartOffsetsMs: '0' },
      { periodStartOffsetsMs: Array.from({ length: 129 }, () => 0) },
      { periodStartOffsetsMs: [-1] },
      { periodStartOffsetsMs: [7 * 24 * 60 * 60 * 1000 + 1] },
      { periodStartOffsetsMs: [1.5] },
    ];

    for (const value of invalid) {
      expect(() => assertSportsTimerRules(value)).toThrow(BadRequestException);
    }
  });

  it('rejects malformed or unsafe score rules', () => {
    const invalid: unknown[] = [
      null,
      [],
      { unexpected: true },
      { strategy: 'UNRECOGNIZED' },
      { allowDraw: 'yes' },
      { higherWins: 0 },
      { pointStep: 0 },
      { pointStep: -1 },
      { pointStep: '1' },
      { pointStep: Number.NaN },
      { pointStep: Number.POSITIVE_INFINITY },
    ];

    for (const value of invalid) {
      expect(() => assertSportsScoreRules(value)).toThrow(BadRequestException);
    }
  });
});
