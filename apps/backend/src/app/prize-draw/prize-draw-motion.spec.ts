import { PrizeDrawSpeed } from '@prisma/client';
import { computePrizeDrawAnimationTiming } from './prize-draw-motion';

describe('computePrizeDrawAnimationTiming', () => {
  it('keeps instant draws instant', () => {
    expect(computePrizeDrawAnimationTiming(PrizeDrawSpeed.INSTANT, 20, true, 5)).toEqual({
      countdownMs: 0,
      reelDurationMs: 0,
      preRevealPauseMs: 0,
    });
  });

  it('uses the same short presentation for reduced-motion quick and dramatic draws', () => {
    expect(computePrizeDrawAnimationTiming(PrizeDrawSpeed.QUICK, 0, true, null)).toEqual(
      computePrizeDrawAnimationTiming(PrizeDrawSpeed.DRAMATIC, 0, true, 5),
    );
  });

  it('reduces repeated animation time exponentially without crossing the psychological floor', () => {
    const first = computePrizeDrawAnimationTiming(PrizeDrawSpeed.DRAMATIC, 0, false, 3);
    const third = computePrizeDrawAnimationTiming(PrizeDrawSpeed.DRAMATIC, 2, false, 3);
    const repeated = computePrizeDrawAnimationTiming(PrizeDrawSpeed.DRAMATIC, 100, false, 3);
    expect(third.reelDurationMs).toBeLessThan(first.reelDurationMs);
    expect(first.reelDurationMs).toBe(6000);
    expect(repeated.reelDurationMs).toBe(2400);
    expect(repeated.preRevealPauseMs).toBeGreaterThanOrEqual(450);
    expect(repeated.countdownMs).toBe(3000);
  });

  it('honors the configured dramatic countdown', () => {
    expect(computePrizeDrawAnimationTiming(PrizeDrawSpeed.DRAMATIC, 0, false, 5).countdownMs).toBe(5000);
  });

  it('gives the first quick draw enough time to read as a real spin', () => {
    expect(computePrizeDrawAnimationTiming(PrizeDrawSpeed.QUICK, 0, false, null)).toEqual({
      countdownMs: 0,
      reelDurationMs: 2500,
      preRevealPauseMs: 180,
    });
  });
});
