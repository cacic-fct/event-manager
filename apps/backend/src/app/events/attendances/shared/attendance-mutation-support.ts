import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AttendanceCreationMethod, Prisma } from '@prisma/client';
import { getBrazilianPhoneCandidates } from '../../../common/brazilian-phone';
import { AttendanceCategoryService } from '../../attendance-category.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  notifySportsMatchAttendanceMutation,
  startSportsMatchCheckInFromAthleteAttendance,
  type SportsMatchAttendanceMutationPublisher,
} from '../../../sports/operations/sports-match-attendance';
import { createOrRestoreEventAttendance } from './event-attendance-writer';
import { EventAttendancesScannerFeedSupport } from './scanner-feed-support';

export abstract class EventAttendancesMutationSupport extends EventAttendancesScannerFeedSupport {
  constructor(
    prisma: PrismaService,
    attendanceCategories: AttendanceCategoryService,
    protected readonly sportsMutationEvents?: SportsMatchAttendanceMutationPublisher,
  ) {
    super(prisma, attendanceCategories);
  }

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
    let checkInStarted = false;
    try {
      const attendance = await this.prisma.$transaction((tx) =>
        createOrRestoreEventAttendance({
          tx,
          attendanceCategories: this.attendanceCategories,
          input,
          afterWrite: async (attendance, transaction) => {
            if (
              await startSportsMatchCheckInFromAthleteAttendance({
                tx: transaction,
                eventId: attendance.eventId,
                personId: attendance.personId,
                updatedById: input.committedById ?? input.createdById,
              })
            ) {
              checkInStarted = true;
            }
            await afterCreate?.(attendance, transaction);
          },
        }),
      );
      if (checkInStarted) {
        await notifySportsMatchAttendanceMutation(this.sportsMutationEvents, attendance);
      }
      return attendance;
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
