export type SportsStructuralInvalidationKind =
  | 'BRACKET_GENERATED'
  | 'SWISS_ROUND_GENERATED'
  | 'BRACKET_ADVANCEMENT'
  | 'STRUCTURAL_BYE_ADVANCED'
  | 'DRAW_REPLAY_CREATED'
  | 'GRAND_FINAL_RESET_ACTIVATED'
  | 'GRAND_FINAL_RESET_CANCELED'
  | 'GROUP_QUALIFIERS_ASSIGNED';

export interface SportsStructuralInvalidation {
  kind: SportsStructuralInvalidationKind;
  tournamentId: string;
  categoryId: string;
  stageIds: string[];
  matchIds: string[];
  publicMatchIds: string[];
}

export function mergeSportsStructuralInvalidations(
  ...groups: Array<
    readonly SportsStructuralInvalidation[] | null | undefined
  >
): SportsStructuralInvalidation[] {
  const merged = new Map<string, SportsStructuralInvalidation>();
  for (const invalidation of groups.flatMap((group) => group ?? [])) {
    const key = [
      invalidation.kind,
      invalidation.tournamentId,
      invalidation.categoryId,
    ].join(':');
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        ...invalidation,
        stageIds: unique(invalidation.stageIds),
        matchIds: unique(invalidation.matchIds),
        publicMatchIds: unique(invalidation.publicMatchIds),
      });
      continue;
    }
    current.stageIds = unique([...current.stageIds, ...invalidation.stageIds]);
    current.matchIds = unique([...current.matchIds, ...invalidation.matchIds]);
    current.publicMatchIds = unique([
      ...current.publicMatchIds,
      ...invalidation.publicMatchIds,
    ]);
  }
  return [...merged.values()];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
