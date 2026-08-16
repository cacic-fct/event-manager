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
        if (error.code === 'P2002') {
          await this.recordRepeatedAttendanceAttempt(input);
        }
        throw new ConflictException('Presença já registrada para este evento.');
      }

      throw error;
    }
  }

  private async recordRepeatedAttendanceAttempt(input: {
    eventId: string;
    personId: string;
    createdByMethod: AttendanceCreationMethod;
    createdById?: string;
    committedById?: string;
  }): Promise<void> {
    const now = new Date();
    const fiveMinuteWindow = Math.floor(now.getTime() / (5 * 60_000));
    const actorId = input.createdById ?? input.committedById;
    const dedupeKey = `${input.eventId}:${input.personId}:${actorId ?? input.createdByMethod}:${fiveMinuteWindow}`;
    const counter = await this.prisma.attendanceScanAttemptCounter.upsert({
      where: { dedupeKey },
      create: {
        dedupeKey,
        eventId: input.eventId,
        personId: input.personId,
        actorId,
        method: input.createdByMethod,
        windowStartedAt: new Date(fiveMinuteWindow * 5 * 60_000),
      },
      update: { count: { increment: 1 } },
    });
    if (counter.count < 3) return;

    await this.prisma.attendanceReviewFlag.upsert({
      where: { dedupeKey: `repeated-attempts:${dedupeKey}` },
      create: {
        eventId: input.eventId,
        personId: input.personId,
        actorId,
        kind: 'REPEATED_SCAN_ATTEMPTS',
        severity: 'INFO',
        dedupeKey: `repeated-attempts:${dedupeKey}`,
        title: 'Tentativas repetidas de leitura',
        summary: `${counter.count} tentativas foram feitas para uma presença já registrada em até cinco minutos.`,
        details: { count: counter.count, method: input.createdByMethod },
      },
      update: {
        summary: `${counter.count} tentativas foram feitas para uma presença já registrada em até cinco minutos.`,
        details: { count: counter.count, method: input.createdByMethod },
      },
    });
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
