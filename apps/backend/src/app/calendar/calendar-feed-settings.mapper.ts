import {
  CurrentUserAdminCalendarFeedSettings,
  CurrentUserCalendarFeedSettings,
  SuperAdminCalendarFeedSettings,
} from './calendar.models';
import {
  AdminCalendarFeedSettingsRecord,
  CalendarFeedSettingsRecord,
  SuperAdminCalendarFeedSettingsRecord,
} from './calendar-records';
import { deriveStoredFeedKey } from './calendar-feed-keys';

export function mapSettings(
  settings: CalendarFeedSettingsRecord | null,
  calendarFeedKeyPepper: string,
  feedKey?: string,
): CurrentUserCalendarFeedSettings {
  const resolvedFeedKey = feedKey ?? deriveStoredFeedKey(settings?.feedKeyNonce, calendarFeedKeyPepper);

  return {
    enabled: settings?.enabled ?? false,
    feedPath: settings?.enabled && resolvedFeedKey ? `/api/calendar/feeds/${encodeURIComponent(resolvedFeedKey)}.ics` : null,
    disabledAt: settings?.disabledAt ?? null,
    disabledReason: settings?.disabledReason ?? null,
    lastFetchedAt: settings?.lastFetchedAt ?? null,
    rotatedAt: settings?.rotatedAt ?? null,
    updatedAt: settings?.updatedAt ?? null,
  };
}

export function mapAdminSettings(
  settings: AdminCalendarFeedSettingsRecord | null,
  calendarFeedKeyPepper: string,
  feedKey?: string,
): CurrentUserAdminCalendarFeedSettings {
  const resolvedFeedKey = feedKey ?? deriveStoredFeedKey(settings?.feedKeyNonce, calendarFeedKeyPepper);

  return {
    enabled: settings?.enabled ?? false,
    feedPath:
      settings?.enabled && resolvedFeedKey ? `/api/calendar/admin/feeds/${encodeURIComponent(resolvedFeedKey)}.ics` : null,
    disabledAt: settings?.disabledAt ?? null,
    disabledReason: settings?.disabledReason ?? null,
    lastFetchedAt: settings?.lastFetchedAt ?? null,
    lastCheckedAt: settings?.lastCheckedAt ?? null,
    rotatedAt: settings?.rotatedAt ?? null,
    updatedAt: settings?.updatedAt ?? null,
  };
}

export function mapSuperAdminSettings(
  settings: SuperAdminCalendarFeedSettingsRecord | null,
  calendarFeedKeyPepper: string,
  feedKey?: string,
): SuperAdminCalendarFeedSettings {
  const resolvedFeedKey = feedKey ?? deriveStoredFeedKey(settings?.feedKeyNonce, calendarFeedKeyPepper);

  return {
    enabled: settings?.enabled ?? false,
    feedPath:
      settings?.enabled && resolvedFeedKey
        ? `/api/calendar/admin/super-admin/${encodeURIComponent(resolvedFeedKey)}.ics`
        : null,
    lastFetchedAt: settings?.lastFetchedAt ?? null,
    rotatedAt: settings?.rotatedAt ?? null,
    updatedAt: settings?.updatedAt ?? null,
  };
}
