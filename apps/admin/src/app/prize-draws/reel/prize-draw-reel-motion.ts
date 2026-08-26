import { PrizeDrawSpeed } from '@cacic-fct/event-manager-admin-contracts';

export type PrizeDrawReelMotionStage =
  | 'idle'
  | 'warmup'
  | 'accelerating-one'
  | 'accelerating-two'
  | 'fast'
  | 'readable'
  | 'slow'
  | 'settling';

export function prizeDrawReelMotionStage(speed: PrizeDrawSpeed, progress: number): PrizeDrawReelMotionStage {
  const normalized = Math.min(Math.max(progress, 0), 1);
  if (normalized < 0.1) return 'warmup';
  if (normalized < 0.22) return 'accelerating-one';
  if (normalized < 0.38) return 'accelerating-two';
  if (normalized < (speed === 'DRAMATIC' ? 0.56 : 0.64)) return 'fast';
  if (normalized < (speed === 'DRAMATIC' ? 0.7 : 0.75)) return 'readable';
  if (normalized < (speed === 'DRAMATIC' ? 0.84 : 0.86)) return 'slow';
  return 'settling';
}

export function prizeDrawReelTickIntervalMs(speed: PrizeDrawSpeed, progress: number): number {
  const stage = prizeDrawReelMotionStage(speed, progress);
  if (speed === 'DRAMATIC') {
    return {
      idle: 170,
      warmup: 170,
      'accelerating-one': 108,
      'accelerating-two': 62,
      fast: 28,
      readable: 76,
      slow: 158,
      settling: 420,
    }[stage];
  }
  return {
    idle: 120,
    warmup: 120,
    'accelerating-one': 82,
    'accelerating-two': 48,
    fast: 24,
    readable: 52,
    slow: 108,
    settling: 260,
  }[stage];
}

export function prizeDrawReelSoundCadence(speed: PrizeDrawSpeed, progress: number): number {
  const stage = prizeDrawReelMotionStage(speed, progress);
  if (stage === 'fast' || stage === 'accelerating-two') return 3;
  if (stage === 'accelerating-one') return 2;
  return 1;
}

export function concealedPrizeDrawWinnerIndex(namesLength: number, winnerIndex: number): number {
  if (namesLength <= 1) return 0;
  const normalizedWinner = ((winnerIndex % namesLength) + namesLength) % namesLength;
  return (normalizedWinner + Math.max(1, Math.floor(namesLength / 2))) % namesLength;
}

export function prizeDrawReelPlannedTickCount(speed: PrizeDrawSpeed, durationMs: number): number {
  if (durationMs <= 0) return 0;
  let elapsed = 0;
  let ticks = 0;
  const lastTickAt = durationMs * 0.985;
  while (elapsed < lastTickAt && ticks < 10_000) {
    ticks += 1;
    elapsed += prizeDrawReelTickIntervalMs(speed, elapsed / durationMs);
  }
  return ticks;
}
