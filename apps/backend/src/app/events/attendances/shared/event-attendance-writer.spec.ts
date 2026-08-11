import { AttendanceCreationMethod, EventAttendanceStatus } from '@prisma/client';
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
    jest.clearAllMocks();
  });

  it('restores an absent attendance and refreshes its category in the supplied transaction', async () => {
    const restored = { personId: 'person-1', eventId: 'event-1', status: EventAttendanceStatus.PRESENT };
    const afterWrite = jest.fn();
    tx.eventAttendance.findUnique.mockResolvedValue({ status: EventAttendanceStatus.ABSENT });
    tx.eventAttendance.update.mockResolvedValue(restored);

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
    expect(attendanceCategories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', tx);
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
