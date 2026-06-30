import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  EventFormResponseMode,
  EventFormTargetType,
  ExternalAccountMergeResult,
  People,
  Prisma,
} from '@prisma/client';
import { differenceInDays, isValid, parseISO } from 'date-fns';
import { CertificateIssuingService } from '../certificate/certificate-issuing.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountMergeAcknowledgementDto,
  AccountMergeNotificationDto,
  AccountMergeScoreRequestDto,
  AccountMergeScoreResponseDto,
} from './dto';

type NormalizedAccountMergeNotification = {
  eventId: string;
  type: 'account.merged';
  oldUserId: string;
  newUserId: string;
  occurredAt: Date;
  requestPayload: Prisma.InputJsonObject;
};

type PersonSnapshot = {
  name: string;
  email: string | null;
  secondaryEmails: string[];
  identityDocument: string | null;
  academicId: string | null;
  userId: string | null;
  externalRef: string | null;
  mergedIntoId: string | null;
  deletedAt: string | null;
};

type AttendanceSnapshot = {
  eventId: string;
  attendedAt: string;
  createdAt: string;
  createdById: string | null;
  committedById: string | null;
};

type LectureSnapshot = {
  eventId: string;
  createdAt: string;
  createdById: string | null;
};

type MovedRelationsSnapshot = {
  sourceAttendances: AttendanceSnapshot[];
  sourceLectures: LectureSnapshot[];
  insertedAttendanceEventIds: string[];
  insertedLectureEventIds: string[];
  movedEventSubscriptionIds: string[];
  movedEventGroupSubscriptionIds: string[];
  movedMajorEventSubscriptionIds: string[];
  movedEventFormResponseIds: string[];
  coalescedEventFormResponseIds: string[];
};

@Injectable()
export class AccountMergeService {
  private readonly logger = new Logger(AccountMergeService.name);
  private readonly establishedAccountAgeDays = 180;

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificateIssuingService: CertificateIssuingService,
  ) {}

  async scoreAccountMergeCandidates(body: AccountMergeScoreRequestDto): Promise<AccountMergeScoreResponseDto> {
    const userIds = this.normalizeUserIds(body.userIds);
    const scores: Record<string, number> = {};

    await Promise.all(
      userIds.map(async (userId) => {
        scores[userId] = await this.scoreUserId(userId);
      }),
    );

    return { scores };
  }

  async acknowledgeAccountMerge(
    body: AccountMergeNotificationDto,
    actorId: string | null,
  ): Promise<AccountMergeAcknowledgementDto> {
    const input = this.normalizeNotification(body);

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.externalAccountMergeOperation.findUnique({
          where: { eventId: input.eventId },
        });

        if (existing?.status === 'APPLIED') {
          this.ensureSameEvent(existing, input);
          return;
        }

        await this.ensureAccountMapping(tx, input.oldUserId, input.newUserId);
        const applied = await this.applyLocalMerge(tx, input, actorId);

        if (existing) {
          await tx.externalAccountMergeOperation.update({
            where: { eventId: input.eventId },
            data: {
              status: 'APPLIED',
              result: applied.result,
              peopleMergeOperationId: applied.peopleMergeOperationId,
              errorMessage: null,
              requestPayload: input.requestPayload,
              attemptCount: { increment: 1 },
              updatedById: actorId ?? undefined,
            },
          });
          return;
        }

        await tx.externalAccountMergeOperation.create({
          data: {
            eventId: input.eventId,
            type: input.type,
            oldUserId: input.oldUserId,
            newUserId: input.newUserId,
            occurredAt: input.occurredAt,
            status: 'APPLIED',
            result: applied.result,
            peopleMergeOperationId: applied.peopleMergeOperationId,
            requestPayload: input.requestPayload,
            createdById: actorId ?? undefined,
            updatedById: actorId ?? undefined,
          },
        });
      });

      return this.toAcknowledgement(input);
    } catch (error) {
      const alreadyApplied = await this.prisma.externalAccountMergeOperation.findUnique({
        where: { eventId: input.eventId },
        select: { status: true },
      });
      if (alreadyApplied?.status !== 'APPLIED') {
        await this.recordFailure(input, actorId, error);
      }
      this.logger.error(
        `Failed to process account merge event=${input.eventId}, oldUser=${input.oldUserId}, newUser=${input.newUserId}.`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Account merge notification was registered but could not be applied.');
    }
  }

  async resolveFinalUserId(userId?: string | null): Promise<string | null> {
    const initialUserId = userId?.trim();
    if (!initialUserId) {
      return null;
    }

    const seenUserIds = new Set<string>();
    let currentUserId = initialUserId;

    while (!seenUserIds.has(currentUserId)) {
      seenUserIds.add(currentUserId);
      const merge = await this.prisma.accountUserMerge.findUnique({
        where: { oldUserId: currentUserId },
      });

      if (!merge) {
        return currentUserId;
      }

      currentUserId = merge.newUserId;
    }

    this.logger.error(`Detected account merge cycle while resolving user ${initialUserId}.`);
    return currentUserId;
  }

  private async scoreUserId(userId: string): Promise<number> {
    const [user, people] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          createdAt: true,
        },
      }),
      this.prisma.people.findMany({
        where: {
          deletedAt: null,
          OR: [{ userId }, { externalRef: this.toKeycloakExternalRef(userId) }],
        },
        select: {
          id: true,
          name: true,
          email: true,
          secondaryEmails: true,
          phone: true,
          identityDocument: true,
          academicId: true,
          createdAt: true,
          _count: {
            select: {
              attendances: true,
              eventSubscriptions: true,
              eventGroupSubscriptions: true,
              majorEventSubscriptions: true,
              lectures: true,
              certificates: {
                where: {
                  deletedAt: null,
                },
              },
            },
          },
        },
      }),
    ]);

    if (!user && people.length === 0) {
      return 0;
    }

    const personScore = people.reduce((total, person) => total + this.scorePerson(person), 0);
    const confirmedMajorEventSubscriptions = await this.prisma.majorEventSubscription.count({
      where: {
        personId: { in: people.map((person) => person.id) },
        deletedAt: null,
        subscriptionStatus: 'CONFIRMED',
      },
    });

    return personScore + this.scoreCapped(confirmedMajorEventSubscriptions, 15, 60) + this.scoreUserAccount(user);
  }

  private scorePerson(person: {
    name: string;
    email: string | null;
    secondaryEmails: string[];
    phone: string | null;
    identityDocument: string | null;
    academicId: string | null;
    createdAt: Date;
    _count: {
      attendances: number;
      eventSubscriptions: number;
      eventGroupSubscriptions: number;
      majorEventSubscriptions: number;
      lectures: number;
      certificates: number;
    };
  }): number {
    return (
      25 +
      (person.name.trim() ? 15 : 0) +
      (person.email?.trim() ? 10 : 0) +
      (person.phone?.trim() ? 10 : 0) +
      (person.identityDocument?.trim() ? 10 : 0) +
      (person.academicId?.trim() ? 8 : 0) +
      person.secondaryEmails.length * 2 +
      this.scoreCapped(person._count.attendances, 10, 80) +
      this.scoreCapped(person._count.certificates, 20, 100) +
      this.scoreCapped(person._count.eventSubscriptions, 5, 40) +
      this.scoreCapped(person._count.eventGroupSubscriptions, 8, 40) +
      this.scoreCapped(person._count.majorEventSubscriptions, 8, 40) +
      this.scoreCapped(person._count.lectures, 15, 45) +
      this.scoreEstablishedDate(person.createdAt)
    );
  }

  private scoreUserAccount(user: { role: string; createdAt: Date } | null): number {
    if (!user) {
      return 0;
    }

    return (user.role !== 'USER' ? 10 : 0) + this.scoreEstablishedDate(user.createdAt);
  }

  private scoreCapped(count: number, pointsPerItem: number, max: number): number {
    return Math.min(count * pointsPerItem, max);
  }

  private scoreEstablishedDate(createdAt: Date): number {
    return differenceInDays(new Date(), createdAt) >= this.establishedAccountAgeDays ? 3 : 0;
  }

  private async applyLocalMerge(
    tx: Prisma.TransactionClient,
    input: NormalizedAccountMergeNotification,
    actorId: string | null,
  ): Promise<{
    result: ExternalAccountMergeResult;
    peopleMergeOperationId?: string;
  }> {
    const [sourcePerson, targetPerson, newUser] = await Promise.all([
      this.findSingleActivePersonForUser(tx, input.oldUserId),
      this.findSingleActivePersonForUser(tx, input.newUserId),
      tx.user.findUnique({ where: { id: input.newUserId } }),
    ]);

    if (!sourcePerson) {
      return {
        result: targetPerson ? 'ALREADY_APPLIED' : 'NO_LOCAL_PERSON',
      };
    }

    const finalPersonData = await this.buildFinalPersonUserData(tx, input.newUserId, newUser ? input.newUserId : null);

    if (!targetPerson || targetPerson.id === sourcePerson.id) {
      await tx.people.update({
        where: { id: sourcePerson.id },
        data: {
          ...finalPersonData,
          updatedById: actorId ?? undefined,
        },
      });

      return {
        result: 'PERSON_REASSIGNED',
      };
    }

    const targetSnapshot = this.toPersonSnapshot(targetPerson);
    const sourceSnapshot = this.toPersonSnapshot(sourcePerson);
    const movedRelations = await this.moveRelations(tx, targetPerson.id, sourcePerson.id);
    const targetData = this.buildTargetMergeData(targetPerson, sourcePerson, finalPersonData);

    await tx.people.update({
      where: { id: sourcePerson.id },
      data: {
        mergedIntoId: targetPerson.id,
        deletedAt: new Date(),
        updatedById: actorId ?? undefined,
      },
    });

    await tx.people.update({
      where: { id: targetPerson.id },
      data: {
        ...targetData,
        updatedById: actorId ?? undefined,
      },
    });

    const peopleMergeOperation = await tx.peopleMergeOperation.create({
      data: {
        targetPersonId: targetPerson.id,
        sourcePersonId: sourcePerson.id,
        migratedFields: ['USER_ID', 'EXTERNAL_REF'],
        targetSnapshot,
        sourceSnapshot,
        movedRelations,
        createdById: actorId ?? undefined,
      },
    });

    return {
      result: 'PEOPLE_MERGED',
      peopleMergeOperationId: peopleMergeOperation.id,
    };
  }

  private async ensureAccountMapping(
    tx: Prisma.TransactionClient,
    oldUserId: string,
    newUserId: string,
  ): Promise<void> {
    const existing = await tx.accountUserMerge.findUnique({
      where: { oldUserId },
    });

    if (existing && existing.newUserId !== newUserId) {
      throw new ConflictException(`User ${oldUserId} is already merged into ${existing.newUserId}.`);
    }

    if (!existing) {
      await tx.accountUserMerge.create({
        data: {
          oldUserId,
          newUserId,
        },
      });
    }
  }

  private async findSingleActivePersonForUser(tx: Prisma.TransactionClient, userId: string): Promise<People | null> {
    const people = await tx.people.findMany({
      where: {
        deletedAt: null,
        mergedIntoId: null,
        OR: [{ userId }, { externalRef: this.toKeycloakExternalRef(userId) }],
      },
      take: 2,
    });

    if (people.length > 1) {
      throw new ConflictException(`Multiple active people records are linked to user ${userId}.`);
    }

    return people[0] ?? null;
  }

  private async buildFinalPersonUserData(
    tx: Prisma.TransactionClient,
    finalUserId: string,
    linkedUserId: string | null,
  ): Promise<Prisma.PeopleUncheckedUpdateInput> {
    const externalRef = this.toKeycloakExternalRef(finalUserId);
    const existingExternalRef = await tx.people.findUnique({
      where: { externalRef },
      select: { id: true },
    });

    return {
      userId: linkedUserId,
      ...(existingExternalRef ? {} : { externalRef }),
    };
  }

  private buildTargetMergeData(
    targetPerson: People,
    sourcePerson: People,
    finalPersonData: Prisma.PeopleUncheckedUpdateInput,
  ): Prisma.PeopleUncheckedUpdateInput {
    return {
      ...finalPersonData,
      secondaryEmails: this.mergeSecondaryEmails(targetPerson, sourcePerson),
      phone: targetPerson.phone ?? sourcePerson.phone,
      identityDocument: targetPerson.identityDocument ?? sourcePerson.identityDocument,
      academicId: targetPerson.academicId ?? sourcePerson.academicId,
    };
  }

  private async moveRelations(
    tx: Prisma.TransactionClient,
    targetPersonId: string,
    sourcePersonId: string,
  ): Promise<MovedRelationsSnapshot> {
    const sourceAttendances = await tx.eventAttendance.findMany({
      where: { personId: sourcePersonId },
    });
    const insertedAttendanceRows = await this.copyMissingAttendances(tx, targetPersonId, sourceAttendances);
    await tx.eventAttendance.deleteMany({ where: { personId: sourcePersonId } });

    const sourceLectures = await tx.eventLecturer.findMany({
      where: { personId: sourcePersonId },
    });
    const insertedLectureRows = await this.copyMissingLectures(tx, targetPersonId, sourceLectures);
    await tx.eventLecturer.deleteMany({ where: { personId: sourcePersonId } });

    const movedEventSubscriptionIds = await this.moveById(tx.eventSubscription, targetPersonId, sourcePersonId);
    const movedEventGroupSubscriptionIds = await this.moveById(
      tx.eventGroupSubscription,
      targetPersonId,
      sourcePersonId,
    );
    const movedMajorEventSubscriptionIds = await this.moveById(
      tx.majorEventSubscription,
      targetPersonId,
      sourcePersonId,
    );
    const movedEventFormResponses = await this.moveEventFormResponses(tx, targetPersonId, sourcePersonId);

    return {
      sourceAttendances: sourceAttendances.map((attendance) => ({
        eventId: attendance.eventId,
        attendedAt: attendance.attendedAt.toISOString(),
        createdAt: attendance.createdAt.toISOString(),
        createdById: attendance.createdById,
        committedById: attendance.committedById,
      })),
      sourceLectures: sourceLectures.map((lecture) => ({
        eventId: lecture.eventId,
        createdAt: lecture.createdAt.toISOString(),
        createdById: lecture.createdById,
      })),
      insertedAttendanceEventIds: insertedAttendanceRows.map((attendance) => attendance.eventId),
      insertedLectureEventIds: insertedLectureRows.map((lecture) => lecture.eventId),
      movedEventSubscriptionIds,
      movedEventGroupSubscriptionIds,
      movedMajorEventSubscriptionIds,
      movedEventFormResponseIds: movedEventFormResponses.movedIds,
      coalescedEventFormResponseIds: movedEventFormResponses.coalescedIds,
    };
  }

  private async moveEventFormResponses(
    tx: Prisma.TransactionClient,
    targetPersonId: string,
    sourcePersonId: string,
  ): Promise<{ movedIds: string[]; coalescedIds: string[] }> {
    const sourceResponses = await tx.eventFormResponse.findMany({
      where: { personId: sourcePersonId },
      select: {
        id: true,
        formId: true,
        targetType: true,
        eventId: true,
        majorEventId: true,
        form: {
          select: {
            responseMode: true,
          },
        },
      },
    });
    const movedIds: string[] = [];
    const coalescedIds: string[] = [];

    for (const response of sourceResponses) {
      const conflictWhere = this.eventFormResponseConflictWhere(response, targetPersonId);
      const conflict = conflictWhere
        ? await tx.eventFormResponse.findFirst({
            where: conflictWhere,
            select: { id: true },
          })
        : null;

      if (conflict) {
        const result = await tx.eventFormResponse.deleteMany({
          where: { id: response.id, personId: sourcePersonId },
        });
        if (result.count === 1) {
          coalescedIds.push(response.id);
        }
        continue;
      }

      const result = await tx.eventFormResponse.updateMany({
        where: { id: response.id, personId: sourcePersonId },
        data: { personId: targetPersonId },
      });
      if (result.count === 1) {
        movedIds.push(response.id);
      }
    }

    return { movedIds, coalescedIds };
  }

  private eventFormResponseConflictWhere(
    response: {
      formId: string;
      targetType: EventFormTargetType;
      eventId: string | null;
      majorEventId: string | null;
      form: { responseMode: EventFormResponseMode };
    },
    targetPersonId: string,
  ): Prisma.EventFormResponseWhereInput | null {
    if (response.form.responseMode === EventFormResponseMode.MULTIPLE_PER_TARGET) {
      return null;
    }

    if (response.form.responseMode === EventFormResponseMode.SINGLE_PER_FORM) {
      return {
        formId: response.formId,
        personId: targetPersonId,
      };
    }

    return {
      formId: response.formId,
      personId: targetPersonId,
      targetType: response.targetType,
      eventId: response.eventId,
      majorEventId: response.majorEventId,
    };
  }

  private async copyMissingAttendances(
    tx: Prisma.TransactionClient,
    targetPersonId: string,
    sourceAttendances: Awaited<ReturnType<Prisma.TransactionClient['eventAttendance']['findMany']>>,
  ) {
    const sourceEventIds = sourceAttendances.map((attendance) => attendance.eventId);
    const existing = sourceEventIds.length
      ? await tx.eventAttendance.findMany({
          where: {
            personId: targetPersonId,
            eventId: { in: sourceEventIds },
          },
          select: { eventId: true },
        })
      : [];
    const existingEventIds = new Set(existing.map((item) => item.eventId));
    const inserted = sourceAttendances.filter((attendance) => !existingEventIds.has(attendance.eventId));

    if (inserted.length > 0) {
      await tx.eventAttendance.createMany({
        data: inserted.map((attendance) => ({
          personId: targetPersonId,
          eventId: attendance.eventId,
          attendedAt: attendance.attendedAt,
          createdAt: attendance.createdAt,
          createdById: attendance.createdById,
          committedById: attendance.committedById,
          createdByMethod: attendance.createdByMethod,
          category: attendance.category,
        })),
        skipDuplicates: true,
      });
    }

    return inserted;
  }

  private async copyMissingLectures(
    tx: Prisma.TransactionClient,
    targetPersonId: string,
    sourceLectures: Awaited<ReturnType<Prisma.TransactionClient['eventLecturer']['findMany']>>,
  ) {
    const sourceEventIds = sourceLectures.map((lecture) => lecture.eventId);
    const existing = sourceEventIds.length
      ? await tx.eventLecturer.findMany({
          where: {
            personId: targetPersonId,
            eventId: { in: sourceEventIds },
          },
          select: { eventId: true },
        })
      : [];
    const existingEventIds = new Set(existing.map((item) => item.eventId));
    const inserted = sourceLectures.filter((lecture) => !existingEventIds.has(lecture.eventId));

    if (inserted.length > 0) {
      await tx.eventLecturer.createMany({
        data: inserted.map((lecture) => ({
          personId: targetPersonId,
          eventId: lecture.eventId,
          createdAt: lecture.createdAt,
          createdById: lecture.createdById,
        })),
        skipDuplicates: true,
      });
    }

    return inserted;
  }

  private async moveById(
    delegate: {
      findMany: (args: { where: { personId: string }; select: { id: true } }) => Promise<Array<{ id: string }>>;
      updateMany: (args: { where: { id: { in: string[] } }; data: { personId: string } }) => Promise<unknown>;
    },
    targetPersonId: string,
    sourcePersonId: string,
  ): Promise<string[]> {
    const rows = await delegate.findMany({
      where: { personId: sourcePersonId },
      select: { id: true },
    });
    const ids = rows.map((row) => row.id);

    if (ids.length > 0) {
      await delegate.updateMany({
        where: { id: { in: ids } },
        data: { personId: targetPersonId },
      });
    }

    return ids;
  }

  private async recordFailure(
    input: NormalizedAccountMergeNotification,
    actorId: string | null,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown account merge error.';

    await this.prisma.externalAccountMergeOperation.upsert({
      where: { eventId: input.eventId },
      create: {
        eventId: input.eventId,
        type: input.type,
        oldUserId: input.oldUserId,
        newUserId: input.newUserId,
        occurredAt: input.occurredAt,
        status: 'FAILED',
        requestPayload: input.requestPayload,
        errorMessage,
        createdById: actorId ?? undefined,
        updatedById: actorId ?? undefined,
      },
      update: {
        status: 'FAILED',
        requestPayload: input.requestPayload,
        errorMessage,
        attemptCount: { increment: 1 },
        updatedById: actorId ?? undefined,
      },
    });
  }

  private ensureSameEvent(
    existing: {
      type: string;
      oldUserId: string;
      newUserId: string;
    },
    input: NormalizedAccountMergeNotification,
  ): void {
    if (
      existing.type !== input.type ||
      existing.oldUserId !== input.oldUserId ||
      existing.newUserId !== input.newUserId
    ) {
      throw new ConflictException(`Event ${input.eventId} was already registered with different account merge data.`);
    }
  }

  private normalizeNotification(body: AccountMergeNotificationDto): NormalizedAccountMergeNotification {
    const eventId = this.readRequiredString(body.eventId, 'eventId');
    const type = this.readRequiredString(body.type, 'type');
    if (type !== 'account.merged') {
      throw new BadRequestException('type must be account.merged.');
    }

    const oldUserId = this.readRequiredString(body.oldUserId, 'oldUserId');
    const newUserId = this.readRequiredString(body.newUserId, 'newUserId');
    if (oldUserId === newUserId) {
      throw new BadRequestException('oldUserId and newUserId must be distinct.');
    }

    const occurredAtValue = this.readRequiredString(body.occurredAt, 'occurredAt');
    const occurredAt = parseISO(occurredAtValue);
    if (!isValid(occurredAt)) {
      throw new BadRequestException('occurredAt must be a valid ISO date.');
    }

    return {
      eventId,
      type,
      oldUserId,
      newUserId,
      occurredAt,
      requestPayload: {
        eventId,
        type,
        oldUserId,
        newUserId,
        occurredAt: occurredAtValue,
      },
    };
  }

  private toAcknowledgement(input: NormalizedAccountMergeNotification): AccountMergeAcknowledgementDto {
    return {
      eventId: input.eventId,
      type: input.type,
      oldUserId: input.oldUserId,
      newUserId: input.newUserId,
      status: 'success',
    };
  }

  private toPersonSnapshot(person: People): PersonSnapshot {
    return {
      name: person.name,
      email: person.email,
      secondaryEmails: person.secondaryEmails,
      identityDocument: person.identityDocument,
      academicId: person.academicId,
      userId: person.userId,
      externalRef: person.externalRef,
      mergedIntoId: person.mergedIntoId,
      deletedAt: person.deletedAt ? person.deletedAt.toISOString() : null,
    };
  }

  private mergeSecondaryEmails(targetPerson: People, sourcePerson: People) {
    const emails = new Set(
      targetPerson.secondaryEmails
        .map((email) => this.normalizeEmail(email))
        .filter((email): email is string => email !== null),
    );
    const nextSecondaryEmails = [...targetPerson.secondaryEmails];

    for (const email of [targetPerson.email, sourcePerson.email]) {
      const normalizedEmail = this.normalizeEmail(email);
      if (!email || !normalizedEmail || emails.has(normalizedEmail)) {
        continue;
      }

      if (this.normalizeEmail(targetPerson.email) === normalizedEmail) {
        continue;
      }

      nextSecondaryEmails.push(email);
      emails.add(normalizedEmail);
    }

    return nextSecondaryEmails;
  }

  private normalizeEmail(email?: string | null): string | null {
    const normalized = email?.trim().toLowerCase();
    return normalized || null;
  }

  private toKeycloakExternalRef(userId: string): string {
    return `kc:${userId}`;
  }

  private readRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${fieldName} must be a non-empty string.`);
    }

    return value.trim();
  }

  private normalizeUserIds(rawUserIds: unknown): string[] {
    if (!Array.isArray(rawUserIds)) {
      throw new BadRequestException('userIds must be an array.');
    }

    const userIds = new Set<string>();
    for (const rawUserId of rawUserIds) {
      if (typeof rawUserId !== 'string' || !rawUserId.trim()) {
        throw new BadRequestException('userIds must contain only non-empty strings.');
      }

      userIds.add(rawUserId.trim());
    }

    return [...userIds];
  }
}
