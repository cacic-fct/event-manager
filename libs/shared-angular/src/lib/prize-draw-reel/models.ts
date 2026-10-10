export type PrizeDrawReelSpeed = 'INSTANT' | 'QUICK' | 'DRAMATIC';

/** The subset of a spin result needed to animate the shared reel. */
export interface PrizeDrawReelResult {
  readonly winnerReelName: string;
  readonly winnerReelIndex: number;
  readonly reelNames: readonly string[];
  readonly speed: PrizeDrawReelSpeed;
  readonly countdownMs: number;
  readonly reelDurationMs: number;
  readonly preRevealPauseMs: number;
}
