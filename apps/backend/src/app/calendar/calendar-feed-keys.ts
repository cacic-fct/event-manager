import { BadRequestException } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { subHours } from 'date-fns';
import {
  CALENDAR_FEED_KEY_NONCE_BYTES,
  CALENDAR_FEED_KEY_ROTATION_COOLDOWN_HOURS,
} from './calendar-feed.constants';

export function assertFeedKeyRotationAllowed(rotatedAt: Date | null, now: Date): void {
  if (rotatedAt && rotatedAt > subHours(now, CALENDAR_FEED_KEY_ROTATION_COOLDOWN_HOURS)) {
    throw new BadRequestException('A chave do feed só pode ser rotacionada uma vez a cada 24 horas.');
  }
}

export function generateFeedKeyNonce(): string {
  return randomBytes(CALENDAR_FEED_KEY_NONCE_BYTES).toString('base64url');
}

export function deriveStoredFeedKey(
  feedKeyNonce: string | null | undefined,
  calendarFeedKeyPepper: string,
): string | undefined {
  return feedKeyNonce ? deriveFeedKey(feedKeyNonce, calendarFeedKeyPepper) : undefined;
}

export function deriveFeedKey(feedKeyNonce: string, calendarFeedKeyPepper: string): string {
  return createHmac('sha512', calendarFeedKeyPepper)
    .update('calendar-feed-url-key', 'utf8')
    .update(feedKeyNonce, 'utf8')
    .digest('base64url');
}

export function hashFeedKey(feedKey: string, calendarFeedKeyPepper: string): string {
  return createHmac('sha256', calendarFeedKeyPepper).update(feedKey, 'utf8').digest('base64url');
}

export function readCalendarFeedKeyPepper(): string {
  const pepper = process.env.CALENDAR_FEED_KEY_PEPPER?.trim();
  if (pepper) {
    return pepper;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CALENDAR_FEED_KEY_PEPPER must be configured in production.');
  }

  return 'development-calendar-feed-key-pepper';
}
