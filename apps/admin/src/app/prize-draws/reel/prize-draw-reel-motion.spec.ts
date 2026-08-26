import {
  concealedPrizeDrawWinnerIndex,
  prizeDrawReelMotionStage,
  prizeDrawReelPlannedTickCount,
  prizeDrawReelSoundCadence,
  prizeDrawReelTickIntervalMs,
} from './prize-draw-reel-motion';

describe('prize draw reel motion', () => {
  it('accelerates through explicit steps before reaching full speed', () => {
    const quickIntervals = [0.02, 0.14, 0.3, 0.5].map((progress) => prizeDrawReelTickIntervalMs('QUICK', progress));
    const dramaticIntervals = [0.02, 0.14, 0.3, 0.5].map((progress) =>
      prizeDrawReelTickIntervalMs('DRAMATIC', progress),
    );

    expect(quickIntervals).toEqual([120, 82, 48, 24]);
    expect(dramaticIntervals).toEqual([170, 108, 62, 28]);
  });

  it('gives dramatic mode a noticeably longer final slowdown', () => {
    expect(prizeDrawReelMotionStage('QUICK', 0.87)).toBe('settling');
    expect(prizeDrawReelMotionStage('DRAMATIC', 0.85)).toBe('settling');
    expect(prizeDrawReelMotionStage('DRAMATIC', 0.95)).toBe('settling');
    expect(prizeDrawReelTickIntervalMs('DRAMATIC', 0.95)).toBe(420);
    expect(prizeDrawReelTickIntervalMs('QUICK', 0.95)).toBe(260);
  });

  it('keeps fast ticks distinct while sounding every slow tick', () => {
    expect(prizeDrawReelSoundCadence('DRAMATIC', 0.5)).toBe(3);
    expect(prizeDrawReelSoundCadence('DRAMATIC', 0.9)).toBe(1);
  });

  it('chooses a non-winner index for concealed states when possible', () => {
    expect(concealedPrizeDrawWinnerIndex(8, 3)).not.toBe(3);
    expect(concealedPrizeDrawWinnerIndex(1, 0)).toBe(0);
  });

  it('plans enough ticks to land on the selected winner without a final jump', () => {
    const namesLength = 37;
    const winnerIndex = 19;
    const ticks = prizeDrawReelPlannedTickCount('DRAMATIC', 6000);
    const startingIndex = (((winnerIndex - ticks) % namesLength) + namesLength) % namesLength;
    expect((startingIndex + ticks) % namesLength).toBe(winnerIndex);
    expect(ticks).toBeGreaterThan(20);
  });
});
