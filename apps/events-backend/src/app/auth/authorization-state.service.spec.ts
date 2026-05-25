import { AuthorizationStateService } from './authorization-state.service';

describe('AuthorizationStateService', () => {
  const originalEnv = process.env;
  let redis: {
    set: jest.Mock;
    eval: jest.Mock;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      KEYCLOAK_POST_LOGIN_REDIRECT_URI: 'https://events.example.com/app',
      KEYCLOAK_ALLOWED_POST_LOGIN_REDIRECT_ORIGINS: 'https://admin.example.com,not a url',
    };
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('stores state with normalized allowed return paths and reads it once', async () => {
    const service = new AuthorizationStateService(redis as never);

    const state = await service.create({
      redirectUri: 'https://keycloak.example.com/callback',
      returnTo: ' /admin/events ',
      state: 'provider-state',
    });
    redis.eval.mockResolvedValue(redis.set.mock.calls[0][1]);
    const consumedState = await service.consume(state);

    expect(state).toBeDefined();
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:oauth-state:/),
      JSON.stringify({
        redirectUri: 'https://keycloak.example.com/callback',
        returnTo: '/admin/events',
        state: 'provider-state',
      }),
      'EX',
      600,
      'NX',
    );
    expect(service.getAuthorizationRedirectUri(consumedState)).toBe('https://keycloak.example.com/callback');
    expect(service.getPostLoginRedirectUri(consumedState)).toBe('/admin/events');
  });

  it('allows absolute return URLs only for configured origins and app paths', async () => {
    const service = new AuthorizationStateService(redis as never);

    await service.create({
      returnTo: 'https://admin.example.com/admin/certificates?tab=pending',
    });
    await service.create({
      returnTo: 'https://admin.example.com/profile',
    });
    await service.create({
      returnTo: 'https://evil.example.com/admin/events',
    });

    expect(JSON.parse(redis.set.mock.calls[0][1])).toEqual({
      returnTo: 'https://admin.example.com/admin/certificates?tab=pending',
    });
    expect(JSON.parse(redis.set.mock.calls[1][1])).toEqual({});
    expect(JSON.parse(redis.set.mock.calls[2][1])).toEqual({});
  });

  it('rejects protocol-relative, malformed, expired, and unreadable states', async () => {
    const service = new AuthorizationStateService(redis as never);

    await service.create({ returnTo: '//evil.example.com/admin/events' });
    await service.create({ returnTo: 'not a url' });
    redis.eval.mockResolvedValueOnce(null).mockResolvedValueOnce('not-json');

    expect(JSON.parse(redis.set.mock.calls[0][1])).toEqual({});
    expect(JSON.parse(redis.set.mock.calls[1][1])).toEqual({});
    await expect(service.consume('expired-state')).resolves.toBeUndefined();
    await expect(service.consume('bad-state')).resolves.toBeUndefined();
  });

  it('creates opaque state even when there is no redirect metadata', async () => {
    const service = new AuthorizationStateService(redis as never);

    const state = await service.create();

    expect(state).toEqual(expect.any(String));
    expect(JSON.parse(redis.set.mock.calls[0][1])).toEqual({});
    expect(service.getAuthorizationRedirectUri()).toBeUndefined();
  });
});
