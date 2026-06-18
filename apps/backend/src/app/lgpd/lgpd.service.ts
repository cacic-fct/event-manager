import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

type LgpdCategoryData = Record<string, unknown>;
type LgpdUserLookup = { userId: string; email?: string };
type LgpdResolvedPerson = Prisma.PeopleGetPayload<{
  include: { user: true; mergedFrom: true; mergedInto: true };
}>;
type DataSubjectResolution = {
  userIds: string[];
  personIds: string[];
  people: LgpdResolvedPerson[];
};

@Injectable()
export class LgpdService {
  private readonly logger = new Logger(LgpdService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async collectUserData(input: { userId: string; email?: string }): Promise<Record<string, LgpdCategoryData>> {
    const dataSubject = await this.resolveDataSubject(input);
    const { people, personIds, userIds } = dataSubject;

    const userWhere = { OR: [{ oldUserId: { in: userIds } }, { newUserId: { in: userIds } }] };
    const [
      accountUsers,
      accountUserMerges,
      externalAccountMergeOperations,
      eventSubscriptions,
      eventGroupSubscriptions,
      majorEventSubscriptions,
      attendances,
      lectures,
      certificates,
      majorEventReceipts,
      receiptValidationActions,
      mergeOperations,
      mergeCandidates,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.accountUserMerge.findMany({
        where: userWhere,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.externalAccountMergeOperation.findMany({
        where: userWhere,
        orderBy: { occurredAt: 'desc' },
      }),
      personIds.length > 0 ? this.prisma.eventSubscription.findMany({
        where: { personId: { in: personIds } },
        include: { event: true, eventGroupSubscription: true },
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.eventGroupSubscription.findMany({
        where: { personId: { in: personIds } },
        include: { eventGroup: true, eventSubscriptions: true },
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.majorEventSubscription.findMany({
        where: { personId: { in: personIds } },
        include: {
          majorEvent: true,
          selectedEvents: {
            include: { event: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.eventAttendance.findMany({
        where: { personId: { in: personIds } },
        include: { event: true },
        orderBy: { attendedAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.eventLecturer.findMany({
        where: { personId: { in: personIds } },
        include: { event: true },
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.certificate.findMany({
        where: { personId: { in: personIds } },
        include: {
          config: true,
          certificateTemplate: true,
        },
        orderBy: { issuedAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.majorEventReceipt.findMany({
        where: { personId: { in: personIds } },
        include: {
          subscription: {
            include: {
              majorEvent: true,
            },
          },
          validationActions: true,
        },
        orderBy: { uploadedAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.majorEventReceiptValidationAction.findMany({
        where: {
          subscription: { personId: { in: personIds } },
        },
        include: {
          receipt: true,
          subscription: {
            include: {
              majorEvent: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.peopleMergeOperation.findMany({
        where: {
          OR: [{ targetPersonId: { in: personIds } }, { sourcePersonId: { in: personIds } }],
        },
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.mergeCandidate.findMany({
        where: {
          OR: [{ personAId: { in: personIds } }, { personBId: { in: personIds } }],
        },
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
    ]);

    return {
      metadata: this.metadata(input, dataSubject),
      accountUsers: { records: accountUsers },
      people: { records: people },
      subscriptions: {
        eventSubscriptions,
        eventGroupSubscriptions,
        majorEventSubscriptions,
      },
      attendances: { records: attendances },
      lecturerActivities: { records: lectures },
      certificates: { records: certificates },
      receipts: {
        majorEventReceipts,
        receiptValidationActions,
      },
      mergeHistory: {
        mergeOperations,
        mergeCandidates,
        accountUserMerges,
        externalAccountMergeOperations,
      },
    };
  }

  async scheduleDeletion(input: { userId: string; email?: string; requestId: string; scheduledHardDeleteAt?: string }) {
    const { personIds } = await this.resolveDataSubject(input);
    if (personIds.length === 0) {
      return { success: true, peopleUpdated: 0, recordsUpdated: 0 };
    }

    const receiptObjectKeys = await this.findReceiptObjectKeys(personIds);
    await this.deleteReceiptObjects(receiptObjectKeys);

    const now = new Date();
    const [
      people,
      eventSubscriptions,
      eventGroupSubscriptions,
      receiptValidationActions,
      majorEventReceipts,
      majorEventSubscriptions,
      selections,
      certificates,
    ] =
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
        this.prisma.majorEventReceiptValidationAction.deleteMany({
          where: { subscription: { personId: { in: personIds } } },
        }),
        this.prisma.majorEventReceipt.deleteMany({
          where: { personId: { in: personIds } },
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
      receiptValidationActions.count +
      majorEventReceipts.count +
      majorEventSubscriptions.count +
      selections.count +
      certificates.count;

    this.logger.log(
      `Scheduled LGPD deletion request=${input.requestId}, user=${input.userId}, people=${people.count}, related=${recordsUpdated}.`,
    );

    return { success: true, peopleUpdated: people.count, recordsUpdated };
  }

  async hardDelete(input: { userId: string; email?: string; requestId: string }) {
    const { personIds, userIds } = await this.resolveDataSubject(input);
    if (personIds.length === 0 && userIds.length === 0) {
      return { success: true, peopleDeleted: 0, usersDeleted: 0, recordsDeleted: 0 };
    }

    const receiptObjectKeys = await this.findReceiptObjectKeys(personIds);
    await this.deleteReceiptObjects(receiptObjectKeys);

    const result = await this.prisma.$transaction(async (tx) => {
      const certificates = await tx.certificate.deleteMany({ where: { personId: { in: personIds } } });
      const selections = await tx.majorEventSubscriptionEventSelection.deleteMany({
        where: { subscription: { personId: { in: personIds } } },
      });
      const receiptValidationActions = await tx.majorEventReceiptValidationAction.deleteMany({
        where: { subscription: { personId: { in: personIds } } },
      });
      const majorEventReceipts = await tx.majorEventReceipt.deleteMany({ where: { personId: { in: personIds } } });
      const eventSubscriptions = await tx.eventSubscription.deleteMany({ where: { personId: { in: personIds } } });
      const eventGroupSubscriptions = await tx.eventGroupSubscription.deleteMany({ where: { personId: { in: personIds } } });
      const majorEventSubscriptions = await tx.majorEventSubscription.deleteMany({ where: { personId: { in: personIds } } });
      const attendances = await tx.eventAttendance.deleteMany({ where: { personId: { in: personIds } } });
      const lecturers = await tx.eventLecturer.deleteMany({ where: { personId: { in: personIds } } });
      await tx.externalAccountMergeOperation.deleteMany({
        where: { OR: [{ oldUserId: { in: userIds } }, { newUserId: { in: userIds } }] },
      });
      await tx.peopleMergeOperation.deleteMany({
        where: { OR: [{ targetPersonId: { in: personIds } }, { sourcePersonId: { in: personIds } }] },
      });
      await tx.mergeCandidate.deleteMany({
        where: { OR: [{ personAId: { in: personIds } }, { personBId: { in: personIds } }] },
      });
      await tx.accountUserMerge.deleteMany({
        where: { OR: [{ oldUserId: { in: userIds } }, { newUserId: { in: userIds } }] },
      });
      const people = await tx.people.deleteMany({ where: { id: { in: personIds } } });
      const users = await tx.user.deleteMany({ where: { id: { in: userIds } } });

      return {
        peopleDeleted: people.count,
        usersDeleted: users.count,
        recordsDeleted:
          certificates.count +
          selections.count +
          receiptValidationActions.count +
          majorEventReceipts.count +
          eventSubscriptions.count +
          eventGroupSubscriptions.count +
          majorEventSubscriptions.count +
          attendances.count +
          lecturers.count,
      };
    });

    this.logger.log(
      `Hard-deleted LGPD data request=${input.requestId}, user=${input.userId}, people=${result.peopleDeleted}, users=${result.usersDeleted}, related=${result.recordsDeleted}.`,
    );

    return { success: true, ...result };
  }

  private async resolveDataSubject(input: LgpdUserLookup): Promise<DataSubjectResolution> {
    const userIds = new Set<string>();
    const personIds = new Set<string>();
    const emails = new Set<string>();
    const queriedEmails = new Set<string>();
    const initialUserId = input.userId.trim();
    const initialEmail = this.normalizeEmail(input.email);

    if (initialUserId) {
      userIds.add(initialUserId);
    }
    if (initialEmail) {
      emails.add(initialEmail);
    }

    let changed = true;
    while (changed) {
      changed = false;
      changed = (await this.expandUsers(userIds, emails)) || changed;
      changed = (await this.expandAccountMerges(userIds)) || changed;
      changed = (await this.expandPeopleByEmail(personIds, emails, queriedEmails)) || changed;
      changed = (await this.expandPeople(userIds, personIds, emails)) || changed;
    }

    const people = await this.findPeopleByIds([...personIds]);

    return {
      userIds: [...userIds],
      personIds: people.map((person) => person.id),
      people,
    };
  }

  private async expandUsers(userIds: Set<string>, emails: Set<string>): Promise<boolean> {
    let changed = false;

    if (userIds.size > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, email: true },
      });

      for (const user of users) {
        changed = this.add(userIds, user.id) || changed;
        const email = this.normalizeEmail(user.email);
        if (email) {
          changed = this.add(emails, email) || changed;
        }
      }
    }

    if (emails.size > 0) {
      const users = await this.prisma.user.findMany({
        where: {
          OR: [...emails].map((email) => ({
            email: {
              equals: email,
              mode: 'insensitive' as const,
            },
          })),
        },
        select: { id: true, email: true },
      });

      for (const user of users) {
        changed = this.add(userIds, user.id) || changed;
        const email = this.normalizeEmail(user.email);
        if (email) {
          changed = this.add(emails, email) || changed;
        }
      }
    }

    return changed;
  }

  private async expandAccountMerges(userIds: Set<string>): Promise<boolean> {
    if (userIds.size === 0) {
      return false;
    }

    let changed = false;
    const ids = [...userIds];
    const [accountUserMerges, externalAccountMergeOperations] = await Promise.all([
      this.prisma.accountUserMerge.findMany({
        where: { OR: [{ oldUserId: { in: ids } }, { newUserId: { in: ids } }] },
        select: { oldUserId: true, newUserId: true },
      }),
      this.prisma.externalAccountMergeOperation.findMany({
        where: {
          status: 'APPLIED',
          OR: [{ oldUserId: { in: ids } }, { newUserId: { in: ids } }],
        },
        select: { oldUserId: true, newUserId: true },
      }),
    ]);

    for (const merge of [...accountUserMerges, ...externalAccountMergeOperations]) {
      changed = this.add(userIds, merge.oldUserId) || changed;
      changed = this.add(userIds, merge.newUserId) || changed;
    }

    return changed;
  }

  private async expandPeopleByEmail(
    personIds: Set<string>,
    emails: Set<string>,
    queriedEmails: Set<string>,
  ): Promise<boolean> {
    let changed = false;

    for (const email of emails) {
      if (queriedEmails.has(email)) {
        continue;
      }

      queriedEmails.add(email);
      const people = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM people
        WHERE lower(email) = ${email}
          OR EXISTS (
            SELECT 1
            FROM unnest("secondaryEmails") AS secondary_email(email)
            WHERE lower(secondary_email.email) = ${email}
          )
      `;

      for (const person of people) {
        changed = this.add(personIds, person.id) || changed;
      }
    }

    return changed;
  }

  private async expandPeople(
    userIds: Set<string>,
    personIds: Set<string>,
    emails: Set<string>,
  ): Promise<boolean> {
    const where = this.peopleResolutionWhere(userIds, personIds);
    if (!where) {
      return false;
    }

    let changed = false;
    const people = await this.prisma.people.findMany({
      where,
      select: {
        id: true,
        userId: true,
        externalRef: true,
        mergedIntoId: true,
        email: true,
        secondaryEmails: true,
      },
    });

    for (const person of people) {
      changed = this.add(personIds, person.id) || changed;
      if (person.mergedIntoId) {
        changed = this.add(personIds, person.mergedIntoId) || changed;
      }
      if (person.userId) {
        changed = this.add(userIds, person.userId) || changed;
      }

      const externalUserId = this.fromKeycloakExternalRef(person.externalRef);
      if (externalUserId) {
        changed = this.add(userIds, externalUserId) || changed;
      }

      for (const email of [person.email, ...person.secondaryEmails]) {
        const normalizedEmail = this.normalizeEmail(email);
        if (normalizedEmail) {
          changed = this.add(emails, normalizedEmail) || changed;
        }
      }
    }

    return changed;
  }

  private peopleResolutionWhere(userIds: Set<string>, personIds: Set<string>): Prisma.PeopleWhereInput | null {
    const conditions: Prisma.PeopleWhereInput[] = [];
    const ids = [...userIds];
    const people = [...personIds];

    if (ids.length > 0) {
      conditions.push({ userId: { in: ids } });
      conditions.push({ externalRef: { in: ids.map((userId) => this.toKeycloakExternalRef(userId)) } });
    }

    if (people.length > 0) {
      conditions.push({ id: { in: people } });
      conditions.push({ mergedIntoId: { in: people } });
    }

    return conditions.length > 0 ? { OR: conditions } : null;
  }

  private async findPeopleByIds(personIds: string[]) {
    if (personIds.length === 0) {
      return [];
    }

    return this.prisma.people.findMany({
      where: {
        id: { in: personIds },
      },
      include: { user: true, mergedFrom: true, mergedInto: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  private metadata(input: { userId: string; email?: string }, dataSubject: { userIds: string[]; personIds: string[] }) {
    return {
      generatedAt: new Date().toISOString(),
      source: 'event_manager',
      userId: input.userId,
      email: input.email ?? null,
      resolvedUserIds: dataSubject.userIds,
      personIds: dataSubject.personIds,
      note: 'Event Manager stores event data on person records linked to account users.',
    };
  }

  private async findReceiptObjectKeys(personIds: string[]): Promise<string[]> {
    if (personIds.length === 0) {
      return [];
    }

    const receipts = await this.prisma.majorEventReceipt.findMany({
      where: { personId: { in: personIds } },
      select: { objectKey: true },
    });

    return receipts.map((receipt) => receipt.objectKey);
  }

  private async deleteReceiptObjects(objectKeys: string[]): Promise<void> {
    const uniqueObjectKeys = Array.from(new Set(objectKeys));

    for (const objectKey of uniqueObjectKeys) {
      await this.s3.deleteFile(objectKey);
    }
  }

  private normalizeEmail(email?: string | null): string | null {
    const normalized = email?.trim().toLowerCase();
    return normalized || null;
  }

  private toKeycloakExternalRef(userId: string): string {
    return `kc:${userId}`;
  }

  private fromKeycloakExternalRef(externalRef?: string | null): string | null {
    const prefix = 'kc:';
    if (!externalRef?.startsWith(prefix)) {
      return null;
    }

    return externalRef.slice(prefix.length).trim() || null;
  }

  private add(values: Set<string>, value: string): boolean {
    if (values.has(value)) {
      return false;
    }

    values.add(value);
    return true;
  }

}
