import type { AuthenticatedUser } from '@cacic-fct/shared-angular';
import {
  isUserAnalyticsEnabled,
  isUserDiagnosticsEnabled,
  isUserPerformanceMonitoringEnabled,
  readUserPrivacyFlag,
} from './privacy-attributes';

describe('privacy attributes', () => {
  it('enables analytics, diagnostics, and performance monitoring by default for guests', () => {
    expect(isUserAnalyticsEnabled(null)).toBe(true);
    expect(isUserDiagnosticsEnabled(null)).toBe(true);
    expect(isUserPerformanceMonitoringEnabled(null)).toBe(true);
  });

  it('reads direct boolean-like claim values', () => {
    const user = userFixture({
      analytics_enabled: 'false',
      diagnostics_enabled: 'enabled',
      performance_monitoring_enabled: ['0'],
    });

    expect(readUserPrivacyFlag(user, 'analytics_enabled')).toBe(false);
    expect(readUserPrivacyFlag(user, 'diagnostics_enabled')).toBe(true);
    expect(readUserPrivacyFlag(user, 'performance_monitoring_enabled')).toBe(false);
    expect(isUserAnalyticsEnabled(user)).toBe(false);
    expect(isUserDiagnosticsEnabled(user)).toBe(true);
    expect(isUserPerformanceMonitoringEnabled(user)).toBe(false);
  });

  it('falls back to nested attributes when direct claims are absent', () => {
    const user = userFixture({
      attributes: {
        analytics_enabled: ['yes'],
        diagnostics_enabled: ['off'],
        performance_monitoring_enabled: true,
      },
    });

    expect(isUserAnalyticsEnabled(user)).toBe(true);
    expect(isUserDiagnosticsEnabled(user)).toBe(false);
    expect(isUserPerformanceMonitoringEnabled(user)).toBe(true);
  });

  it('keeps diagnostics enabled when a user has an unrecognized preference value', () => {
    const user = userFixture({
      diagnostics_enabled: 'sometimes',
    });

    expect(readUserPrivacyFlag(user, 'diagnostics_enabled')).toBeUndefined();
    expect(isUserDiagnosticsEnabled(user)).toBe(true);
  });
});

function userFixture(claims: Record<string, unknown>): AuthenticatedUser {
  return {
    id: 'user-1',
    username: 'ada',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    roles: [],
    scopes: [],
    permissions: [],
    claims,
  } as AuthenticatedUser;
}
