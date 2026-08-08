import {
  buildSportsMatches,
  buildSportsTournaments,
} from './home-sports-story.fixtures';

const dateFromNow = (days: number, hour: number) =>
  new Date(Date.UTC(2026, 6, 24 + days, hour));

describe('home sports story fixtures', () => {
  it('builds live tournament and match states together', () => {
    const args = { showActionQueue: false, sportsMode: 'live' as const };

    expect(buildSportsTournaments(args, false, dateFromNow)).toEqual([
      expect.objectContaining({ status: 'LIVE', activeMatchCount: 2 }),
    ]);
    expect(buildSportsMatches(args, false, dateFromNow)).toHaveLength(2);
  });

  it('builds review counts without live matches', () => {
    const args = { showActionQueue: true, sportsMode: 'review' as const };

    expect(buildSportsTournaments(args, false, dateFromNow)).toEqual([
      expect.objectContaining({ pendingApplicationCount: 3, pendingReviewCount: 2 }),
    ]);
    expect(buildSportsMatches(args, false, dateFromNow)).toEqual([]);
  });

  it('returns empty sports fixtures for the empty dashboard state', () => {
    const args = { showActionQueue: true, sportsMode: 'live-and-review' as const };

    expect(buildSportsTournaments(args, true, dateFromNow)).toEqual([]);
    expect(buildSportsMatches(args, true, dateFromNow)).toEqual([]);
  });
});
