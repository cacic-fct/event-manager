export function selectWeightedEntry<T extends { weight: number }>(entries: readonly T[], ticket: number): T {
  if (!Number.isInteger(ticket) || ticket < 0) throw new RangeError('Prize draw ticket must be a non-negative integer.');
  let remaining = ticket;
  for (const entry of entries) {
    if (!Number.isInteger(entry.weight) || entry.weight < 1) throw new RangeError('Prize draw weights must be positive integers.');
    if (remaining < entry.weight) return entry;
    remaining -= entry.weight;
  }
  throw new RangeError('Prize draw ticket is outside the available weight range.');
}

export function countPrizeDrawDuplicateEntries(
  entries: readonly { displayName: string; weight: number }[],
): number {
  const normalizedNames = new Map<string, number>();
  let duplicatesFromWeights = 0;
  for (const entry of entries) {
    duplicatesFromWeights += Math.max(0, entry.weight - 1);
    const normalizedName = entry.displayName.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
    if (normalizedName) normalizedNames.set(normalizedName, (normalizedNames.get(normalizedName) ?? 0) + 1);
  }
  const duplicatesFromRepeatedFreeNames = [...normalizedNames.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );
  return duplicatesFromWeights + duplicatesFromRepeatedFreeNames;
}
