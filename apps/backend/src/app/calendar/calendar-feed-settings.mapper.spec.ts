import {
  mapAdminSettings,
  mapSettings,
  mapSuperAdminSettings,
} from './calendar-feed-settings.mapper';
import { deriveFeedKey } from './calendar-feed-keys';

describe('calendar feed settings mapper', () => {
  const pepper = 'test-calendar-pepper';
  const feedKey = deriveFeedKey('nonce-1', pepper);

  it('maps enabled user feed settings to a private feed path', () => {
    expect(
      mapSettings(
        {
          enabled: true,
          feedKeyNonce: 'nonce-1',
          feedKeyHash: 'hash-1',
          disabledAt: null,
          disabledReason: null,
          lastFetchedAt: null,
          rotatedAt: null,
          updatedAt: new Date('2026-06-23T12:00:00.000Z'),
        },
        pepper,
      ),
    ).toEqual(
      expect.objectContaining({
        enabled: true,
        feedPath: `/api/calendar/feeds/${encodeURIComponent(feedKey)}.ics`,
      }),
    );
  });

  it('does not expose stale feed paths for disabled settings', () => {
    expect(
      mapAdminSettings(
        {
          enabled: false,
          feedKeyNonce: 'nonce-1',
          feedKeyHash: 'hash-1',
          disabledAt: new Date('2026-06-23T12:00:00.000Z'),
          disabledReason: 'disabled-by-test',
          lastFetchedAt: null,
          lastCheckedAt: null,
          rotatedAt: null,
          updatedAt: new Date('2026-06-23T12:00:00.000Z'),
        },
        pepper,
      ),
    ).toEqual(
      expect.objectContaining({
        enabled: false,
        feedPath: null,
        disabledReason: 'disabled-by-test',
      }),
    );
  });

  it('maps shared super-admin settings to the shared admin feed path', () => {
    expect(
      mapSuperAdminSettings(
        {
          enabled: true,
          feedKeyNonce: 'nonce-1',
          feedKeyHash: 'hash-1',
          lastFetchedAt: null,
          rotatedAt: null,
          updatedAt: new Date('2026-06-23T12:00:00.000Z'),
        },
        pepper,
      ),
    ).toEqual(
      expect.objectContaining({
        enabled: true,
        feedPath: `/api/calendar/admin/super-admin/${encodeURIComponent(feedKey)}.ics`,
      }),
    );
  });
});
