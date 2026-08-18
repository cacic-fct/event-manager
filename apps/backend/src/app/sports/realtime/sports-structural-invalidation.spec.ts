import { mergeSportsStructuralInvalidations, SportsStructuralInvalidation } from './sports-structural-invalidation';

function invalidation(overrides: Partial<SportsStructuralInvalidation> = {}): SportsStructuralInvalidation {
  return {
    kind: 'BRACKET_GENERATED',
    tournamentId: 'tournament-1',
    categoryId: 'category-1',
    stageIds: ['stage-1'],
    matchIds: ['match-1'],
    publicMatchIds: ['public-1'],
    ...overrides,
  };
}

describe('mergeSportsStructuralInvalidations', () => {
  it('ignores absent groups and removes empty and duplicate identifiers', () => {
    expect(
      mergeSportsStructuralInvalidations(null, undefined, [
        invalidation({
          stageIds: ['stage-1', '', 'stage-1'],
          matchIds: ['match-1', 'match-1'],
          publicMatchIds: ['', 'public-1'],
        }),
      ]),
    ).toEqual([invalidation()]);
  });

  it('merges invalidations with the same scope while preserving first-seen order', () => {
    expect(
      mergeSportsStructuralInvalidations(
        [invalidation()],
        [
          invalidation({ stageIds: ['stage-2'], matchIds: ['match-2'], publicMatchIds: ['public-2'] }),
          invalidation({ kind: 'BRACKET_ADVANCEMENT', stageIds: ['stage-3'] }),
        ],
      ),
    ).toEqual([
      invalidation({
        stageIds: ['stage-1', 'stage-2'],
        matchIds: ['match-1', 'match-2'],
        publicMatchIds: ['public-1', 'public-2'],
      }),
      invalidation({ kind: 'BRACKET_ADVANCEMENT', stageIds: ['stage-3'] }),
    ]);
  });

  it('keeps different tournament and category scopes separate', () => {
    expect(
      mergeSportsStructuralInvalidations([
        invalidation(),
        invalidation({ tournamentId: 'tournament-2' }),
        invalidation({ categoryId: 'category-2' }),
      ]),
    ).toHaveLength(3);
  });
});
