import { BadRequestException } from '@nestjs/common';
import {
  assertFeedKeyRotationAllowed,
  deriveFeedKey,
  deriveStoredFeedKey,
  hashFeedKey,
  readCalendarFeedKeyPepper,
} from './calendar-feed-keys';

describe('calendar feed keys', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('derives stable feed keys and lookup hashes from the configured pepper', () => {
    const pepper = 'test-calendar-pepper';
    const feedKey = deriveFeedKey('nonce-1', pepper);

    expect(feedKey).toBe(deriveStoredFeedKey('nonce-1', pepper));
    expect(feedKey).toBe(deriveFeedKey('nonce-1', pepper));
    expect(feedKey).not.toBe(deriveFeedKey('nonce-2', pepper));
    expect(hashFeedKey(feedKey, pepper)).toBe(hashFeedKey(feedKey, pepper));
    expect(hashFeedKey(feedKey, pepper)).not.toBe(hashFeedKey(`${feedKey}-rotated`, pepper));
  });

  it('blocks feed key rotation inside the cooldown window', () => {
    const now = new Date('2026-06-23T12:00:00.000Z');

    expect(() => assertFeedKeyRotationAllowed(new Date('2026-06-23T11:00:00.000Z'), now)).toThrow(
      BadRequestException,
    );
    expect(() => assertFeedKeyRotationAllowed(new Date('2026-06-22T11:00:00.000Z'), now)).not.toThrow();
    expect(() => assertFeedKeyRotationAllowed(null, now)).not.toThrow();
  });

  it('requires an explicit pepper in production', () => {
    process.env = {
      ...originalEnv,
      CALENDAR_FEED_KEY_PEPPER: '',
      NODE_ENV: 'production',
    };

    expect(() => readCalendarFeedKeyPepper()).toThrow('CALENDAR_FEED_KEY_PEPPER must be configured in production.');
  });
});
