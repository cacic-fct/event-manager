import { resolvePrizeDrawConfettiDensity } from './prize-draw-confetti-density';

describe('resolvePrizeDrawConfettiDensity', () => {
  it('keeps ordinary bursts randomized without becoming sparse', () => {
    expect(resolvePrizeDrawConfettiDensity(60, () => 0.5)).toEqual({
      particleCount: 60,
      easterEgg: false,
    });
    expect(resolvePrizeDrawConfettiDensity(12, () => 0.5).particleCount).toBeGreaterThanOrEqual(48);
  });

  it('very rarely enables the intentionally excessive easter egg', () => {
    const values = [0, 0.5];
    expect(resolvePrizeDrawConfettiDensity(110, () => values.shift() ?? 0.5)).toEqual({
      particleCount: 1020,
      easterEgg: true,
    });
  });

  it('allows Storybook to force the easter egg with an explicit high density', () => {
    expect(resolvePrizeDrawConfettiDensity(1000, () => 0).easterEgg).toBe(true);
  });
});
