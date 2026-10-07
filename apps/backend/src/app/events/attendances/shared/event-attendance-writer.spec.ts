import { AttendanceCategory, AttendanceCreationMethod, EventAttendanceStatus, Prisma } from '@prisma/client';
import { createOrRestoreEventAttendance, upsertPresentEventAttendance } from './event-attendance-writer';

describe('event attendance writer', () => {
  const attendanceCategories = {
    refreshForAttendance: jest.fn(),
  };
  const tx = {
    eventAttendance: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it.each([AttendanceCategory.REGULAR, AttendanceCategory.NON_REGULAR])(
    'returns the refreshed %s category when re-scanning non-regular attendance without rewriting provenance',
    async (category) => {
      const original = {
        personId: 'person-1',
        eventId: 'event-1',
        status: EventAttendanceStatus.PRESENT,
        category: AttendanceCategory.NON_REGULAR,
        attendedAt: new Date(Date.now() - 60_000),
        createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        createdById: 'original-collector',
        committedById: 'original-uploader',
      };
      const refreshed = { ...original, category };
      const afterWrite = jest.fn();
      tx.eventAttendance.findUnique.mockResolvedValue(original);
      tx.eventAttendance.findUniqueOrThrow.mockResolvedValue(refreshed);

      await expect(
        createOrRestoreEventAttendance({
          tx: tx as never,
          attendanceCategories,
          input: {
            personId: original.personId,
            eventId: original.eventId,
            createdByMethod: AttendanceCreationMethod.SCANNER,
            createdById: 'new-collector',
          },
          refreshNonRegular: true,
          afterWrite,
        }),
      ).resolves.toEqual(refreshed);

      expect(attendanceCategories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', tx, true);
      expect(attendanceCategories.refreshForAttendance.mock.invocationCallOrder[0]).toBeLessThan(
        tx.eventAttendance.findUniqueOrThrow.mock.invocationCallOrder[0],
      );
      expect(tx.eventAttendance.create).not.toHaveBeenCalled();
      expect(tx.eventAttendance.update).not.toHaveBeenCalled();
      expect(afterWrite).not.toHaveBeenCalled();
    },
  );

  it.each([
    [AttendanceCategory.REGULAR, true],
    [AttendanceCategory.NON_REGULAR, false],
  ])('preserves duplicate conflicts for category %s with refresh enabled: %s', async (category, refreshNonRegular) => {
    tx.eventAttendance.findUnique.mockResolvedValue({ status: EventAttendanceStatus.PRESENT, category });
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    tx.eventAttendance.create.mockRejectedValue(duplicate);

    await expect(
      createOrRestoreEventAttendance({
        tx: tx as never,
        attendanceCategories,
        input: {
          personId: 'person-1',
          eventId: 'event-1',
          createdByMethod: AttendanceCreationMethod.SCANNER,
        },
        refreshNonRegular,
      }),
    ).rejects.toBe(duplicate);
    expect(attendanceCategories.refreshForAttendance).not.toHaveBeenCalled();
  });

  it('restores an absent attendance and refreshes its category in the supplied transaction', async () => {
    const restored = { personId: 'person-1', eventId: 'event-1', status: EventAttendanceStatus.PRESENT };
    const afterWrite = jest.fn();
    tx.eventAttendance.findUnique.mockResolvedValue({ status: EventAttendanceStatus.ABSENT });
    tx.eventAttendance.update.mockResolvedValue(restored);
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue(restored);

    await expect(
      createOrRestoreEventAttendance({
        tx: tx as never,
        attendanceCategories,
        input: {
          personId: 'person-1',
          eventId: 'event-1',
          attendedAt: new Date('2026-08-11T12:00:00.000Z'),
          createdByMethod: AttendanceCreationMethod.SCANNER,
          createdById: 'user-1',
          committedById: 'user-1',
          location: { latitude: -22.12, longitude: -51.4, accuracyMeters: 10 },
        },
        afterWrite,
      }),
    ).resolves.toBe(restored);

    expect(tx.eventAttendance.update).toHaveBeenCalledWith({
      where: { personId_eventId: { personId: 'person-1', eventId: 'event-1' } },
      data: expect.objectContaining({
        status: EventAttendanceStatus.PRESENT,
        createdByMethod: AttendanceCreationMethod.SCANNER,
        createdById: 'user-1',
        committedById: 'user-1',
        collectedLatitude: -22.12,
        collectedLongitude: -51.4,
        collectedAccuracyMeters: 10,
      }),
    });
    expect(attendanceCategories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', tx, true);
    expect(afterWrite).toHaveBeenCalledWith(restored, tx);
  });

  it('reloads a newly created attendance after category refresh', async () => {
    const created = { personId: 'person-1', eventId: 'event-1', category: 'GENERAL' };
    tx.eventAttendance.findUnique.mockResolvedValue(null);
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue(created);

    await expect(
      createOrRestoreEventAttendance({
        tx: tx as never,
        attendanceCategories,
        input: {
          personId: 'person-1',
          eventId: 'event-1',
          createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        },
      }),
    ).resolves.toBe(created);

    expect(tx.eventAttendance.create).toHaveBeenCalledTimes(1);
    expect(attendanceCategories.refreshForAttendance.mock.invocationCallOrder[0]).toBeLessThan(
      tx.eventAttendance.findUniqueOrThrow.mock.invocationCallOrder[0],
    );
  });

  it('upserts present attendance with user provenance while preserving original creation metadata on update', async () => {
    const stored = { personId: 'person-1', eventId: 'event-1', status: EventAttendanceStatus.PRESENT };
    const attendedAt = new Date('2026-08-11T13:00:00.000Z');
    tx.eventAttendance.upsert.mockResolvedValue(stored);
    tx.eventAttendance.findUniqueOrThrow.mockResolvedValue(stored);

    await expect(
      upsertPresentEventAttendance({
        tx: tx as never,
        attendanceCategories,
        input: {
          personId: 'person-1',
          eventId: 'event-1',
          attendedAt,
          createdByMethod: AttendanceCreationMethod.SCANNER,
          createdById: 'authenticated-user-1',
          committedById: 'authenticated-user-1',
        },
      }),
    ).resolves.toBe(stored);

    expect(tx.eventAttendance.upsert).toHaveBeenCalledWith({
      where: { personId_eventId: { personId: 'person-1', eventId: 'event-1' } },
      create: {
        personId: 'person-1',
        eventId: 'event-1',
        attendedAt,
        status: EventAttendanceStatus.PRESENT,
        createdByMethod: AttendanceCreationMethod.SCANNER,
        createdById: 'authenticated-user-1',
        committedById: 'authenticated-user-1',
      },
      update: {
        attendedAt,
        status: EventAttendanceStatus.PRESENT,
        committedById: 'authenticated-user-1',
      },
    });
  });
});
