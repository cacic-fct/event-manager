import { SportsReadPublicCache } from './sports-read-public.cache';
import { sportsCachedPublicMatch, sportsCachedPublicTournament } from '../testing/sports-backend.fixtures';

describe('SportsReadPublicCache', () => {
  const redis = { mget: jest.fn(), get: jest.fn(), eval: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('bypasses cache operations when Redis is unavailable', async () => {
    const cache = new SportsReadPublicCache();

    await expect(cache.getCachedPublicTournament('tournament-1')).resolves.toBeNull();
    await expect(cache.readPublicTournamentCacheVersion('tournament-1')).resolves.toBeNull();
    await expect(
      cache.cachePublicTournamentIfCurrent('tournament-1', '1', sportsCachedPublicTournament() as never),
    ).resolves.toBeUndefined();
  });

  it('returns only a current, structurally valid cached tournament and rehydrates every date', async () => {
    const cached = sportsCachedPublicTournament();
    redis.mget.mockResolvedValue([JSON.stringify({ version: '7', tournament: cached }), '7']);
    const cache = new SportsReadPublicCache(redis as never);

    const result = await cache.getCachedPublicTournament('tournament-1');

    expect(result?.startDate).toBeInstanceOf(Date);
    expect(result?.endDate).toBeInstanceOf(Date);
    expect(result?.matches[0]?.schedule.startDate).toBeInstanceOf(Date);
    expect(result?.matches[0]?.timerStartedAt).toBeInstanceOf(Date);
    expect(result?.categories[0]?.brackets[0]?.matches[0]?.timerPausedAt).toBeInstanceOf(Date);
  });

  it.each([
    [null, '7'],
    ['not-json', '7'],
    [JSON.stringify({ version: 2, tournament: sportsCachedPublicTournament() }), '2'],
    [JSON.stringify({ version: '6', tournament: sportsCachedPublicTournament() }), '7'],
    [JSON.stringify({ version: '0', tournament: sportsCachedPublicTournament({ id: 'other' }) }), null],
  ])('treats missing, malformed, stale, or mismatched entries as cache misses', async (serialized, version) => {
    redis.mget.mockResolvedValue([serialized, version]);

    await expect(
      new SportsReadPublicCache(redis as never).getCachedPublicTournament('tournament-1'),
    ).resolves.toBeNull();
  });

  it('reads the version and treats a missing version as zero', async () => {
    const cache = new SportsReadPublicCache(redis as never);
    redis.get.mockResolvedValueOnce('9').mockResolvedValueOnce(null);

    await expect(cache.readPublicTournamentCacheVersion('tournament-1')).resolves.toBe('9');
    await expect(cache.readPublicTournamentCacheVersion('tournament-1')).resolves.toBe('0');
  });

  it('degrades safely when Redis reads or writes fail', async () => {
    const cache = new SportsReadPublicCache(redis as never);
    redis.mget.mockRejectedValue(new Error('read failed'));
    redis.get.mockRejectedValue(new Error('version failed'));
    redis.eval.mockRejectedValue(new Error('write failed'));

    await expect(cache.getCachedPublicTournament('tournament-1')).resolves.toBeNull();
    await expect(cache.readPublicTournamentCacheVersion('tournament-1')).resolves.toBeNull();
    await expect(
      cache.cachePublicTournamentIfCurrent('tournament-1', '3', sportsCachedPublicTournament() as never),
    ).resolves.toBeUndefined();
  });

  it('stores a version-bound snapshot atomically with the configured TTL', async () => {
    const value = sportsCachedPublicTournament();
    redis.eval.mockResolvedValue(1);
    const cache = new SportsReadPublicCache(redis as never);

    await cache.cachePublicTournamentIfCurrent('tournament-1', '3', value as never);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('SET'"),
      2,
      'sports:public-tournament:v2:tournament-1',
      'sports:public-tournament-version:v2:tournament-1',
      '3',
      JSON.stringify({ version: '3', tournament: value }),
      expect.any(String),
    );
  });

  it('does not store when no consistent version could be read', async () => {
    await new SportsReadPublicCache(redis as never).cachePublicTournamentIfCurrent(
      'tournament-1',
      null,
      sportsCachedPublicTournament() as never,
    );

    expect(redis.eval).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    sportsCachedPublicTournament({ matches: null }),
    sportsCachedPublicTournament({ categories: null }),
    sportsCachedPublicTournament({ startDate: 'invalid' }),
    sportsCachedPublicTournament({ matches: [{ schedule: null }] }),
    sportsCachedPublicTournament({
      matches: [sportsCachedPublicMatch({ schedule: { endDate: 'invalid' } })],
    }),
    sportsCachedPublicTournament({ matches: [sportsCachedPublicMatch({ timerStartedAt: 'invalid' })] }),
    sportsCachedPublicTournament({ matches: [sportsCachedPublicMatch({ timerPausedAt: 'invalid' })] }),
    sportsCachedPublicTournament({ categories: [null] }),
    sportsCachedPublicTournament({ categories: [{ matches: null, brackets: [] }] }),
    sportsCachedPublicTournament({ categories: [{ matches: [], brackets: [null] }] }),
    sportsCachedPublicTournament({ categories: [{ matches: [], brackets: [{ matches: null }] }] }),
  ])('rejects malformed cached tournament projections', (value) => {
    expect(new SportsReadPublicCache().rehydratePublicTournament(value, 'tournament-1')).toBeNull();
  });

  it('parses valid dates and rejects invalid or non-string values', () => {
    const cache = new SportsReadPublicCache();
    const date = new Date('2026-08-11T12:00:00.000Z');

    expect(cache.parseCachedDate(date)).toBe(date);
    expect(cache.parseCachedDate(new Date(Number.NaN))).toBeNull();
    expect(cache.parseCachedDate(1)).toBeNull();
    expect(cache.parseCachedDate('invalid')).toBeNull();
    expect(cache.parseCachedDate(date.toISOString())).toEqual(date);
  });
});
