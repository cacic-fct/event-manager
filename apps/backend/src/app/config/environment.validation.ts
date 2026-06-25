type Environment = Record<string, unknown>;

const REQUIRED_ALWAYS = ['DATABASE_URL'] as const;

const REQUIRED_IN_PRODUCTION = [
  'PUBLIC_APP_ORIGIN',
  'KEYCLOAK_CLIENT_SECRET',
  'KEYCLOAK_POST_LOGIN_REDIRECT_URI',
  'KEYCLOAK_M2M_CLIENT_ID',
  'KEYCLOAK_M2M_CLIENT_SECRET',
  'KEYCLOAK_M2M_AUDIENCE',
  'KEYCLOAK_M2M_ALLOWED_CLIENTS',
  'ACCOUNT_MANAGER_M2M_AUDIENCE',
  'CALENDAR_FEED_KEY_PEPPER',
  'TURNSTILE_SECRET_KEY',
] as const;

const S3_STORAGE_KEYS = ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET_NAME'] as const;

export function validateBackendEnvironment(config: Environment): Environment {
  const errors: string[] = [];
  const production = readString(config, 'NODE_ENV') === 'production';

  requireKeys(config, REQUIRED_ALWAYS, errors);

  if (production) {
    requireKeys(config, REQUIRED_IN_PRODUCTION, errors);
  }

  if (isEnabled(config, 'TYPESENSE_ENABLED')) {
    requireKeys(config, ['TYPESENSE_URL', 'TYPESENSE_API_KEY'], errors);
    requireHttpUrl(config, 'TYPESENSE_URL', errors);
  }

  if (isEnabled(config, 'TURNSTILE_ENABLED')) {
    requireKeys(config, ['TURNSTILE_SECRET_KEY'], errors);
  }

  if (isEnabled(config, 'NOVU_SECURE_MODE_ENABLED')) {
    requireKeys(config, ['NOVU_SECRET_KEY', 'NOVU_APPLICATION_IDENTIFIER'], errors);
  }

  validateCompleteGroup(config, S3_STORAGE_KEYS, errors);

  requireHttpUrl(config, 'PUBLIC_APP_ORIGIN', errors);
  requireHttpUrl(config, 'BACKEND_URL', errors);
  requireHttpUrl(config, 'KEYCLOAK_REALM_URL', errors);
  requireHttpUrl(config, 'KEYCLOAK_REDIRECT_URI', errors);
  requireHttpUrl(config, 'KEYCLOAK_POST_LOGIN_REDIRECT_URI', errors);
  requireHttpUrl(config, 'KEYCLOAK_POST_LOGOUT_REDIRECT_URI', errors);
  requireHttpUrl(config, 'ACCOUNT_MANAGER_API_URL', errors);
  requireHttpUrl(config, 'NOVU_API_URL', errors);
  requireHttpUrl(config, 'NOVU_CLIENT_API_URL', errors);
  requireHttpUrl(config, 'NOVU_CLIENT_SOCKET_URL', errors);
  requireHttpUrl(config, 'TURNSTILE_SITEVERIFY_URL', errors);
  requireHttpUrl(config, 'S3_ENDPOINT', errors);

  if (errors.length > 0) {
    throw new Error(`Invalid backend environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return config;
}

function requireKeys(config: Environment, keys: readonly string[], errors: string[]): void {
  for (const key of keys) {
    if (!readString(config, key)) {
      errors.push(`${key} is required.`);
    }
  }
}

function validateCompleteGroup(config: Environment, keys: readonly string[], errors: string[]): void {
  const configuredKeys = keys.filter((key) => readString(config, key));
  if (configuredKeys.length === 0 || configuredKeys.length === keys.length) {
    return;
  }

  const missingKeys = keys.filter((key) => !readString(config, key));
  errors.push(`${missingKeys.join(', ')} must be set when any S3 storage variable is set.`);
}

function requireHttpUrl(config: Environment, key: string, errors: string[]): void {
  const value = readString(config, key);
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      errors.push(`${key} must use http or https.`);
    }
  } catch {
    errors.push(`${key} must be a valid URL.`);
  }
}

function isEnabled(config: Environment, key: string): boolean {
  return readString(config, key)?.toLowerCase() === 'true';
}

function readString(config: Environment, key: string): string | undefined {
  const value = config[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
