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
});
