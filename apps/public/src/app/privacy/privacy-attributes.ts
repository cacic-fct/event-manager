import type { AuthenticatedUser } from '@cacic-fct/shared-angular';

export function readUserPrivacyFlag(user: AuthenticatedUser, key: string): boolean | undefined {
  return readBoolean(readClaimValue(user.claims, key));
}

export function isUserAnalyticsEnabled(user: AuthenticatedUser | null): boolean {
  return !user || readUserPrivacyFlag(user, 'analytics_enabled') !== false;
}

export function isUserDiagnosticsEnabled(user: AuthenticatedUser | null): boolean {
  if (!user) {
    return true;
  }

  return readUserPrivacyFlag(user, 'diagnostics_enabled') ?? true;
}

export function isUserPerformanceMonitoringEnabled(user: AuthenticatedUser | null): boolean {
  return !user || readUserPrivacyFlag(user, 'performance_monitoring_enabled') !== false;
}

function readClaimValue(claims: AuthenticatedUser['claims'] | undefined, key: string): unknown {
  if (!claims) {
    return undefined;
  }

  const directValue = claims[key];
  if (directValue !== undefined) {
    return directValue;
  }

  const attributes = claims['attributes'];
  if (isRecord(attributes)) {
    return attributes[key];
  }

  return undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  const normalizedValue = Array.isArray(value) ? value[0] : value;
  if (typeof normalizedValue === 'boolean') {
    return normalizedValue;
  }

  if (typeof normalizedValue !== 'string') {
    return undefined;
  }

  const normalizedString = normalizedValue.trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalizedString)) {
    return true;
  }
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalizedString)) {
    return false;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
