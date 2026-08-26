export type PrizeDrawConfettiDensity = {
  particleCount: number;
  easterEgg: boolean;
};

const EASTER_EGG_CHANCE = 1 / 2048;

export function resolvePrizeDrawConfettiDensity(
  requestedCount: number,
  random: () => number = Math.random,
): PrizeDrawConfettiDensity {
  const requested = Math.min(Math.max(Math.trunc(requestedCount), 48), 1200);
  const forcedEasterEgg = requested >= 900;
  const easterEgg = forcedEasterEgg || random() < EASTER_EGG_CHANCE;
  if (easterEgg) {
    const base = forcedEasterEgg ? requested : 900;
    return {
      particleCount: Math.min(1400, base + Math.floor(random() * 241)),
      easterEgg: true,
    };
  }

  const minimum = Math.max(48, Math.floor(requested * 0.8));
  const maximum = Math.min(300, Math.max(minimum, Math.ceil(requested * 1.2)));
  return {
    particleCount: minimum + Math.floor(random() * (maximum - minimum + 1)),
    easterEgg: false,
  };
}
