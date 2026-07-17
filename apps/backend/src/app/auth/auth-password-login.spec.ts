import { isPasswordLoginEnabled } from './auth-password-login';

describe('isPasswordLoginEnabled', () => {
  it.each([
    [{}, false],
    [{ NODE_ENV: 'production' }, false],
    [{ NODE_ENV: 'staging' }, false],
    [{ NODE_ENV: 'development' }, false],
    [{ NODE_ENV: 'development', KEYCLOAK_PASSWORD_LOGIN_ENABLED: 'true' }, true],
    [{ NODE_ENV: 'test', KEYCLOAK_PASSWORD_LOGIN_ENABLED: 'yes' }, true],
    [{ NODE_ENV: 'test', KEYCLOAK_PASSWORD_LOGIN_ENABLED: 'unknown' }, false],
  ] as const)('returns %s for %o', (environment, expected) => {
    expect(isPasswordLoginEnabled(environment)).toBe(expected);
  });
});
