import { ConflictException } from '@nestjs/common';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
import { createAttendance } from './attendance-collection-records';

describe('createAttendance', () => {
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
