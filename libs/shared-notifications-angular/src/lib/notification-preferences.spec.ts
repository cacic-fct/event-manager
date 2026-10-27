import type { Preference } from '@novu/js';
import { describe, expect, it } from 'vitest';
import { isRequiredNotificationPreference, notificationPreferenceGroups } from './notification-preferences';

function workflowPreference(identifier: string, critical: boolean): Preference {
  return {
    level: 'template',
    workflow: { id: identifier, identifier, name: identifier, critical, severity: 'high' },
  } as unknown as Preference;
}

describe('required event notices', () => {
  it('keeps manual event notices mandatory even with stale Novu critical metadata', () => {
    const notice = workflowPreference('event-manual-notification', false);
    expect(isRequiredNotificationPreference(notice)).toBe(true);
    expect(notificationPreferenceGroups([notice])).toEqual([]);
  });

  it('honors Novu critical workflows while preserving optional event preferences', () => {
    expect(isRequiredNotificationPreference(workflowPreference('another-critical-workflow', true))).toBe(true);
    const optional = workflowPreference('certificate-available', false);
    expect(isRequiredNotificationPreference(optional)).toBe(false);
    expect(notificationPreferenceGroups([optional])[0].items[0].preference).toBe(optional);
  });
});
