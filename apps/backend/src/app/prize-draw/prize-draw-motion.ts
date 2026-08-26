import { PrizeDrawSpeed } from '@prisma/client';

export type PrizeDrawAnimationTiming = {
  countdownMs: number;
  reelDurationMs: number;
  preRevealPauseMs: number;
};

export function computePrizeDrawAnimationTiming(
  speed: PrizeDrawSpeed,
  repeatedSpinIndex: number,
  reducedMotion: boolean,
  countdownSeconds: number | null,
): PrizeDrawAnimationTiming {
  if (speed === PrizeDrawSpeed.INSTANT) {
    return { countdownMs: 0, reelDurationMs: 0, preRevealPauseMs: 0 };
  }
  if (reducedMotion) {
    return { countdownMs: 0, reelDurationMs: 700, preRevealPauseMs: 150 };
  }
  const decay = Math.exp(-0.24 * Math.max(0, repeatedSpinIndex));
  if (speed === PrizeDrawSpeed.QUICK) {
    return {
      countdownMs: 0,
      reelDurationMs: Math.max(1100, Math.round(2500 * decay)),
      preRevealPauseMs: Math.max(120, Math.round(180 * Math.max(decay, 0.68))),
    };
  }
  return {
    countdownMs: (countdownSeconds ?? 3) * 1000,
    reelDurationMs: Math.max(2400, Math.round(6000 * decay)),
    preRevealPauseMs: Math.max(450, Math.round(650 * Math.max(decay, 0.72))),
  };
}
