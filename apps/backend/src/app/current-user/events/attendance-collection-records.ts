import { EventAttendance } from '@cacic-fct/shared-data-types';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { PrismaService } from '../../prisma/prisma.service';

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
};

export async function createAttendance(params: {
  prisma: PrismaService;
  attendanceCategories: AttendanceCategoryService;
  input: CreateAttendanceInput;
  afterCreate?: (attendance: { personId: string; eventId: string }, tx: Prisma.TransactionClient) => Promise<void>;
}) {
  const locationData = getRequiredAttendanceLocationData(params.input.location);

  try {
    return await params.prisma.$transaction(async (tx) => {
      await tx.eventAttendance.create({
        data: {
          eventId: params.input.eventId,
          personId: params.input.personId,
          attendedAt: params.input.attendedAt,
          createdById: params.input.createdById,
          committedById: params.input.committedById,
          createdByMethod: params.input.createdByMethod,
          ...locationData,
        },
      });
      await params.attendanceCategories.refreshForAttendance(params.input.personId, params.input.eventId, tx);
      const attendance = await tx.eventAttendance.findUniqueOrThrow({
        where: {
          personId_eventId: {
            eventId: params.input.eventId,
            personId: params.input.personId,
          },
        },
      });
      await params.afterCreate?.(attendance, tx);
      return attendance;
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Presença já registrada para este evento.');
    }

    throw error;
  }
}

export async function findSinglePersonForManualInput(
  prisma: PrismaService,
  rawValue: string,
): Promise<{ id: string }> {
  const value = rawValue.trim();
  if (!value) {
    throw new BadRequestException('Informe e-mail, telefone ou documento.');
  }

  const digits = value.replace(/\D/g, '');
  const phoneCandidates = getBrazilianPhoneCandidates(digits);
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
    where.push({
      identityDocument: {
        in: [value, digits],
      },
    });
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

  const resolvedPersonIds = new Set(people.map((person) => person.mergedIntoId ?? person.id));
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
    !Number.isFinite(location.accuracyMeters)
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

function getBrazilianPhoneCandidates(digits: string): string[] {
  if (!digits) {
    return [];
  }

  const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  const withCountry = withoutCountry.length >= 10 ? `55${withoutCountry}` : digits;
  return [...new Set([digits, withoutCountry, withCountry, `+${withCountry}`])];
}
