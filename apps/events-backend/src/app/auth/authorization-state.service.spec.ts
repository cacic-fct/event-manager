import { AuthorizationStateService } from './authorization-state.service';

describe('AuthorizationStateService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      KEYCLOAK_POST_LOGIN_REDIRECT_URI: 'https://events.example.com/app',
      KEYCLOAK_ALLOWED_POST_LOGIN_REDIRECT_ORIGINS: 'https://admin.example.com,not a url',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('builds state with normalized allowed return paths and keeps the original OAuth state', () => {
    const service = new AuthorizationStateService();

    const state = service.build({
      redirectUri: 'https://keycloak.example.com/callback',
      returnTo: ' /admin/events ',
      state: 'provider-state',
    });

    expect(state).toBeDefined();
    expect(service.getAuthorizationRedirectUri(state)).toBe('https://keycloak.example.com/callback');
    expect(service.getPostLoginRedirectUri(state)).toBe('/admin/events');
  });

  it('allows absolute return URLs only for configured origins and app paths', () => {
    const service = new AuthorizationStateService();

    const allowedState = service.build({
      returnTo: 'https://admin.example.com/admin/certificates?tab=pending',
    });
    const wrongPathState = service.build({
      returnTo: 'https://admin.example.com/profile',
    });
    const wrongOriginState = service.build({
      returnTo: 'https://evil.example.com/admin/events',
    });

    expect(service.getPostLoginRedirectUri(allowedState)).toBe(
      'https://admin.example.com/admin/certificates?tab=pending',
    );
    expect(service.getPostLoginRedirectUri(wrongPathState)).toBe('https://events.example.com/app');
    expect(service.getPostLoginRedirectUri(wrongOriginState)).toBe('https://events.example.com/app');
  });

  it('rejects protocol-relative and malformed return targets', () => {
    const service = new AuthorizationStateService();

    expect(service.build({ returnTo: '//evil.example.com/admin/events' })).toBeUndefined();
    expect(service.build({ returnTo: 'not a url' })).toBeUndefined();
    expect(service.getPostLoginRedirectUri('not-valid-base64url')).toBe('https://events.example.com/app');
  });

  it('returns undefined when there is no useful state to persist', () => {
    const service = new AuthorizationStateService();

    expect(service.build()).toBeUndefined();
    expect(service.build({ returnTo: '/unknown' })).toBeUndefined();
    expect(service.getAuthorizationRedirectUri()).toBeUndefined();
  });
});
