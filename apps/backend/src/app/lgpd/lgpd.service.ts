import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type LgpdCategoryData = Record<string, unknown>;

@Injectable()
export class LgpdService {
  private readonly logger = new Logger(LgpdService.name);

  constructor(private readonly prisma: PrismaService) {}

  async collectUserData(input: { userId: string; email?: string }): Promise<Record<string, LgpdCategoryData>> {
    const people = await this.findUserPeople(input);
    const personIds = people.map((person) => person.id);

    if (personIds.length === 0) {
      return {
        metadata: this.metadata(input, personIds),
        people: { records: [] },
      };
    }

    const [
      eventSubscriptions,
      eventGroupSubscriptions,
      majorEventSubscriptions,
      attendances,
      lectures,
      certificates,
      mergeOperations,
      mergeCandidates,
    ] = await Promise.all([
      this.prisma.eventSubscription.findMany({
        where: { personId: { in: personIds } },
        include: { event: true, eventGroupSubscription: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.eventGroupSubscription.findMany({
        where: { personId: { in: personIds } },
        include: { eventGroup: true, eventSubscriptions: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.majorEventSubscription.findMany({
        where: { personId: { in: personIds } },
        include: {
          majorEvent: true,
          selectedEvents: {
            include: { event: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.eventAttendance.findMany({
        where: { personId: { in: personIds } },
        include: { event: true },
        orderBy: { attendedAt: 'desc' },
      }),
      this.prisma.eventLecturer.findMany({
        where: { personId: { in: personIds } },
        include: { event: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.certificate.findMany({
        where: { personId: { in: personIds } },
        include: {
          config: true,
          certificateTemplate: true,
        },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.peopleMergeOperation.findMany({
        where: {
          OR: [{ targetPersonId: { in: personIds } }, { sourcePersonId: { in: personIds } }],
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mergeCandidate.findMany({
        where: {
          OR: [{ personAId: { in: personIds } }, { personBId: { in: personIds } }],
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      metadata: this.metadata(input, personIds),
      people: { records: people },
      subscriptions: {
        eventSubscriptions,
        eventGroupSubscriptions,
        majorEventSubscriptions,
      },
      attendances: { records: attendances },
      lecturerActivities: { records: lectures },
      certificates: { records: certificates },
      mergeHistory: {
        mergeOperations,
        mergeCandidates,
      },
    };
  }

  async scheduleDeletion(input: { userId: string; email?: string; requestId: string; scheduledHardDeleteAt?: string }) {
    const personIds = (await this.findUserPeople(input)).map((person) => person.id);
    if (personIds.length === 0) {
      return { success: true, peopleUpdated: 0, recordsUpdated: 0 };
    }

    const now = new Date();
    const [people, eventSubscriptions, eventGroupSubscriptions, majorEventSubscriptions, selections, certificates] =
      await this.prisma.$transaction([
        this.prisma.people.updateMany({
          where: { id: { in: personIds }, deletedAt: null },
          data: { deletedAt: now, updatedById: input.userId },
        }),
        this.prisma.eventSubscription.updateMany({
          where: { personId: { in: personIds }, deletedAt: null },
          data: { deletedAt: now },
        }),
        this.prisma.eventGroupSubscription.updateMany({
          where: { personId: { in: personIds }, deletedAt: null },
          data: { deletedAt: now },
        }),
        this.prisma.majorEventSubscription.updateMany({
          where: { personId: { in: personIds }, deletedAt: null },
          data: { deletedAt: now },
        }),
        this.prisma.majorEventSubscriptionEventSelection.updateMany({
          where: {
            subscription: { personId: { in: personIds } },
            deletedAt: null,
          },
          data: { deletedAt: now },
        }),
        this.prisma.certificate.updateMany({
          where: { personId: { in: personIds }, deletedAt: null },
          data: { deletedAt: now },
        }),
      ]);

    const recordsUpdated =
      eventSubscriptions.count +
      eventGroupSubscriptions.count +
      majorEventSubscriptions.count +
      selections.count +
      certificates.count;

    this.logger.log(
      `Scheduled LGPD deletion request=${input.requestId}, user=${input.userId}, people=${people.count}, related=${recordsUpdated}.`,
    );

    return { success: true, peopleUpdated: people.count, recordsUpdated };
  }

  async hardDelete(input: { userId: string; email?: string; requestId: string }) {
    const personIds = (await this.findUserPeople(input)).map((person) => person.id);
    if (personIds.length === 0) {
      return { success: true, peopleDeleted: 0, recordsDeleted: 0 };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const certificates = await tx.certificate.deleteMany({ where: { personId: { in: personIds } } });
      const selections = await tx.majorEventSubscriptionEventSelection.deleteMany({
        where: { subscription: { personId: { in: personIds } } },
      });
      const eventSubscriptions = await tx.eventSubscription.deleteMany({ where: { personId: { in: personIds } } });
      const eventGroupSubscriptions = await tx.eventGroupSubscription.deleteMany({ where: { personId: { in: personIds } } });
      const majorEventSubscriptions = await tx.majorEventSubscription.deleteMany({ where: { personId: { in: personIds } } });
      const attendances = await tx.eventAttendance.deleteMany({ where: { personId: { in: personIds } } });
      const lecturers = await tx.eventLecturer.deleteMany({ where: { personId: { in: personIds } } });
      await tx.mergeCandidate.deleteMany({
        where: { OR: [{ personAId: { in: personIds } }, { personBId: { in: personIds } }] },
      });
      await tx.externalAccountMergeOperation.deleteMany({
        where: { OR: [{ oldUserId: input.userId }, { newUserId: input.userId }] },
      });
      await tx.peopleMergeOperation.deleteMany({
        where: { OR: [{ targetPersonId: { in: personIds } }, { sourcePersonId: { in: personIds } }] },
      });
      await tx.accountUserMerge.deleteMany({
        where: { OR: [{ oldUserId: input.userId }, { newUserId: input.userId }] },
      });
      const people = await tx.people.deleteMany({ where: { id: { in: personIds } } });
      await tx.user.deleteMany({ where: { id: input.userId } });

      return {
        peopleDeleted: people.count,
        recordsDeleted:
          certificates.count +
          selections.count +
          eventSubscriptions.count +
          eventGroupSubscriptions.count +
          majorEventSubscriptions.count +
          attendances.count +
          lecturers.count,
      };
    });

    this.logger.log(
      `Hard-deleted LGPD data request=${input.requestId}, user=${input.userId}, people=${result.peopleDeleted}, related=${result.recordsDeleted}.`,
    );

    return { success: true, ...result };
  }

  private async findUserPeople(input: { userId: string; email?: string }) {
    return this.prisma.people.findMany({
      where: {
        userId: input.userId,
      },
      include: { user: true, mergedFrom: true, mergedInto: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private metadata(input: { userId: string; email?: string }, personIds: string[]) {
    return {
      generatedAt: new Date().toISOString(),
      source: 'event_manager',
      userId: input.userId,
      email: input.email ?? null,
      personIds,
      note: 'Event Manager stores event data on person records linked to account users.',
    };
  }

}
