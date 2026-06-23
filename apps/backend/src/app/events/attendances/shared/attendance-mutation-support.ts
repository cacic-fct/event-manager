import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
import { EventAttendancesScannerFeedSupport } from './scanner-feed-support';

export abstract class EventAttendancesMutationSupport extends EventAttendancesScannerFeedSupport {
  protected async createAttendanceWithMetadata(input: {
    eventId: string;
    personId: string;
    createdByMethod: AttendanceCreationMethod;
    createdById?: string;
    location?: { latitude: number; longitude: number; accuracyMeters: number };
  }, afterCreate?: (attendance: { personId: string; eventId: string }, tx: Prisma.TransactionClient) => Promise<void>) {
    const locationData = input.location
      ? {
          collectedLatitude: input.location.latitude,
          collectedLongitude: input.location.longitude,
          collectedAccuracyMeters: input.location.accuracyMeters,
        }
      : {};

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.eventAttendance.create({
          data: {
            eventId: input.eventId,
            personId: input.personId,
            createdById: input.createdById,
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
          select: {
            personId: true,
            eventId: true,
            attendedAt: true,
            createdAt: true,
            createdById: true,
            createdByMethod: true,
            category: true,
            collectedLatitude: true,
            collectedLongitude: true,
            collectedAccuracyMeters: true,
          },
        });
        await afterCreate?.(attendance, tx);
        return attendance;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
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
    const phoneCandidates = this.getBrazilianPhoneCandidates(digits);
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

  protected getBrazilianPhoneCandidates(digits: string): string[] {
    if (!digits) {
      return [];
    }

    const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    const withCountry = withoutCountry.length >= 10 ? `55${withoutCountry}` : digits;
    return [...new Set([digits, withoutCountry, withCountry, `+${withCountry}`])];
  }
}
