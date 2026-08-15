import { ConflictException } from '@nestjs/common';
import { AttendanceCreationMethod, Prisma, SportsMatchState } from '@prisma/client';
import { createAttendance } from './attendance-collection-records';

describe('createAttendance', () => {
  it('starts a scheduled match when the collected person is an approved match athlete', async () => {
    const attendance = { personId: 'athlete-1', eventId: 'event-1', status: 'PRESENT' };
    const tx = {
      eventAttendance: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(attendance),
      },
      sportsMatch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'match-1',
          state: SportsMatchState.SCHEDULED,
          canonicalState: SportsMatchState.SCHEDULED,
          revision: 2,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      sportsMatchRosterEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: 'roster-entry-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const attendanceCategories = { refreshForAttendance: jest.fn().mockResolvedValue(undefined) };
    const afterCheckInStarted = jest.fn().mockResolvedValue(undefined);

    await expect(
      createAttendance({
        prisma: prisma as never,
        attendanceCategories: attendanceCategories as never,
        input: {
          eventId: 'event-1',
          personId: 'athlete-1',
          createdByMethod: AttendanceCreationMethod.SCANNER,
          createdById: 'collector-1',
          location: { latitude: -22.12, longitude: -51.4, accuracyMeters: 10 },
        },
        afterCheckInStarted,
      }),
    ).resolves.toBe(attendance);

    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: SportsMatchState.CHECK_IN }),
      }),
    );
    expect(afterCheckInStarted).toHaveBeenCalledWith(attendance);
  });

  it.each([
    ['P2002', 'Presença já registrada para este evento.'],
    ['P2025', 'Registro de presença não encontrado para atualização.'],
  ])('maps Prisma %s to the corresponding conflict message', async (code, message) => {
    const error = new Prisma.PrismaClientKnownRequestError('Attendance write failed', {
      code,
      clientVersion: 'test',
    });
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(error),
    };

    await expect(
      createAttendance({
        prisma: prisma as never,
        attendanceCategories: {} as never,
        input: {
          eventId: 'event-1',
          personId: 'person-1',
          createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
          location: { latitude: -22.12, longitude: -51.4, accuracyMeters: 10 },
        },
      }),
    ).rejects.toEqual(new ConflictException(message));
  });
});
