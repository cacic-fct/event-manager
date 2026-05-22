import { AuthSessionStoreService } from './auth-session-store.service';
import { AuthSession } from './keycloak-auth.types';

describe('AuthSessionStoreService', () => {
  const now = new Date('2026-05-21T12:00:00.000Z').getTime();

  let redis: {
    del: jest.Mock;
    eval: jest.Mock;
    exists: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
  };
  let service: AuthSessionStoreService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    redis = {
      del: jest.fn().mockResolvedValue(1),
      eval: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
      get: jest.fn(),
      set: jest.fn(),
    };
    service = new AuthSessionStoreService(redis as never);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('stores sessions with a ttl based on session expiration', async () => {
    const session = sessionFixture({ sessionExpiresAt: now + 90_000 });

    await service.set('session-1', session);

    expect(redis.set).toHaveBeenCalledWith('auth:session:session-1', JSON.stringify(session), 'EX', 90);
  });

  it('deletes sessions that are already expired instead of storing them', async () => {
    await service.set('session-1', sessionFixture({ sessionExpiresAt: now - 1 }));

    expect(redis.del).toHaveBeenCalledWith('auth:session:session-1');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('returns valid stored sessions', async () => {
    const session = sessionFixture();
    redis.get.mockResolvedValue(JSON.stringify(session));

    await expect(service.get('session-1')).resolves.toEqual(session);
  });

  it('deletes unreadable, invalid, and expired sessions', async () => {
    redis.get.mockResolvedValueOnce('{broken json');
    await expect(service.get('session-1')).resolves.toBeNull();

    redis.get.mockResolvedValueOnce(JSON.stringify({ accessToken: 123 }));
    await expect(service.get('session-2')).resolves.toBeNull();

    redis.get.mockResolvedValueOnce(JSON.stringify(sessionFixture({ sessionExpiresAt: now })));
    await expect(service.get('session-3')).resolves.toBeNull();

    expect(redis.del).toHaveBeenCalledTimes(3);
  });

  it('uses redis nx locks for refresh ownership', async () => {
    redis.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    await expect(service.acquireRefreshLock('session-1', 'worker-a')).resolves.toBe(true);
    await expect(service.acquireRefreshLock('session-1', 'worker-b')).resolves.toBe(false);

    expect(redis.set).toHaveBeenCalledWith('auth:session:session-1:refresh-lock', 'worker-a', 'PX', 5000, 'NX');

    await service.releaseRefreshLock('session-1', 'worker-a');

    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('redis.call("get", KEYS[1])'), 1, 'auth:session:session-1:refresh-lock', 'worker-a');
  });

  it('waits until a refresh lock disappears', async () => {
    redis.exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    const waitPromise = service.waitForRefreshLockRelease('session-1');
    await jest.advanceTimersByTimeAsync(50);
    await waitPromise;

    expect(redis.exists).toHaveBeenCalledWith('auth:session:session-1:refresh-lock');
  });
});

function sessionFixture(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: 'access-token',
    accessTokenExpiresAt: Date.now() + 30_000,
    refreshToken: 'refresh-token',
    sessionExpiresAt: Date.now() + 120_000,
    idTokenHint: 'id-token',
    ...overrides,
  };
}
