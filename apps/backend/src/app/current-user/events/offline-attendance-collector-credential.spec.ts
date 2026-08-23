import { BadRequestException } from '@nestjs/common';
import {
  issueOfflineAttendanceCollectorCredential,
  verifyOfflineAttendanceCollectorCredential,
} from './offline-attendance-collector-credential';

describe('offline attendance collector credentials', () => {
  it('binds the event and original collector identity', () => {
    const credential = issueOfflineAttendanceCollectorCredential({
      eventId: 'event-1',
      collectorPersonId: 'person-1',
      collectorUserId: 'user-1',
    });

    expect(verifyOfflineAttendanceCollectorCredential(credential)).toMatchObject({
      eventId: 'event-1',
      collectorPersonId: 'person-1',
      collectorUserId: 'user-1',
    });
  });

  it('rejects tampered or expired credentials', () => {
    const credential = issueOfflineAttendanceCollectorCredential({
      eventId: 'event-1',
      collectorPersonId: 'person-1',
      collectorUserId: 'user-1',
      issuedAt: new Date('2020-01-01T00:00:00.000Z'),
      expiresAt: new Date('2020-01-02T00:00:00.000Z'),
    });

    expect(() => verifyOfflineAttendanceCollectorCredential(credential)).toThrow(BadRequestException);
    expect(() => verifyOfflineAttendanceCollectorCredential(`${credential}x`)).toThrow(BadRequestException);
  });

  it('validates the collection timestamp so a later uploader can replay after expiry', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-05T00:00:00.000Z'));
    const issuedAt = new Date('2026-01-01T00:00:00.000Z');
    const expiresAt = new Date('2026-01-02T00:00:00.000Z');
    const credential = issueOfflineAttendanceCollectorCredential({
      eventId: 'event-1',
      collectorPersonId: 'person-1',
      collectorUserId: 'user-1',
      issuedAt,
      expiresAt,
    });

    expect(verifyOfflineAttendanceCollectorCredential(credential, new Date('2026-01-01T12:00:00.000Z'))).toMatchObject({
      collectorUserId: 'user-1',
    });
    expect(() => verifyOfflineAttendanceCollectorCredential(credential, new Date('2025-12-01T00:00:00.000Z'))).toThrow(
      BadRequestException,
    );
    jest.useRealTimers();
  });
});
