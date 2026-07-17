export function isPasswordLoginEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.NODE_ENV === 'production') {
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

  return true;
}
