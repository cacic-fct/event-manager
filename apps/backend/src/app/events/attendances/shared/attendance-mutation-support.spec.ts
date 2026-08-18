import { AttendanceCreationMethod, Prisma } from '@prisma/client';
import { EventAttendancesMutationSupport } from './attendance-mutation-support';

describe('EventAttendancesMutationSupport repeated attempts', () => {
  it('queues review only after the third duplicate attempt in five minutes', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '7.9.1' }),
      ),
      attendanceScanAttemptCounter: {
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 2 })
          .mockResolvedValueOnce({ count: 3 }),
      },
      attendanceReviewFlag: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const support = new TestAttendanceMutationSupport(prisma as never);

    await expect(support.create()).rejects.toThrow('Presença já registrada para este evento.');
    await expect(support.create()).rejects.toThrow('Presença já registrada para este evento.');
    expect(prisma.attendanceReviewFlag.upsert).not.toHaveBeenCalled();

    await expect(support.create()).rejects.toThrow('Presença já registrada para este evento.');
    expect(prisma.attendanceReviewFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          kind: 'REPEATED_SCAN_ATTEMPTS',
          personId: 'person-1',
          eventId: 'event-1',
        }),
      }),
    );
  });
});

class TestAttendanceMutationSupport extends EventAttendancesMutationSupport {
  constructor(prisma: never) {
    super(prisma, {} as never);
  }

  create() {
    return this.createAttendanceWithMetadata({
      eventId: 'event-1',
      personId: 'person-1',
      createdById: 'collector-1',
      committedById: 'collector-1',
      createdByMethod: AttendanceCreationMethod.SCANNER,
    });
  }
}
