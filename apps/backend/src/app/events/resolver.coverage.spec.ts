import { EventsResolver } from './resolver';

describe('EventsResolver sports-match projection boundary', () => {
  let resolver: EventsResolver;

  beforeEach(() => {
    resolver = new EventsResolver({} as never, {} as never, {} as never, {} as never, {} as never);
  });

  it('projects a linked sports match as true without querying or enriching persistence', () => {
    expect(resolver.isSportsMatch({ sportsMatch: { id: 'match-1' } })).toBe(true);
  });

  it.each([
    ['null', { sportsMatch: null }],
    ['undefined', { sportsMatch: undefined }],
    ['an empty event projection', {}],
  ])('returns false for %s and does not leak a match identity', (_label, event) => {
    expect(resolver.isSportsMatch(event as never)).toBe(false);
  });
});
