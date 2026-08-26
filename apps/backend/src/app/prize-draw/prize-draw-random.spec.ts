import { countPrizeDrawDuplicateEntries, selectWeightedEntry } from './prize-draw-random';

describe('selectWeightedEntry', () => {
  const entries = [
    { id: 'a', weight: 1 },
    { id: 'b', weight: 3 },
    { id: 'c', weight: 2 },
  ];

  it.each([
    [0, 'a'],
    [1, 'b'],
    [3, 'b'],
    [4, 'c'],
    [5, 'c'],
  ])('maps ticket %i to entry %s', (ticket, expectedId) => {
    expect(selectWeightedEntry(entries, ticket).id).toBe(expectedId);
  });

  it('rejects tickets outside the exact weighted range', () => {
    expect(() => selectWeightedEntry(entries, 6)).toThrow(RangeError);
  });

  it.each([
    [[{ id: 'a', weight: 0 }], 0],
    [[{ id: 'a', weight: -1 }], 0],
    [entries, -1],
  ])('rejects invalid weights or tickets', (invalidEntries, ticket) => {
    expect(() => selectWeightedEntry(invalidEntries, ticket)).toThrow(RangeError);
  });
});

describe('countPrizeDrawDuplicateEntries', () => {
  it('counts additional weighted tickets and repeated free-text names separately', () => {
    expect(
      countPrizeDrawDuplicateEntries([
        { displayName: 'Ana Alves', weight: 3 },
        { displayName: 'Convidada externa', weight: 1 },
        { displayName: '  convidada   EXTERNA ', weight: 1 },
      ]),
    ).toBe(3);
  });
});
