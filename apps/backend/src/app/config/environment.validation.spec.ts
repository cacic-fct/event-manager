import { validateBackendEnvironment } from './environment.validation';

describe('validateBackendEnvironment', () => {
  it('requires production-only backend secrets and integration settings', () => {
    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'production',
      }),
    ).toThrow(
      [
        'DATABASE_URL is required.',
        'PUBLIC_APP_ORIGIN is required.',
        'PUBLIC_CONTENT_PREVIEW_TOKEN_SECRET is required.',
        'OFFLINE_ATTENDANCE_COLLECTOR_SECRET is required.',
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
        'ACCOUNT_MANAGER_GRPC_URL is required.',
        'ACCOUNT_MANAGER_M2M_AUDIENCE is required.',
        'CALENDAR_FEED_KEY_PEPPER is required.',
        'TURNSTILE_SECRET_KEY is required.',
        'SSE_REPLAY_CURSOR_SECRET is required.',
        'SPORTS_IDENTITY_SECRET is required.',
      ].join('\n- '),
    );
  });

  it('requires publishing settings together outside local development', () => {
    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'staging',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
      }),
    ).toThrow(
      [
        'PUBLIC_APP_ORIGIN is required.',
        'PUBLIC_CONTENT_PREVIEW_TOKEN_SECRET is required.',
        'OFFLINE_ATTENDANCE_COLLECTOR_SECRET is required.',
      ].join('\n- '),
    );
  });

  it('requires feature-specific settings only when the feature is enabled', () => {
    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'test',
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
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        NOVU_SECRET_KEY: 'secret',
      }),
    ).toThrow('NOVU_SECURE_MODE_ENABLED must be true when NOVU_SECRET_KEY or NOVU_APPLICATION_IDENTIFIER is set.');

    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        NOVU_APPLICATION_IDENTIFIER: 'app-1',
      }),
    ).toThrow('NOVU_SECURE_MODE_ENABLED must be true when NOVU_SECRET_KEY or NOVU_APPLICATION_IDENTIFIER is set.');
  });

  it('requires all S3 storage values when any S3 storage value is set', () => {
    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        S3_ENDPOINT: 'http://localhost:8333',
      }),
    ).toThrow('S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET_NAME must be set when any S3 storage variable is set.');
  });

  it('requires the Keycloak callback URI to match the backend callback route', () => {
    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        KEYCLOAK_REDIRECT_URI: 'https://eventos.cacic.com.br/api/auth/callback?extra=1',
      }),
    ).toThrow('KEYCLOAK_REDIRECT_URI must be exactly https://eventos.cacic.com.br/api/auth/callback.');

    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        KEYCLOAK_REDIRECT_URI: 'https://eventos.cacic.com.br/api/auth/other',
      }),
    ).toThrow('KEYCLOAK_REDIRECT_URI must be exactly https://eventos.cacic.com.br/api/auth/callback.');

    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        KEYCLOAK_REDIRECT_URI: 'https://eventos.cacic.com.br/api/auth/callback#fragment',
      }),
    ).toThrow('KEYCLOAK_REDIRECT_URI must be exactly https://eventos.cacic.com.br/api/auth/callback.');

    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        KEYCLOAK_REDIRECT_URI: 'not a url',
      }),
    ).toThrow('KEYCLOAK_REDIRECT_URI must be a valid URL.');

    const config = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
      KEYCLOAK_REDIRECT_URI: 'https://eventos.cacic.com.br/api/auth/callback',
    };

    expect(validateBackendEnvironment(config)).toBe(config);
  });

  it('requires the Keycloak token endpoint auth method to be supported when set', () => {
    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        KEYCLOAK_TOKEN_ENDPOINT_AUTH_METHOD: 'client_secret_jwt',
      }),
    ).toThrow('KEYCLOAK_TOKEN_ENDPOINT_AUTH_METHOD must be one of: client_secret_basic, client_secret_post.');

    const config = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
      KEYCLOAK_TOKEN_ENDPOINT_AUTH_METHOD: 'client_secret_post',
    };

    expect(validateBackendEnvironment(config)).toBe(config);
  });

  it('validates gRPC targets as host:port values with valid ports', () => {
    const config = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
      ACCOUNT_MANAGER_GRPC_URL: 'account-manager:50051',
      EVENT_MANAGER_GRPC_BIND_URL: '0.0.0.0:65535',
    };

    expect(validateBackendEnvironment(config)).toBe(config);

    expect(
      validateBackendEnvironment({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
        ACCOUNT_MANAGER_GRPC_URL: '[::1]:50051',
      }),
    ).toEqual(expect.objectContaining({ ACCOUNT_MANAGER_GRPC_URL: '[::1]:50051' }));

    expect(() =>
      validateBackendEnvironment({
        ...config,
        ACCOUNT_MANAGER_GRPC_URL: 'https://account-manager:50051/service',
      }),
    ).toThrow('ACCOUNT_MANAGER_GRPC_URL must use the host:port format without a URL scheme or path.');

    expect(() =>
      validateBackendEnvironment({
        ...config,
        EVENT_MANAGER_GRPC_BIND_URL: '0.0.0.0:65536',
      }),
    ).toThrow('EVENT_MANAGER_GRPC_BIND_URL must use the host:port format without a URL scheme or path.');
  });

  it('fails closed for missing and unknown runtime modes', () => {
    expect(() =>
      validateBackendEnvironment({ DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres' }),
    ).toThrow('NODE_ENV is required');
    expect(() =>
      validateBackendEnvironment({
        NODE_ENV: 'prod',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
      }),
    ).toThrow('NODE_ENV must be one of');
  });

  it('accepts the minimal development configuration', () => {
    const config = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/postgres',
    };

    expect(validateBackendEnvironment(config)).toBe(config);
  });
});
