import { validateBackendEnvironment } from './environment.validation';

describe('validateBackendEnvironment', () => {
  it('requires production-only backend secrets and integration settings', () => {
    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
      }),
    ).toThrow(
      [
        'PUBLIC_APP_ORIGIN is required.',
        'KEYCLOAK_REALM_URL is required.',
        'KEYCLOAK_CLIENT_ID is required.',
        'KEYCLOAK_CLIENT_SECRET is required.',
        'KEYCLOAK_REDIRECT_URI is required.',
        'KEYCLOAK_POST_LOGIN_REDIRECT_URI is required.',
        'KEYCLOAK_POST_LOGOUT_REDIRECT_URI is required.',
        'KEYCLOAK_M2M_CLIENT_ID is required.',
        'KEYCLOAK_M2M_CLIENT_SECRET is required.',
        'KEYCLOAK_M2M_AUDIENCE is required.',
        'KEYCLOAK_M2M_ALLOWED_CLIENTS is required.',
        'ACCOUNT_MANAGER_M2M_AUDIENCE is required.',
        'CALENDAR_FEED_KEY_PEPPER is required.',
        'TURNSTILE_SECRET_KEY is required.',
      ].join('\n- '),
    );
  });

  it('requires feature-specific settings only when the feature is enabled', () => {
    expect(() =>
      validateBackendEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        TYPESENSE_ENABLED: 'true',
        TYPESENSE_URL: 'postgresql://typesense.example.com',
        TURNSTILE_ENABLED: 'true',
        NOVU_SECURE_MODE_ENABLED: 'true',
      }),
    ).toThrow(
      [
        'TYPESENSE_API_KEY is required.',
        'TYPESENSE_URL must use http or https.',
        'TURNSTILE_SECRET_KEY is required.',
        'NOVU_SECRET_KEY is required.',
        'NOVU_APPLICATION_IDENTIFIER is required.',
      ].join('\n- '),
    );
  });

  it('rejects partial Novu configuration when secure mode is not enabled', () => {
    expect(() =>
      validateBackendEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        NOVU_SECRET_KEY: 'secret',
      }),
    ).toThrow(
      'NOVU_SECURE_MODE_ENABLED must be true when NOVU_SECRET_KEY or NOVU_APPLICATION_IDENTIFIER is set.',
    );

    expect(() =>
      validateBackendEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        NOVU_APPLICATION_IDENTIFIER: 'app-1',
      }),
    ).toThrow(
      'NOVU_SECURE_MODE_ENABLED must be true when NOVU_SECRET_KEY or NOVU_APPLICATION_IDENTIFIER is set.',
    );
  });

  it('requires all S3 storage values when any S3 storage value is set', () => {
    expect(() =>
      validateBackendEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        S3_ENDPOINT: 'http://localhost:8333',
      }),
    ).toThrow('S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_NAME must be set when any S3 storage variable is set.');
  });

  it('requires the Keycloak callback URI to match the backend callback route', () => {
    expect(() =>
      validateBackendEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        KEYCLOAK_REDIRECT_URI: 'https://eventos.cacic.dev.br/api/auth/callback?extra=1',
      }),
    ).toThrow('KEYCLOAK_REDIRECT_URI must be exactly https://eventos.cacic.dev.br/api/auth/callback.');

    expect(() =>
      validateBackendEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        KEYCLOAK_REDIRECT_URI: 'https://eventos.cacic.dev.br/api/auth/other',
      }),
    ).toThrow('KEYCLOAK_REDIRECT_URI must be exactly https://eventos.cacic.dev.br/api/auth/callback.');
  });

  it('requires the Keycloak token endpoint auth method to be supported when set', () => {
    expect(() =>
      validateBackendEnvironment({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        KEYCLOAK_TOKEN_ENDPOINT_AUTH_METHOD: 'client_secret_jwt',
      }),
    ).toThrow('KEYCLOAK_TOKEN_ENDPOINT_AUTH_METHOD must be one of: client_secret_basic, client_secret_post.');

    const config = {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
      KEYCLOAK_TOKEN_ENDPOINT_AUTH_METHOD: 'client_secret_post',
    };

    expect(validateBackendEnvironment(config)).toBe(config);
  });

  it('accepts the minimal development configuration', () => {
    const config = {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
    };

    expect(validateBackendEnvironment(config)).toBe(config);
  });
});
