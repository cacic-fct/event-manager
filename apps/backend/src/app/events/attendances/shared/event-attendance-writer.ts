import { AttendanceCategory, AttendanceCreationMethod, EventAttendanceStatus, Prisma } from '@prisma/client';
import { AttendanceCategoryService } from '../../attendance-category.service';

export type EventAttendanceLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type EventAttendanceWriteInput = {
  eventId: string;
  personId: string;
  createdByMethod: AttendanceCreationMethod;
  createdById?: string;
  committedById?: string;
  attendedAt?: Date;
  location?: EventAttendanceLocation;
  status?: EventAttendanceStatus;
};

type AttendanceCategoryWriter = Pick<AttendanceCategoryService, 'refreshForAttendance'>;

/**
 * Creates an attendance, or restores a record explicitly marked absent.
 * Scanner callers can refresh non-regular present records without changing
 * their collection metadata. Other duplicates retain their conflict response.
 */
export async function createOrRestoreEventAttendance(params: {
  tx: Prisma.TransactionClient;
  attendanceCategories: AttendanceCategoryWriter;
  input: EventAttendanceWriteInput;
  refreshNonRegular?: boolean;
  afterWrite?: (attendance: { personId: string; eventId: string }, tx: Prisma.TransactionClient) => Promise<void>;
}) {
  const { tx, attendanceCategories, input } = params;
  const locationData = toAttendanceLocationData(input.location);
  const key = {
    personId_eventId: {
      personId: input.personId,
      eventId: input.eventId,
    },
  };
  const existing = await tx.eventAttendance.findUnique({
    where: key,
    select: { status: true, category: true },
  });

  if (
    params.refreshNonRegular &&
    existing?.status === EventAttendanceStatus.PRESENT &&
    existing.category === AttendanceCategory.NON_REGULAR
  ) {
    await attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx, true, {
      attendedAt: input.attendedAt ?? new Date(),
      actorUserId: input.committedById ?? input.createdById,
    });
    return tx.eventAttendance.findUniqueOrThrow({ where: key });
  }

  if (existing?.status === EventAttendanceStatus.ABSENT) {
    await tx.eventAttendance.update({
      where: key,
      data: {
        status: input.status ?? EventAttendanceStatus.PRESENT,
        attendedAt: input.attendedAt ?? new Date(),
        createdById: input.createdById,
        committedById: input.committedById,
        createdByMethod: input.createdByMethod,
        ...locationData,
      },
    });
    await attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx, true);
    const attendance = await tx.eventAttendance.findUniqueOrThrow({ where: key });
    await params.afterWrite?.(attendance, tx);
    return attendance;
  }

  await tx.eventAttendance.create({
    data: {
      eventId: input.eventId,
      personId: input.personId,
      attendedAt: input.attendedAt,
      createdById: input.createdById,
      committedById: input.committedById,
      createdByMethod: input.createdByMethod,
      status: input.status,
      ...locationData,
    },
  });
  await attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx, true);
  const attendance = await tx.eventAttendance.findUniqueOrThrow({ where: key });
  await params.afterWrite?.(attendance, tx);
  return attendance;
}

/**
 * Idempotently marks attendance present while preserving the original creation
 * provenance on an existing record. This is suitable for replayable scanners.
 */
export async function upsertPresentEventAttendance(params: {
  tx: Prisma.TransactionClient;
  attendanceCategories: AttendanceCategoryWriter;
  input: Omit<EventAttendanceWriteInput, 'location' | 'status'>;
}) {
  const { tx, attendanceCategories, input } = params;
  const attendedAt = input.attendedAt ?? new Date();
  await tx.eventAttendance.upsert({
    where: {
      personId_eventId: {
        personId: input.personId,
        eventId: input.eventId,
      },
    },
    create: {
      personId: input.personId,
      eventId: input.eventId,
      attendedAt,
      status: EventAttendanceStatus.PRESENT,
      createdByMethod: input.createdByMethod,
      createdById: input.createdById,
      committedById: input.committedById,
    },
    update: {
      attendedAt,
      status: EventAttendanceStatus.PRESENT,
      committedById: input.committedById,
    },
  });
  await attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx, true);
  return tx.eventAttendance.findUniqueOrThrow({
    where: { personId_eventId: { personId: input.personId, eventId: input.eventId } },
  });
}

function toAttendanceLocationData(location: EventAttendanceLocation | undefined) {
  return location
    ? {
        collectedLatitude: location.latitude,
        collectedLongitude: location.longitude,
        collectedAccuracyMeters: location.accuracyMeters,
      }
    : {};
}
