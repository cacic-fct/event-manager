import {
  MergeCandidateMergeInput,
  PersonMergeField,
} from '@cacic-eventos/shared-data-types';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { People, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type CandidateMatch = {
  personAId: string;
  personBId: string;
  pairKey: string;
  method: MergeMatchMethod;
  matchValue: string;
  score: number;
};

type MergeMatchMethod = 'CPF' | 'EMAIL' | 'NORMALIZED_NAME';

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
};

const MATCH_METHOD_PRIORITY: Record<MergeMatchMethod, number> = {
  CPF: 3,
  EMAIL: 2,
  NORMALIZED_NAME: 1,
};

@Injectable()
export class MergeCandidateOperationsService {
  private readonly logger = new Logger(MergeCandidateOperationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scanMergeCandidates(actorId: string | null): Promise<number> {
    const people = await this.prisma.people.findMany({
      where: {
        deletedAt: null,
        mergedIntoId: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        identityDocument: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    const matches = new Map<string, CandidateMatch>();
    this.collectCpfMatches(people, matches);
    this.collectEmailMatches(people, matches);
    this.collectNameMatches(people, matches);

    if (matches.size === 0) {
      return 0;
    }

    const pairKeys = [...matches.keys()];
    const existingCandidates = await this.prisma.mergeCandidate.findMany({
      where: {
        pairKey: {
          in: pairKeys,
        },
      },
      select: {
        id: true,
        pairKey: true,
        status: true,
      },
    });

    const existingByPairKey = new Map(
      existingCandidates.map((candidate) => [candidate.pairKey, candidate]),
    );

    let touchedCandidates = 0;

    for (const match of matches.values()) {
      const existingCandidate = existingByPairKey.get(match.pairKey);
      if (!existingCandidate) {
        await this.prisma.mergeCandidate.create({
          data: {
            personAId: match.personAId,
            personBId: match.personBId,
            pairKey: match.pairKey,
            score: match.score,
            matchMethod: match.method,
            matchValue: match.matchValue,
            status: 'PENDING',
            createdById: actorId ?? undefined,
          },
        });
        touchedCandidates += 1;
        continue;
      }

      if (existingCandidate.status !== 'PENDING') {
        continue;
      }

      await this.prisma.mergeCandidate.update({
        where: {
          id: existingCandidate.id,
        },
        data: {
          personAId: match.personAId,
          personBId: match.personBId,
          score: match.score,
          matchMethod: match.method,
          matchValue: match.matchValue,
          updatedById: actorId ?? undefined,
        },
      });
      touchedCandidates += 1;
    }

    return touchedCandidates;
  }

  async mergeCandidatePeople(
    input: MergeCandidateMergeInput,
    actorId: string | null,
  ) {
    const migrateFields = this.normalizeMigrateFields(input.migrateFields);

    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.mergeCandidate.findUnique({
        where: {
          id: input.candidateId,
        },
        include: {
          personA: true,
          personB: true,
        },
      });

      if (!candidate) {
        throw new NotFoundException(
          `Merge candidate ${input.candidateId} was not found.`,
        );
      }

      if (candidate.status !== 'PENDING') {
        throw new ConflictException(
          `Merge candidate ${candidate.id} is not pending anymore.`,
        );
      }

      if (
        input.targetPersonId !== candidate.personAId &&
        input.targetPersonId !== candidate.personBId
      ) {
        throw new UnprocessableEntityException(
          'The selected target person does not belong to this merge candidate.',
        );
      }

      const sourcePersonId =
        input.targetPersonId === candidate.personAId
          ? candidate.personBId
          : candidate.personAId;

      const [targetPerson, sourcePerson] = await Promise.all([
        tx.people.findUnique({
          where: { id: input.targetPersonId },
        }),
        tx.people.findUnique({
          where: { id: sourcePersonId },
        }),
      ]);

      if (!targetPerson) {
        throw new NotFoundException(
          `Target person ${input.targetPersonId} was not found.`,
        );
      }

      if (!sourcePerson) {
        throw new NotFoundException(
          `Source person ${sourcePersonId} was not found.`,
        );
      }

      if (targetPerson.deletedAt || targetPerson.mergedIntoId) {
        throw new ConflictException(
          `Target person ${targetPerson.id} is not available for merge.`,
        );
      }

      if (sourcePerson.deletedAt || sourcePerson.mergedIntoId) {
        throw new ConflictException(
          `Source person ${sourcePerson.id} is not available for merge.`,
        );
      }

      const targetSnapshot = this.toPersonSnapshot(targetPerson);
      const sourceSnapshot = this.toPersonSnapshot(sourcePerson);
      const targetMigrationData = this.buildTargetMigrationData(
        migrateFields,
        targetPerson,
        sourcePerson,
      );

      const movedRelations = await this.moveRelations(
        tx,
        targetPerson.id,
        sourcePerson.id,
      );

      await tx.people.update({
        where: {
          id: sourcePerson.id,
        },
        data: {
          mergedIntoId: targetPerson.id,
          deletedAt: new Date(),
          updatedById: actorId ?? undefined,
        },
      });

      if (Object.keys(targetMigrationData).length > 0) {
        await tx.people.update({
          where: {
            id: targetPerson.id,
          },
          data: {
            ...targetMigrationData,
            updatedById: actorId ?? undefined,
          },
        });
      }

      await tx.peopleMergeOperation.create({
        data: {
          targetPersonId: targetPerson.id,
          sourcePersonId: sourcePerson.id,
          mergeCandidateId: candidate.id,
          migratedFields: migrateFields,
          targetSnapshot,
          sourceSnapshot,
          movedRelations,
          createdById: actorId ?? undefined,
        },
      });

      const updatedCandidate = await tx.mergeCandidate.update({
        where: {
          id: candidate.id,
        },
        data: {
          status: 'MERGED',
          resolvedById: actorId ?? undefined,
          updatedById: actorId ?? undefined,
        },
        include: {
          personA: true,
          personB: true,
        },
      });

      this.logger.log(
        `Merged people for candidate=${candidate.id}, target=${targetPerson.id}, source=${sourcePerson.id}, fields=${migrateFields.join(',') || '(none)'}, actor=${actorId ?? 'system'}.`,
      );

      return updatedCandidate;
    });
  }

  async undoMergeCandidatePeople(candidateId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.mergeCandidate.findUnique({
        where: {
          id: candidateId,
        },
      });

      if (!candidate) {
        throw new NotFoundException(
          `Merge candidate ${candidateId} was not found.`,
        );
      }

      const operation = await tx.peopleMergeOperation.findFirst({
        where: {
          mergeCandidateId: candidateId,
          status: 'APPLIED',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!operation) {
        throw new NotFoundException(
          `No applied merge operation was found for merge candidate ${candidateId}.`,
        );
      }

      const targetSnapshot = this.parsePersonSnapshot(
        operation.targetSnapshot,
        'targetSnapshot',
      );
      const sourceSnapshot = this.parsePersonSnapshot(
        operation.sourceSnapshot,
        'sourceSnapshot',
      );
      const movedRelations = this.parseMovedRelations(operation.movedRelations);

      const [targetPerson, sourcePerson] = await Promise.all([
        tx.people.findUnique({ where: { id: operation.targetPersonId } }),
        tx.people.findUnique({ where: { id: operation.sourcePersonId } }),
      ]);

      if (!targetPerson || !sourcePerson) {
        throw new NotFoundException(
          `Merge operation ${operation.id} references missing people.`,
        );
      }

      if (sourcePerson.mergedIntoId !== targetPerson.id) {
        throw new ConflictException(
          `Source person ${sourcePerson.id} is not merged into target ${targetPerson.id}.`,
        );
      }

      if (movedRelations.movedEventSubscriptionIds.length > 0) {
        await tx.eventSubscription.updateMany({
          where: {
            id: {
              in: movedRelations.movedEventSubscriptionIds,
            },
            personId: targetPerson.id,
          },
          data: {
            personId: sourcePerson.id,
          },
        });
      }

      if (movedRelations.movedEventGroupSubscriptionIds.length > 0) {
        await tx.eventGroupSubscription.updateMany({
          where: {
            id: {
              in: movedRelations.movedEventGroupSubscriptionIds,
            },
            personId: targetPerson.id,
          },
          data: {
            personId: sourcePerson.id,
          },
        });
      }

      if (movedRelations.movedMajorEventSubscriptionIds.length > 0) {
        await tx.majorEventSubscription.updateMany({
          where: {
            id: {
              in: movedRelations.movedMajorEventSubscriptionIds,
            },
            personId: targetPerson.id,
          },
          data: {
            personId: sourcePerson.id,
          },
        });
      }

      if (movedRelations.insertedAttendanceEventIds.length > 0) {
        await tx.eventAttendance.deleteMany({
          where: {
            personId: targetPerson.id,
            eventId: {
              in: movedRelations.insertedAttendanceEventIds,
            },
          },
        });
      }

      if (movedRelations.insertedLectureEventIds.length > 0) {
        await tx.eventLecturer.deleteMany({
          where: {
            personId: targetPerson.id,
            eventId: {
              in: movedRelations.insertedLectureEventIds,
            },
          },
        });
      }

      if (movedRelations.sourceAttendances.length > 0) {
        await tx.eventAttendance.createMany({
          data: movedRelations.sourceAttendances.map((attendance) => ({
            personId: sourcePerson.id,
            eventId: attendance.eventId,
            attendedAt: new Date(attendance.attendedAt),
            createdAt: new Date(attendance.createdAt),
            createdById: attendance.createdById,
          })),
          skipDuplicates: true,
        });
      }

      if (movedRelations.sourceLectures.length > 0) {
        await tx.eventLecturer.createMany({
          data: movedRelations.sourceLectures.map((lecture) => ({
            personId: sourcePerson.id,
            eventId: lecture.eventId,
            createdAt: new Date(lecture.createdAt),
            createdById: lecture.createdById,
          })),
          skipDuplicates: true,
        });
      }

      await tx.people.update({
        where: {
          id: targetPerson.id,
        },
        data: {
          ...this.toPersonUpdateData(targetSnapshot),
          updatedById: actorId ?? undefined,
        },
      });

      await tx.people.update({
        where: {
          id: sourcePerson.id,
        },
        data: {
          ...this.toPersonUpdateData(sourceSnapshot),
          updatedById: actorId ?? undefined,
        },
      });

      await tx.peopleMergeOperation.update({
        where: {
          id: operation.id,
        },
        data: {
          status: 'ROLLED_BACK',
          rolledBackAt: new Date(),
          rolledBackById: actorId ?? undefined,
        },
      });

      const updatedCandidate = await tx.mergeCandidate.update({
        where: {
          id: candidate.id,
        },
        data: {
          status: 'PENDING',
          resolvedById: null,
          updatedById: actorId ?? undefined,
        },
        include: {
          personA: true,
          personB: true,
        },
      });

      this.logger.warn(
        `Rolled back merge operation=${operation.id}, candidate=${candidate.id}, target=${targetPerson.id}, source=${sourcePerson.id}, actor=${actorId ?? 'system'}.`,
      );

      return updatedCandidate;
    });
  }

  private normalizeMigrateFields(
    rawFields?: PersonMergeField[] | null,
  ): PersonMergeField[] {
    const fields = rawFields ?? [];
    return [...new Set(fields)];
  }

  private collectCpfMatches(
    people: Array<{
      id: string;
      identityDocument: string | null;
      email: string | null;
      name: string;
    }>,
    matches: Map<string, CandidateMatch>,
  ): void {
    const byCpf = new Map<string, typeof people>();

    for (const person of people) {
      const cpf = this.normalizeCpf(person.identityDocument);
      if (!cpf || !this.isValidCpf(cpf)) {
        continue;
      }

      const group = byCpf.get(cpf) ?? [];
      group.push(person);
      byCpf.set(cpf, group);
    }

    for (const [cpf, group] of byCpf.entries()) {
      this.registerPairs(group, matches, 'CPF', cpf, 1);
    }
  }

  private collectEmailMatches(
    people: Array<{
      id: string;
      identityDocument: string | null;
      email: string | null;
      name: string;
    }>,
    matches: Map<string, CandidateMatch>,
  ): void {
    const byEmail = new Map<string, typeof people>();

    for (const person of people) {
      const email = this.normalizeEmail(person.email);
      if (!email) {
        continue;
      }

      const group = byEmail.get(email) ?? [];
      group.push(person);
      byEmail.set(email, group);
    }

    for (const [email, group] of byEmail.entries()) {
      this.registerPairs(group, matches, 'EMAIL', email, 0.85);
    }
  }

  private collectNameMatches(
    people: Array<{
      id: string;
      identityDocument: string | null;
      email: string | null;
      name: string;
    }>,
    matches: Map<string, CandidateMatch>,
  ): void {
    const byName = new Map<string, typeof people>();

    for (const person of people) {
      const normalizedName = this.normalizeName(person.name);
      if (!normalizedName || normalizedName.length < 5) {
        continue;
      }

      const group = byName.get(normalizedName) ?? [];
      group.push(person);
      byName.set(normalizedName, group);
    }

    for (const [normalizedName, group] of byName.entries()) {
      this.registerPairs(
        group,
        matches,
        'NORMALIZED_NAME',
        normalizedName,
        0.6,
      );
    }
  }

  private registerPairs(
    group: Array<{ id: string }>,
    matches: Map<string, CandidateMatch>,
    method: MergeMatchMethod,
    matchValue: string,
    score: number,
  ): void {
    if (group.length < 2) {
      return;
    }

    for (let i = 0; i < group.length - 1; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const [personAId, personBId] = [group[i].id, group[j].id].sort();
        const pairKey = `${personAId}:${personBId}`;
        const current = matches.get(pairKey);
        if (!current) {
          matches.set(pairKey, {
            personAId,
            personBId,
            pairKey,
            method,
            matchValue,
            score,
          });
          continue;
        }

        const currentPriority = MATCH_METHOD_PRIORITY[current.method];
        const nextPriority = MATCH_METHOD_PRIORITY[method];
        if (nextPriority > currentPriority) {
          matches.set(pairKey, {
            personAId,
            personBId,
            pairKey,
            method,
            matchValue,
            score,
          });
          continue;
        }

        if (nextPriority === currentPriority && score > current.score) {
          matches.set(pairKey, {
            personAId,
            personBId,
            pairKey,
            method,
            matchValue,
            score,
          });
        }
      }
    }
  }

  private async moveRelations(
    tx: Prisma.TransactionClient,
    targetPersonId: string,
    sourcePersonId: string,
  ): Promise<MovedRelationsSnapshot> {
    const sourceAttendances = await tx.eventAttendance.findMany({
      where: {
        personId: sourcePersonId,
      },
    });

    const sourceAttendanceEventIds = sourceAttendances.map(
      (attendance) => attendance.eventId,
    );
    const targetAttendances = sourceAttendanceEventIds.length
      ? await tx.eventAttendance.findMany({
          where: {
            personId: targetPersonId,
            eventId: {
              in: sourceAttendanceEventIds,
            },
          },
          select: {
            eventId: true,
          },
        })
      : [];

    const targetAttendanceSet = new Set(
      targetAttendances.map((attendance) => attendance.eventId),
    );
    const insertedAttendanceRows = sourceAttendances.filter(
      (attendance) => !targetAttendanceSet.has(attendance.eventId),
    );

    if (insertedAttendanceRows.length > 0) {
      await tx.eventAttendance.createMany({
        data: insertedAttendanceRows.map((attendance) => ({
          personId: targetPersonId,
          eventId: attendance.eventId,
          attendedAt: attendance.attendedAt,
          createdAt: attendance.createdAt,
          createdById: attendance.createdById,
        })),
        skipDuplicates: true,
      });
    }

    if (sourceAttendances.length > 0) {
      await tx.eventAttendance.deleteMany({
        where: {
          personId: sourcePersonId,
        },
      });
    }

    const sourceLectures = await tx.eventLecturer.findMany({
      where: {
        personId: sourcePersonId,
      },
    });

    const sourceLectureEventIds = sourceLectures.map(
      (lecture) => lecture.eventId,
    );
    const targetLectures = sourceLectureEventIds.length
      ? await tx.eventLecturer.findMany({
          where: {
            personId: targetPersonId,
            eventId: {
              in: sourceLectureEventIds,
            },
          },
          select: {
            eventId: true,
          },
        })
      : [];

    const targetLectureSet = new Set(
      targetLectures.map((lecture) => lecture.eventId),
    );
    const insertedLectureRows = sourceLectures.filter(
      (lecture) => !targetLectureSet.has(lecture.eventId),
    );

    if (insertedLectureRows.length > 0) {
      await tx.eventLecturer.createMany({
        data: insertedLectureRows.map((lecture) => ({
          personId: targetPersonId,
          eventId: lecture.eventId,
          createdAt: lecture.createdAt,
          createdById: lecture.createdById,
        })),
        skipDuplicates: true,
      });
    }

    if (sourceLectures.length > 0) {
      await tx.eventLecturer.deleteMany({
        where: {
          personId: sourcePersonId,
        },
      });
    }

    const sourceEventSubscriptions = await tx.eventSubscription.findMany({
      where: {
        personId: sourcePersonId,
      },
      select: {
        id: true,
      },
    });

    const movedEventSubscriptionIds = sourceEventSubscriptions.map(
      (subscription) => subscription.id,
    );
    if (movedEventSubscriptionIds.length > 0) {
      await tx.eventSubscription.updateMany({
        where: {
          id: {
            in: movedEventSubscriptionIds,
          },
        },
        data: {
          personId: targetPersonId,
        },
      });
    }

    const sourceEventGroupSubscriptions =
      await tx.eventGroupSubscription.findMany({
        where: {
          personId: sourcePersonId,
        },
        select: {
          id: true,
        },
      });

    const movedEventGroupSubscriptionIds = sourceEventGroupSubscriptions.map(
      (subscription) => subscription.id,
    );
    if (movedEventGroupSubscriptionIds.length > 0) {
      await tx.eventGroupSubscription.updateMany({
        where: {
          id: {
            in: movedEventGroupSubscriptionIds,
          },
        },
        data: {
          personId: targetPersonId,
        },
      });
    }

    const sourceMajorEventSubscriptions =
      await tx.majorEventSubscription.findMany({
        where: {
          personId: sourcePersonId,
        },
        select: {
          id: true,
        },
      });

    const movedMajorEventSubscriptionIds = sourceMajorEventSubscriptions.map(
      (subscription) => subscription.id,
    );
    if (movedMajorEventSubscriptionIds.length > 0) {
      await tx.majorEventSubscription.updateMany({
        where: {
          id: {
            in: movedMajorEventSubscriptionIds,
          },
        },
        data: {
          personId: targetPersonId,
        },
      });
    }

    return {
      sourceAttendances: sourceAttendances.map((attendance) => ({
        eventId: attendance.eventId,
        attendedAt: attendance.attendedAt.toISOString(),
        createdAt: attendance.createdAt.toISOString(),
        createdById: attendance.createdById,
      })),
      sourceLectures: sourceLectures.map((lecture) => ({
        eventId: lecture.eventId,
        createdAt: lecture.createdAt.toISOString(),
        createdById: lecture.createdById,
      })),
      insertedAttendanceEventIds: insertedAttendanceRows.map(
        (attendance) => attendance.eventId,
      ),
      insertedLectureEventIds: insertedLectureRows.map(
        (lecture) => lecture.eventId,
      ),
      movedEventSubscriptionIds,
      movedEventGroupSubscriptionIds,
      movedMajorEventSubscriptionIds,
    };
  }

  private buildTargetMigrationData(
    migrateFields: PersonMergeField[],
    targetPerson: People,
    sourcePerson: People,
  ): Prisma.PeopleUncheckedUpdateInput {
    const updateData: Prisma.PeopleUncheckedUpdateInput = {};
    const mergedSecondaryEmails = this.mergeSecondaryEmails(
      migrateFields,
      targetPerson,
      sourcePerson,
    );

    if (mergedSecondaryEmails !== targetPerson.secondaryEmails) {
      updateData.secondaryEmails = mergedSecondaryEmails;
    }

    for (const field of migrateFields) {
      if (field === 'NAME') {
        updateData.name = this.ensureMigratableValue(sourcePerson.name, field);
        continue;
      }

      if (field === 'EMAIL') {
        updateData.email = this.ensureMigratableValue(
          sourcePerson.email,
          field,
        );
        continue;
      }

      if (field === 'IDENTITY_DOCUMENT') {
        updateData.identityDocument = this.ensureMigratableValue(
          sourcePerson.identityDocument,
          field,
        );
        continue;
      }

      if (field === 'ACADEMIC_ID') {
        updateData.academicId = this.ensureMigratableValue(
          sourcePerson.academicId,
          field,
        );
        continue;
      }

      if (field === 'USER_ID') {
        updateData.userId = this.ensureMigratableValue(
          sourcePerson.userId,
          field,
        );
        continue;
      }

      if (field === 'EXTERNAL_REF') {
        updateData.externalRef = this.ensureMigratableValue(
          sourcePerson.externalRef,
          field,
        );
      }
    }

    return updateData;
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

  private toPersonUpdateData(
    snapshot: PersonSnapshot,
  ): Prisma.PeopleUncheckedUpdateInput {
    return {
      name: snapshot.name,
      email: snapshot.email,
      secondaryEmails: snapshot.secondaryEmails,
      identityDocument: snapshot.identityDocument,
      academicId: snapshot.academicId,
      userId: snapshot.userId,
      externalRef: snapshot.externalRef,
      mergedIntoId: snapshot.mergedIntoId,
      deletedAt: snapshot.deletedAt ? new Date(snapshot.deletedAt) : null,
    };
  }

  private parsePersonSnapshot(
    value: Prisma.JsonValue,
    fieldName: string,
  ): PersonSnapshot {
    if (!this.isRecord(value)) {
      throw new ConflictException(`Invalid ${fieldName} payload.`);
    }

    const name = this.readRequiredString(value, 'name');
    return {
      name,
      email: this.readNullableString(value, 'email'),
      secondaryEmails:
        value.secondaryEmails === undefined
          ? []
          : this.readStringArray(value, 'secondaryEmails'),
      identityDocument: this.readNullableString(value, 'identityDocument'),
      academicId: this.readNullableString(value, 'academicId'),
      userId: this.readNullableString(value, 'userId'),
      externalRef: this.readNullableString(value, 'externalRef'),
      mergedIntoId: this.readNullableString(value, 'mergedIntoId'),
      deletedAt: this.readNullableString(value, 'deletedAt'),
    };
  }

  private parseMovedRelations(value: Prisma.JsonValue): MovedRelationsSnapshot {
    if (!this.isRecord(value)) {
      throw new ConflictException('Invalid movedRelations payload.');
    }

    const sourceAttendances = this.readArray(value, 'sourceAttendances').map(
      (entry) => {
        if (!this.isRecord(entry)) {
          throw new ConflictException(
            'Invalid sourceAttendances payload entry.',
          );
        }
        return {
          eventId: this.readRequiredString(entry, 'eventId'),
          attendedAt: this.readRequiredString(entry, 'attendedAt'),
          createdAt: this.readRequiredString(entry, 'createdAt'),
          createdById: this.readNullableString(entry, 'createdById'),
        };
      },
    );

    const sourceLectures = this.readArray(value, 'sourceLectures').map(
      (entry) => {
        if (!this.isRecord(entry)) {
          throw new ConflictException('Invalid sourceLectures payload entry.');
        }

        return {
          eventId: this.readRequiredString(entry, 'eventId'),
          createdAt: this.readRequiredString(entry, 'createdAt'),
          createdById: this.readNullableString(entry, 'createdById'),
        };
      },
    );

    return {
      sourceAttendances,
      sourceLectures,
      insertedAttendanceEventIds: this.readStringArray(
        value,
        'insertedAttendanceEventIds',
      ),
      insertedLectureEventIds: this.readStringArray(
        value,
        'insertedLectureEventIds',
      ),
      movedEventSubscriptionIds: this.readStringArray(
        value,
        'movedEventSubscriptionIds',
      ),
      movedEventGroupSubscriptionIds:
        value.movedEventGroupSubscriptionIds === undefined
          ? []
          : this.readStringArray(value, 'movedEventGroupSubscriptionIds'),
      movedMajorEventSubscriptionIds: this.readStringArray(
        value,
        'movedMajorEventSubscriptionIds',
      ),
    };
  }

  private normalizeCpf(rawValue: string | null): string | null {
    if (!rawValue) {
      return null;
    }

    const digits = rawValue.replace(/\D/g, '');
    if (digits.length !== 11) {
      return null;
    }

    return digits;
  }

  private isValidCpf(cpf: string): boolean {
    if (!/^\d{11}$/.test(cpf)) {
      return false;
    }

    if (/^(\d)\1{10}$/.test(cpf)) {
      return false;
    }

    const firstVerifier = this.calculateCpfVerifierDigit(cpf.slice(0, 9), 10);
    const secondVerifier = this.calculateCpfVerifierDigit(cpf.slice(0, 10), 11);

    return (
      cpf[9] === String(firstVerifier) && cpf[10] === String(secondVerifier)
    );
  }

  private calculateCpfVerifierDigit(base: string, factorStart: number): number {
    const sum = [...base].reduce((total, value, index) => {
      const digit = Number(value);
      return total + digit * (factorStart - index);
    }, 0);

    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }

  private normalizeEmail(rawValue: string | null): string | null {
    const email = rawValue?.trim().toLowerCase();
    return email || null;
  }

  private mergeSecondaryEmails(
    migrateFields: PersonMergeField[],
    targetPerson: People,
    sourcePerson: People,
  ): string[] {
    const finalPrimaryEmail = migrateFields.includes('EMAIL')
      ? this.ensureMigratableValue(sourcePerson.email, 'EMAIL')
      : targetPerson.email;
    const normalizedFinalPrimaryEmail = this.normalizeEmail(finalPrimaryEmail);
    const nextSecondaryEmails = [...targetPerson.secondaryEmails];
    const knownEmails = new Set(
      [finalPrimaryEmail, ...targetPerson.secondaryEmails]
        .map((email) => this.normalizeEmail(email))
        .filter((email): email is string => email !== null),
    );

    for (const email of [targetPerson.email, sourcePerson.email]) {
      const trimmedEmail = email?.trim();
      const normalizedEmail = this.normalizeEmail(email);

      if (
        !trimmedEmail ||
        !normalizedEmail ||
        normalizedEmail === normalizedFinalPrimaryEmail ||
        knownEmails.has(normalizedEmail)
      ) {
        continue;
      }

      nextSecondaryEmails.push(trimmedEmail);
      knownEmails.add(normalizedEmail);
    }

    return nextSecondaryEmails.length === targetPerson.secondaryEmails.length
      ? targetPerson.secondaryEmails
      : nextSecondaryEmails;
  }

  private normalizeName(rawValue: string): string {
    return rawValue
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private readArray(record: Record<string, Prisma.JsonValue>, key: string) {
    const value = record[key];
    if (!Array.isArray(value)) {
      throw new ConflictException(`Invalid ${key} payload.`);
    }
    return value;
  }

  private readStringArray(
    record: Record<string, Prisma.JsonValue>,
    key: string,
  ) {
    return this.readArray(record, key).map((entry) => {
      if (typeof entry !== 'string') {
        throw new ConflictException(`Invalid ${key} payload entry.`);
      }
      return entry;
    });
  }

  private readRequiredString(
    record: Record<string, Prisma.JsonValue>,
    key: string,
  ): string {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new ConflictException(`Invalid ${key} payload value.`);
    }
    return value;
  }

  private readNullableString(
    record: Record<string, Prisma.JsonValue>,
    key: string,
  ): string | null {
    const value = record[key];
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new ConflictException(`Invalid ${key} payload value.`);
    }
    return value;
  }

  private isRecord(
    value: Prisma.JsonValue,
  ): value is Record<string, Prisma.JsonValue> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private ensureMigratableValue(
    value: string | null,
    field: PersonMergeField,
  ): string {
    if (value === null) {
      throw new UnprocessableEntityException(
        `Cannot migrate ${field} because source value is null.`,
      );
    }

    const normalized = value.trim();
    if (!normalized) {
      throw new UnprocessableEntityException(
        `Cannot migrate ${field} because source value is empty.`,
      );
    }

    return normalized;
  }
}
