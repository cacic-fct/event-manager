import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod, EventAttendanceStatus, Prisma } from '@prisma/client';
import { getBrazilianPhoneCandidates } from '../../../common/brazilian-phone';
import { EventAttendancesScannerFeedSupport } from './scanner-feed-support';

const ATTENDANCE_WRITE_SELECT = {
  personId: true,
  eventId: true,
  attendedAt: true,
  createdAt: true,
  createdById: true,
  committedById: true,
  createdByMethod: true,
  status: true,
  category: true,
  collectedLatitude: true,
  collectedLongitude: true,
  collectedAccuracyMeters: true,
} satisfies Prisma.EventAttendanceSelect;

export abstract class EventAttendancesMutationSupport extends EventAttendancesScannerFeedSupport {
  protected async createAttendanceWithMetadata(
    input: {
      eventId: string;
      personId: string;
      createdByMethod: AttendanceCreationMethod;
      createdById?: string;
      committedById?: string;
      attendedAt?: Date;
      location?: { latitude: number; longitude: number; accuracyMeters: number };
    },
    afterCreate?: (attendance: { personId: string; eventId: string }, tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const locationData = input.location
      ? {
          collectedLatitude: input.location.latitude,
          collectedLongitude: input.location.longitude,
          collectedAccuracyMeters: input.location.accuracyMeters,
        }
      : {};
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.eventAttendance.findUnique({
          where: {
            personId_eventId: {
              personId: input.personId,
              eventId: input.eventId,
            },
          },
          select: { status: true },
        });
        if (existing?.status === EventAttendanceStatus.ABSENT) {
          const attendance = await tx.eventAttendance.update({
            where: {
              personId_eventId: {
                personId: input.personId,
                eventId: input.eventId,
              },
            },
            data: {
              status: EventAttendanceStatus.PRESENT,
              attendedAt: input.attendedAt ?? new Date(),
              createdById: input.createdById,
              committedById: input.committedById,
              createdByMethod: input.createdByMethod,
              ...locationData,
            },
            select: ATTENDANCE_WRITE_SELECT,
          });
          await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
          await afterCreate?.(attendance, tx);
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
            ...locationData,
          },
        });
        await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
        const attendance = await tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              personId: input.personId,
              eventId: input.eventId,
            },
          },
          select: ATTENDANCE_WRITE_SELECT,
        });
        await afterCreate?.(attendance, tx);
        return attendance;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2025')) {
        throw new ConflictException('Presença já registrada para este evento.');
      }

      throw error;
    }
  }

  protected async findSinglePersonForManualInput(rawValue: string): Promise<{ id: string }> {
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

    const people = await this.prisma.people.findMany({
      where: {
        deletedAt: null,
        OR: where,
      },
      select: {
        id: true,
        mergedIntoId: true,
      },
      take: 3,
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
}
