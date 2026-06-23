import { Field, ObjectType } from '@nestjs/graphql';

export const CALENDAR_FEED_DISABLED_STALE_LOGIN = 'STALE_LOGIN';
export const CALENDAR_FEED_DISABLED_BY_USER = 'USER_DISABLED';

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
    description: 'Private feed path. The frontend turns this into an absolute URL before showing it to the user.',
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

export type CalendarDownload = {
  content: string;
  fileName: string;
};
