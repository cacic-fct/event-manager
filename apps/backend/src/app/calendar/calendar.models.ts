import { Field, ObjectType } from '@nestjs/graphql';

export const CALENDAR_FEED_DISABLED_STALE_LOGIN = 'STALE_LOGIN';
export const CALENDAR_FEED_DISABLED_BY_USER = 'USER_DISABLED';
export const ADMIN_CALENDAR_FEED_DISABLED_NO_CURRENT_TARGETS = 'NO_CURRENT_ADMIN_TARGETS';
export const ADMIN_CALENDAR_FEED_DISABLED_STALE_ACCESS = 'STALE_ADMIN_ACCESS';
export const SUPER_ADMIN_CALENDAR_FEED_ID = 'super-admin';
export const CALENDAR_FEED_MAINTENANCE_QUEUE = 'calendar-feed-maintenance';
export const DISABLE_STALE_ADMIN_CALENDAR_FEEDS_JOB = 'disable-stale-admin-calendar-feeds';

@ObjectType({
  description: 'Private calendar feed settings for the current authenticated user.',
})
export class CurrentUserCalendarFeedSettings {
  @Field(() => Boolean, {
    description: 'Whether the private calendar feed is currently enabled.',
  })
  enabled!: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      'Private feed path revealed only immediately after a key is created or rotated. The frontend turns this into an absolute URL.',
  })
  feedPath?: string | null;

  @Field(() => Date, {
    nullable: true,
    description: 'When the feed was disabled, when applicable.',
  })
  disabledAt?: Date | null;

  @Field(() => String, {
    nullable: true,
    description: 'Machine-readable reason for the latest automatic or user-triggered disable.',
  })
  disabledReason?: string | null;

  @Field(() => Date, {
    nullable: true,
    description: 'Last successful private feed fetch, sampled to avoid writing on every calendar client poll.',
  })
  lastFetchedAt?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description: 'When the private feed key was last rotated.',
  })
  rotatedAt?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description: 'Last update timestamp for these settings.',
  })
  updatedAt?: Date | null;
}

@ObjectType({
  description: 'Private administrative calendar feed settings for the current authenticated admin user.',
})
export class CurrentUserAdminCalendarFeedSettings {
  @Field(() => Boolean, {
    description: 'Whether the current admin private calendar feed is currently enabled.',
  })
  enabled!: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      'Private admin feed path revealed only immediately after a key is created or rotated. The frontend turns this into an absolute URL.',
  })
  feedPath?: string | null;

  @Field(() => Date, {
    nullable: true,
    description: 'When the feed was disabled, when applicable.',
  })
  disabledAt?: Date | null;

  @Field(() => String, {
    nullable: true,
    description: 'Machine-readable reason for the latest automatic or user-triggered disable.',
  })
  disabledReason?: string | null;

  @Field(() => Date, {
    nullable: true,
    description: 'Last successful admin feed fetch, sampled to avoid writing on every calendar client poll.',
  })
  lastFetchedAt?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description: 'Last weekly eligibility check for this feed.',
  })
  lastCheckedAt?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description: 'When the private admin feed key was last rotated.',
  })
  rotatedAt?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description: 'Last update timestamp for these settings.',
  })
  updatedAt?: Date | null;
}

@ObjectType({
  description: 'Shared super-admin administrative calendar feed settings.',
})
export class SuperAdminCalendarFeedSettings {
  @Field(() => Boolean, {
    description: 'Whether the shared super-admin feed is currently enabled.',
  })
  enabled!: boolean;

  @Field(() => String, {
    nullable: true,
    description:
      'Shared super-admin feed path revealed only immediately after a key is created or rotated. Rotating it invalidates the calendar for all super-admin users.',
  })
  feedPath?: string | null;

  @Field(() => Date, {
    nullable: true,
    description: 'Last successful super-admin feed fetch, sampled to avoid writing on every calendar client poll.',
  })
  lastFetchedAt?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description: 'When the shared feed key was last rotated.',
  })
  rotatedAt?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description: 'Last update timestamp for these settings.',
  })
  updatedAt?: Date | null;
}

export type CalendarDownload = {
  content: string;
  fileName: string;
};
