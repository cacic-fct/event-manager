import { MergeCandidateMergeInput } from '@cacic-fct/shared-data-types';
import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CertificateIssuingService } from '../../certificate/certificate-issuing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { stalePendingMergeCandidateWhere } from './merge-candidate-filters';
import { collectCpfMatches, collectEmailMatches, collectNameMatches } from './operations/matching';
import { buildTargetMigrationData, normalizeMigrateFields } from './operations/migration';
import { moveRelations } from './operations/relations';
import { parseMovedRelations, parsePersonSnapshot, toPersonSnapshot, toPersonUpdateData } from './operations/snapshots';
import { CandidateMatch } from './operations/types';

@Injectable()
export class MergeCandidateOperationsService {
  private readonly logger = new Logger(MergeCandidateOperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly certificateIssuingService: CertificateIssuingService,
  ) {}

  async scanMergeCandidates(actorId: string | null): Promise<number> {
    const staleResult = await this.prisma.mergeCandidate.updateMany({
      where: stalePendingMergeCandidateWhere,
      data: {
        status: 'STALE',
        updatedById: actorId ?? undefined,
      },
    });

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
    collectCpfMatches(people, matches);
    collectEmailMatches(people, matches);
    collectNameMatches(people, matches);

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

    const existingByPairKey = new Map(existingCandidates.map((candidate) => [candidate.pairKey, candidate]));

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

      if (existingCandidate.status !== 'PENDING' && existingCandidate.status !== 'STALE') {
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
          status: 'PENDING',
          updatedById: actorId ?? undefined,
        },
      });
      touchedCandidates += 1;
    }

    return touchedCandidates + staleResult.count;
  }

  async mergeCandidatePeople(input: MergeCandidateMergeInput, actorId: string | null) {
    const migrateFields = normalizeMigrateFields(input.migrateFields);

    const mergeResult = await this.prisma.$transaction(async (tx) => {
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
        throw new NotFoundException(`Merge candidate ${input.candidateId} was not found.`);
      }

      if (candidate.status !== 'PENDING') {
        throw new ConflictException(`Merge candidate ${candidate.id} is not pending anymore.`);
      }

      if (input.targetPersonId !== candidate.personAId && input.targetPersonId !== candidate.personBId) {
        throw new UnprocessableEntityException('The selected target person does not belong to this merge candidate.');
      }

      const sourcePersonId = input.targetPersonId === candidate.personAId ? candidate.personBId : candidate.personAId;

      const [targetPerson, sourcePerson] = await Promise.all([
        tx.people.findUnique({
          where: { id: input.targetPersonId },
        }),
        tx.people.findUnique({
          where: { id: sourcePersonId },
        }),
      ]);

      if (!targetPerson) {
        throw new NotFoundException(`Target person ${input.targetPersonId} was not found.`);
      }

      if (!sourcePerson) {
        throw new NotFoundException(`Source person ${sourcePersonId} was not found.`);
      }

      if (targetPerson.deletedAt || targetPerson.mergedIntoId) {
        throw new ConflictException(`Target person ${targetPerson.id} is not available for merge.`);
      }

      if (sourcePerson.deletedAt || sourcePerson.mergedIntoId) {
        throw new ConflictException(`Source person ${sourcePerson.id} is not available for merge.`);
      }

      const targetSnapshot = toPersonSnapshot(targetPerson);
      const sourceSnapshot = toPersonSnapshot(sourcePerson);
      const targetMigrationData = buildTargetMigrationData(migrateFields, targetPerson, sourcePerson);

      const movedRelations = await moveRelations(tx, targetPerson.id, sourcePerson.id);

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

    await this.refreshCertificatesAfterMerge(
      input.targetPersonId,
      mergeResult.personAId === input.targetPersonId ? mergeResult.personBId : mergeResult.personAId,
      actorId,
    );

    return mergeResult;
  }

  async undoMergeCandidatePeople(candidateId: string, actorId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.mergeCandidate.findUnique({
        where: {
          id: candidateId,
        },
      });

      if (!candidate) {
        throw new NotFoundException(`Merge candidate ${candidateId} was not found.`);
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
        throw new NotFoundException(`No applied merge operation was found for merge candidate ${candidateId}.`);
      }

      const targetSnapshot = parsePersonSnapshot(operation.targetSnapshot, 'targetSnapshot');
      const sourceSnapshot = parsePersonSnapshot(operation.sourceSnapshot, 'sourceSnapshot');
      const movedRelations = parseMovedRelations(operation.movedRelations);

      const [targetPerson, sourcePerson] = await Promise.all([
        tx.people.findUnique({ where: { id: operation.targetPersonId } }),
        tx.people.findUnique({ where: { id: operation.sourcePersonId } }),
      ]);

      if (!targetPerson || !sourcePerson) {
        throw new NotFoundException(`Merge operation ${operation.id} references missing people.`);
      }

      if (sourcePerson.mergedIntoId !== targetPerson.id) {
        throw new ConflictException(`Source person ${sourcePerson.id} is not merged into target ${targetPerson.id}.`);
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
          ...toPersonUpdateData(targetSnapshot),
          updatedById: actorId ?? undefined,
        },
      });

      await tx.people.update({
        where: {
          id: sourcePerson.id,
        },
        data: {
          ...toPersonUpdateData(sourceSnapshot),
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

  private async refreshCertificatesAfterMerge(
    targetPersonId: string,
    sourcePersonId: string,
    actorId: string | null,
  ): Promise<void> {
    try {
      await this.certificateIssuingService.refreshIssuedCertificatesAfterPeopleMerge(
        targetPersonId,
        sourcePersonId,
        actorId ?? undefined,
      );
    } catch (error) {
      this.logger.error(
        `Failed to refresh certificates after people merge target=${targetPersonId}, source=${sourcePersonId}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
