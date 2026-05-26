import { BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import {
  countReceiptEventsByCategory,
  getActorId,
  getScheduleConflictEventIds,
  normalizeRejectionReason,
  normalizeRequestedEventIds,
  rejectionStatus,
} from './receipt-validation.utils';

describe('receipt-validation utils', () => {
  it('detects overlapping event schedules', () => {
    const conflicts = getScheduleConflictEventIds([
      {
        id: 'first',
        startDate: new Date('2026-01-01T10:00:00.000Z'),
        endDate: new Date('2026-01-01T11:00:00.000Z'),
      },
      {
        id: 'second',
        startDate: new Date('2026-01-01T10:30:00.000Z'),
        endDate: new Date('2026-01-01T12:00:00.000Z'),
      },
      {
        id: 'third',
        startDate: new Date('2026-01-01T12:00:00.000Z'),
        endDate: new Date('2026-01-01T13:00:00.000Z'),
      },
    ]);

    expect(conflicts).toEqual(new Set(['first', 'second']));
  });

  it('maps rejection codes to statuses', () => {
    expect(rejectionStatus('INVALID_RECEIPT')).toBe(SubscriptionStatus.REJECTED_INVALID_RECEIPT);
    expect(rejectionStatus('NO_SLOTS')).toBe(SubscriptionStatus.REJECTED_NO_SLOTS);
    expect(rejectionStatus('SCHEDULE_CONFLICT')).toBe(SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT);
    expect(rejectionStatus('GENERIC')).toBe(SubscriptionStatus.REJECTED_GENERIC);
  });

  it('normalizes rejection reasons, actor ids, and selected event ids', () => {
    expect(normalizeRejectionReason('  missing value  ')).toBe('missing value');
    expect(normalizeRejectionReason('   ')).toBeNull();
    expect(getActorId({ sub: 'user-id', email: 'user@example.com', token: '', permissionSet: new Set() } as never)).toBe(
      'user-id',
    );
    expect(getActorId({ email: 'user@example.com', token: '', permissionSet: new Set() } as never)).toBe(
      'user@example.com',
    );
    expect(normalizeRequestedEventIds([' first ', 'first', '', 'second'], ['first', 'second'])).toEqual([
      'first',
      'second',
    ]);
    expect(() => normalizeRequestedEventIds(['third'], ['first'])).toThrow(BadRequestException);
  });

  it('counts receipt events by category', () => {
    expect(countReceiptEventsByCategory([{ type: 'MINICURSO' }, { type: 'PALESTRA' }, { type: 'MESA' }])).toEqual({
      course: 1,
      lecture: 1,
      uncategorized: 1,
    });
  });
});
