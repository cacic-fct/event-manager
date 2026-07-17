import { getAuthorizationErrorRedirectUri } from './auth-error-redirect';

describe('getAuthorizationErrorRedirectUri', () => {
  it('does not expose exception details in the redirect URL', () => {
    const uri = getAuthorizationErrorRedirectUri({
      statusCode: 500,
      message: 'database password is invalid',
      error: 'Internal Server Error',
    });

    expect(uri).not.toContain('raw=');
    expect(uri).not.toContain('database');
  });

  it('classifies every 5xx response as a server error', () => {
    const uri = getAuthorizationErrorRedirectUri({
      statusCode: 503,
      message: 'temporarily unavailable',
    });

    const url = new URL(uri, 'https://eventos.cacic.local');
    expect(url.searchParams.get('reason')).toBe('server-error');
    expect(url.searchParams.get('title')).toBe('Ocorreu um erro.');
  });
});
