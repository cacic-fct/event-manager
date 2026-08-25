import { EventAttendance } from '@cacic-fct/shared-data-types';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod, EventAttendanceStatus, Prisma } from '@prisma/client';
import { getBrazilianPhoneCandidates } from '../../common/brazilian-phone';
import { findPeopleByCanonicalIdentityDocument, identityDocumentWhere } from '../../common/person-identity';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { createOrRestoreEventAttendance } from '../../events/attendances/shared/event-attendance-writer';
import { PrismaService } from '../../prisma/prisma.service';
import { startSportsMatchCheckInFromAthleteAttendance } from '../../sports/operations/sports-match-attendance';

const MAX_LOCATION_ACCURACY_METERS = 200;

type AttendanceLocationInput = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

type CreateAttendanceInput = {
  eventId: string;
  personId: string;
  createdByMethod: AttendanceCreationMethod;
  createdById?: string;
  committedById?: string;
  attendedAt?: Date;
  location?: AttendanceLocationInput;
  status?: EventAttendanceStatus;
};

export async function createAttendance(params: {
  prisma: PrismaService;
  attendanceCategories: AttendanceCategoryService;
  input: CreateAttendanceInput;
  idempotencyKey?: string;
  afterIdempotencyLock?: (tx: Prisma.TransactionClient) => Promise<void>;
  afterCreate?: (attendance: { personId: string; eventId: string }, tx: Prisma.TransactionClient) => Promise<void>;
  afterCheckInStarted?: (attendance: { personId: string; eventId: string }) => Promise<void>;
}) {
  getRequiredAttendanceLocationData(params.input.location);
  let checkInStarted = false;
  try {
    const attendance = await params.prisma.$transaction((tx) =>
      (async () => {
        if (params.idempotencyKey && typeof tx.$executeRaw === 'function') {
          await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${params.idempotencyKey}))`);
        }
        await params.afterIdempotencyLock?.(tx);
        return createOrRestoreEventAttendance({
          tx,
          attendanceCategories: params.attendanceCategories,
          input: params.input,
          afterWrite: async (attendance, transaction) => {
            if ((params.input.status ?? EventAttendanceStatus.PRESENT) === EventAttendanceStatus.PRESENT) {
              checkInStarted =
                (await startSportsMatchCheckInFromAthleteAttendance({
                  tx: transaction,
                  eventId: attendance.eventId,
                  personId: attendance.personId,
                  updatedById: params.input.committedById ?? params.input.createdById,
                })) || checkInStarted;
            }
            await params.afterCreate?.(attendance, transaction);
          },
        });
      })(),
    );
    if (checkInStarted) {
      await params.afterCheckInStarted?.(attendance);
    }
    return attendance;
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Presença já registrada para este evento.');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new ConflictException('Registro de presença não encontrado para atualização.');
    }

    throw error;
  }
}

export async function findSinglePersonForManualInput(prisma: PrismaService, rawValue: string): Promise<{ id: string }> {
  const value = rawValue.trim();
  if (!value) {
    throw new BadRequestException('Informe e-mail, telefone ou documento.');
  }

  const digits = value.replace(/\D/g, '');
  const phoneCandidates = getBrazilianPhoneCandidates(value);
  const where: Prisma.PeopleWhereInput[] = [
    {
      email: {
        equals: value,
        mode: 'insensitive',
      },
    },
    {
      secondaryEmails: {
        has: value.toLowerCase(),
      },
    },
  ];

  if (digits) {
    where.push(identityDocumentWhere(value));
  }

  if (phoneCandidates.length > 0) {
    where.push({
      phone: {
        in: phoneCandidates,
      },
    });
  }

  const people = await prisma.people.findMany({
    where: {
      deletedAt: null,
      OR: where,
    },
    select: {
      id: true,
      mergedIntoId: true,
    },
  });
  const canonicalIdentityPeople = digits ? await findPeopleByCanonicalIdentityDocument(prisma, value) : [];

  const resolvedPersonIds = new Set(
    [...people, ...canonicalIdentityPeople].map((person) => person.mergedIntoId ?? person.id),
  );
  if (resolvedPersonIds.size > 1) {
    throw new ConflictException(
      `Pessoa tem registros duplicados no banco de dados com o dado ${value}. Tire uma captura dessa tela e envie para o administrador do sistema, para correção.`,
    );
  }

  const [personId] = resolvedPersonIds;
  if (!personId) {
    throw new NotFoundException('Nenhuma pessoa encontrada para o dado informado.');
  }

  return { id: personId };
}

export function getRequiredAttendanceLocationData(location: AttendanceLocationInput | undefined) {
  if (
    location?.latitude == null ||
    location.longitude == null ||
    location.accuracyMeters == null ||
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    !Number.isFinite(location.accuracyMeters) ||
    location.latitude < -90 ||
    location.latitude > 90 ||
    location.longitude < -180 ||
    location.longitude > 180 ||
    location.accuracyMeters < 0
  ) {
    throw new BadRequestException('Localização precisa é obrigatória para registrar presença.');
  }

  if (location.accuracyMeters > MAX_LOCATION_ACCURACY_METERS) {
    throw new BadRequestException('Ative a localização precisa para registrar presença.');
  }

  return {
    collectedLatitude: location.latitude,
    collectedLongitude: location.longitude,
    collectedAccuracyMeters: location.accuracyMeters,
  };
}

export function toEventAttendance(attendance: {
  personId: string;
  eventId: string;
  category: EventAttendance['category'];
  status: EventAttendance['status'];
  attendedAt: Date;
  createdAt: Date;
  createdById: string | null;
  committedById: string | null;
  createdByMethod: EventAttendance['createdByMethod'];
  collectedLatitude: number | null;
  collectedLongitude: number | null;
  collectedAccuracyMeters: number | null;
}): EventAttendance {
  return {
    ...attendance,
    createdById: attendance.createdById ?? undefined,
    committedById: attendance.committedById ?? undefined,
    collectedLatitude: attendance.collectedLatitude ?? undefined,
    collectedLongitude: attendance.collectedLongitude ?? undefined,
    collectedAccuracyMeters: attendance.collectedAccuracyMeters ?? undefined,
  };
}
