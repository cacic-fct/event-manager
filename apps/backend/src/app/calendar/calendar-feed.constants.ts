import { Permission } from '@cacic-fct/shared-permissions';

export const CALENDAR_FEED_KEY_NONCE_BYTES = 32;
export const CALENDAR_FEED_KEY_ROTATION_COOLDOWN_HOURS = 24;
export const PRIVATE_FEED_LAST_FETCH_WRITE_INTERVAL_HOURS = 6;
export const PRIVATE_FEED_EVENT_TAKE = 600;
export const ADMIN_FEED_ITEM_TAKE = 600;
export const ADMIN_EVENT_GROUP_RANGE_EVENT_TAKE = 1000;
export const PUBLIC_EVENT_GROUP_RANGE_EVENT_TAKE = 1000;
export const PUBLIC_EVENT_GROUP_RANGE_EVENT_QUERY_TAKE = PUBLIC_EVENT_GROUP_RANGE_EVENT_TAKE + 1;
export const ADMIN_FEED_ACCESS_CHECK_MAX_AGE_HOURS = 24;

export const ADMIN_CALENDAR_EVENT_PERMISSIONS = [Permission.Event.Read] as const satisfies readonly Permission[];

export const ADMIN_CALENDAR_EVENT_GROUP_PERMISSIONS = [
  Permission.EventGroup.Read,
] as const satisfies readonly Permission[];

export const ADMIN_CALENDAR_MAJOR_EVENT_PERMISSIONS = [
  Permission.MajorEvent.Read,
] as const satisfies readonly Permission[];

export const ADMIN_CALENDAR_FEED_PERMISSIONS = [
  ...ADMIN_CALENDAR_EVENT_PERMISSIONS,
  ...ADMIN_CALENDAR_EVENT_GROUP_PERMISSIONS,
  ...ADMIN_CALENDAR_MAJOR_EVENT_PERMISSIONS,
] as const satisfies readonly Permission[];

export const ADMIN_CALENDAR_EVENT_PERMISSION_SET = new Set<string>(ADMIN_CALENDAR_EVENT_PERMISSIONS);
export const ADMIN_CALENDAR_EVENT_GROUP_PERMISSION_SET = new Set<string>(ADMIN_CALENDAR_EVENT_GROUP_PERMISSIONS);
export const ADMIN_CALENDAR_MAJOR_EVENT_PERMISSION_SET = new Set<string>(ADMIN_CALENDAR_MAJOR_EVENT_PERMISSIONS);
