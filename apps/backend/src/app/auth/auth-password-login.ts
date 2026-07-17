export function isPasswordLoginEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (!['development', 'test'].includes(environment.NODE_ENV ?? '')) {
    return false;
  }

  const configured = environment.KEYCLOAK_PASSWORD_LOGIN_ENABLED;
  if (configured !== undefined) {
    const normalized = configured.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return false;
}
