import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { S3Service } from '../s3/s3.service';
import {
  anonymizeAuditEntries,
  buildAnonymizedAuditSubjectId,
  buildAuditLogSubjectWhere,
  synchronizeAnonymizedAuditEntries,
} from './lgpd-audit-anonymization';
import { resolveDataSubject } from './lgpd-data-subject';
import { anonymizeEventDrafts, buildEventDraftSubjectWhere } from './lgpd-event-drafts';
import {
  mapAuditLogEntryForExport,
  mapOfflineSubmissionForExport,
  mapPersonForExport,
  selectManyForExport,
} from './lgpd-export-mappers';
import {
  anonymizeOfflineAttendanceSubmissions,
  buildOfflineSubmissionSubjectWhere,
} from './lgpd-offline-submissions';
import { deleteReceiptObjects, findReceiptObjectKeys } from './lgpd-receipts';
import {
  LGPD_ACCOUNT_USER_MERGE_SELECT,
  LGPD_ACCOUNT_USER_SELECT,
  LGPD_AUDIT_LOG_SELECT,
  LGPD_CERTIFICATE_SELECT,
  LGPD_EVENT_ATTENDANCE_SELECT,
  LGPD_EVENT_DRAFT_SELECT,
  LGPD_EVENT_GROUP_SUBSCRIPTION_SELECT,
  LGPD_EVENT_LECTURER_SELECT,
  LGPD_EVENT_SUBSCRIPTION_SELECT,
  LGPD_EXTERNAL_ACCOUNT_MERGE_OPERATION_SELECT,
  LGPD_MAJOR_EVENT_RECEIPT_SELECT,
  LGPD_MAJOR_EVENT_SUBSCRIPTION_SELECT,
  LGPD_MERGE_CANDIDATE_SELECT,
  LGPD_OFFLINE_ATTENDANCE_SUBMISSION_SELECT,
  LGPD_PEOPLE_MERGE_OPERATION_SELECT,
  LGPD_RECEIPT_VALIDATION_ACTION_SELECT,
  LgpdCategoryData,
} from './lgpd-records';

@Injectable()
export class LgpdService {
  private readonly logger = new Logger(LgpdService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  async collectUserData(input: { userId: string; email?: string }): Promise<Record<string, LgpdCategoryData>> {
    const dataSubject = await resolveDataSubject(this.prisma, input);
    const { people, personIds, userIds } = dataSubject;
    const offlineSubmissionWhere = buildOfflineSubmissionSubjectWhere(dataSubject);
    const eventDraftWhere = buildEventDraftSubjectWhere(dataSubject);

    const userWhere = { OR: [{ oldUserId: { in: userIds } }, { newUserId: { in: userIds } }] };
    const [
      accountUsers,
      accountUserMerges,
      externalAccountMergeOperations,
      eventSubscriptions,
      eventGroupSubscriptions,
      majorEventSubscriptions,
      attendances,
      offlineAttendanceSubmissions,
      lectures,
      certificates,
      majorEventReceipts,
      receiptValidationActions,
      mergeOperations,
      mergeCandidates,
      eventDrafts,
      auditLogEntries,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: LGPD_ACCOUNT_USER_SELECT,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.accountUserMerge.findMany({
        where: userWhere,
        select: LGPD_ACCOUNT_USER_MERGE_SELECT,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.externalAccountMergeOperation.findMany({
        where: userWhere,
        select: LGPD_EXTERNAL_ACCOUNT_MERGE_OPERATION_SELECT,
        orderBy: { occurredAt: 'desc' },
      }),
      personIds.length > 0 ? this.prisma.eventSubscription.findMany({
        where: { personId: { in: personIds } },
        select: LGPD_EVENT_SUBSCRIPTION_SELECT,
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.eventGroupSubscription.findMany({
        where: { personId: { in: personIds } },
        select: LGPD_EVENT_GROUP_SUBSCRIPTION_SELECT,
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.majorEventSubscription.findMany({
        where: { personId: { in: personIds } },
        select: LGPD_MAJOR_EVENT_SUBSCRIPTION_SELECT,
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.eventAttendance.findMany({
        where: { personId: { in: personIds } },
        select: LGPD_EVENT_ATTENDANCE_SELECT,
        orderBy: { attendedAt: 'desc' },
      }) : Promise.resolve([]),
      offlineSubmissionWhere
        ? this.prisma.offlineEventAttendanceSubmission.findMany({
            where: offlineSubmissionWhere,
            select: LGPD_OFFLINE_ATTENDANCE_SUBMISSION_SELECT,
            orderBy: { submittedAt: 'desc' },
          })
        : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.eventLecturer.findMany({
        where: { personId: { in: personIds } },
        select: LGPD_EVENT_LECTURER_SELECT,
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.certificate.findMany({
        where: { personId: { in: personIds } },
        select: LGPD_CERTIFICATE_SELECT,
        orderBy: { issuedAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.majorEventReceipt.findMany({
        where: { personId: { in: personIds } },
        select: LGPD_MAJOR_EVENT_RECEIPT_SELECT,
        orderBy: { uploadedAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.majorEventReceiptValidationAction.findMany({
        where: {
          subscription: { personId: { in: personIds } },
        },
        select: LGPD_RECEIPT_VALIDATION_ACTION_SELECT,
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.peopleMergeOperation.findMany({
        where: {
          OR: [{ targetPersonId: { in: personIds } }, { sourcePersonId: { in: personIds } }],
        },
        select: LGPD_PEOPLE_MERGE_OPERATION_SELECT,
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      personIds.length > 0 ? this.prisma.mergeCandidate.findMany({
        where: {
          OR: [{ personAId: { in: personIds } }, { personBId: { in: personIds } }],
        },
        select: LGPD_MERGE_CANDIDATE_SELECT,
        orderBy: { createdAt: 'desc' },
      }) : Promise.resolve([]),
      eventDraftWhere
        ? this.prisma.eventDraft.findMany({
            where: eventDraftWhere,
            select: LGPD_EVENT_DRAFT_SELECT,
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
      this.prisma.auditLogEntry.findMany({
        where: buildAuditLogSubjectWhere(dataSubject),
        select: LGPD_AUDIT_LOG_SELECT,
        orderBy: { lastRecordedAt: 'desc' },
      }),
    ]);

    return {
      metadata: this.metadata(input, dataSubject),
      accountUsers: { records: selectManyForExport(accountUsers, LGPD_ACCOUNT_USER_SELECT) },
      people: { records: people.map((person) => mapPersonForExport(person)) },
      subscriptions: {
        eventSubscriptions: selectManyForExport(eventSubscriptions, LGPD_EVENT_SUBSCRIPTION_SELECT),
        eventGroupSubscriptions: selectManyForExport(
          eventGroupSubscriptions,
          LGPD_EVENT_GROUP_SUBSCRIPTION_SELECT,
        ),
        majorEventSubscriptions: selectManyForExport(
          majorEventSubscriptions,
          LGPD_MAJOR_EVENT_SUBSCRIPTION_SELECT,
        ),
      },
      attendances: {
        records: selectManyForExport(attendances, LGPD_EVENT_ATTENDANCE_SELECT),
        offlineSubmissions: offlineAttendanceSubmissions.map((submission) =>
          mapOfflineSubmissionForExport(submission, dataSubject),
        ),
      },
      eventDrafts: { records: selectManyForExport(eventDrafts, LGPD_EVENT_DRAFT_SELECT) },
      lecturerActivities: { records: selectManyForExport(lectures, LGPD_EVENT_LECTURER_SELECT) },
      certificates: { records: selectManyForExport(certificates, LGPD_CERTIFICATE_SELECT) },
      receipts: {
        majorEventReceipts: selectManyForExport(majorEventReceipts, LGPD_MAJOR_EVENT_RECEIPT_SELECT),
        receiptValidationActions: selectManyForExport(
          receiptValidationActions,
          LGPD_RECEIPT_VALIDATION_ACTION_SELECT,
        ),
      },
      mergeHistory: {
        mergeOperations: selectManyForExport(mergeOperations, LGPD_PEOPLE_MERGE_OPERATION_SELECT),
        mergeCandidates: selectManyForExport(mergeCandidates, LGPD_MERGE_CANDIDATE_SELECT),
        accountUserMerges: selectManyForExport(accountUserMerges, LGPD_ACCOUNT_USER_MERGE_SELECT),
        externalAccountMergeOperations: selectManyForExport(
          externalAccountMergeOperations,
          LGPD_EXTERNAL_ACCOUNT_MERGE_OPERATION_SELECT,
        ),
      },
      auditHistory: { records: auditLogEntries.map((entry) => mapAuditLogEntryForExport(entry, dataSubject)) },
    };
  }

  async scheduleDeletion(input: { userId: string; email?: string; requestId: string }) {
    const dataSubject = await resolveDataSubject(this.prisma, input);
    const { personIds, userIds } = dataSubject;
    if (personIds.length === 0 && userIds.length === 0) {
      return { success: true, peopleUpdated: 0, recordsUpdated: 0 };
    }

    const receiptObjectKeys = await findReceiptObjectKeys(this.prisma, personIds);

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const people = await tx.people.updateMany({
        where: { id: { in: personIds }, deletedAt: null },
        data: { deletedAt: now, updatedById: input.userId },
      });
      const eventSubscriptions = await tx.eventSubscription.updateMany({
        where: { personId: { in: personIds }, deletedAt: null },
        data: { deletedAt: now },
      });
      const eventGroupSubscriptions = await tx.eventGroupSubscription.updateMany({
        where: { personId: { in: personIds }, deletedAt: null },
        data: { deletedAt: now },
      });
      const receiptValidationActions = await tx.majorEventReceiptValidationAction.deleteMany({
        where: { subscription: { personId: { in: personIds } } },
      });
      const majorEventReceipts = await tx.majorEventReceipt.deleteMany({
        where: { personId: { in: personIds } },
      });
      const majorEventSubscriptions = await tx.majorEventSubscription.updateMany({
        where: { personId: { in: personIds }, deletedAt: null },
        data: { deletedAt: now },
      });
      const selections = await tx.majorEventSubscriptionEventSelection.updateMany({
        where: {
          subscription: { personId: { in: personIds } },
          deletedAt: null,
        },
        data: { deletedAt: now },
      });
      const certificates = await tx.certificate.updateMany({
        where: { personId: { in: personIds }, deletedAt: null },
        data: { deletedAt: now },
      });
      const anonymizedSubjectId = buildAnonymizedAuditSubjectId(input.requestId);
      const offlineAttendanceSubmissions = await anonymizeOfflineAttendanceSubmissions(
        tx,
        dataSubject,
        anonymizedSubjectId,
      );
      const eventDrafts = await anonymizeEventDrafts(tx, dataSubject, anonymizedSubjectId);

      return {
        people,
        recordsUpdated:
          eventSubscriptions.count +
          eventGroupSubscriptions.count +
          receiptValidationActions.count +
          majorEventReceipts.count +
          majorEventSubscriptions.count +
          selections.count +
          certificates.count +
          offlineAttendanceSubmissions +
          eventDrafts,
      };
    });

    await deleteReceiptObjects(this.s3, this.logger, receiptObjectKeys);

    this.logger.log(
      `Scheduled LGPD deletion request=${input.requestId}, user=${input.userId}, people=${result.people.count}, related=${result.recordsUpdated}.`,
    );

    return { success: true, peopleUpdated: result.people.count, recordsUpdated: result.recordsUpdated };
  }

  async hardDelete(input: { userId: string; email?: string; requestId: string }) {
    const dataSubject = await resolveDataSubject(this.prisma, input);
    const { people: dataSubjectPeople, personIds, userIds } = dataSubject;
    if (personIds.length === 0 && userIds.length === 0) {
      return { success: true, peopleDeleted: 0, usersDeleted: 0, recordsDeleted: 0 };
    }

    const receiptObjectKeys = await findReceiptObjectKeys(this.prisma, personIds);

    const { anonymizedAuditEntryIds, ...result } = await this.prisma.$transaction(async (tx) => {
      const anonymizedSubjectId = buildAnonymizedAuditSubjectId(input.requestId);
      const anonymizedAuditEntryIds = await anonymizeAuditEntries(
        tx,
        {
          people: dataSubjectPeople,
          personIds,
          userIds,
          emails: dataSubject.emails,
        },
        anonymizedSubjectId,
      );
      const offlineAttendanceSubmissions = await anonymizeOfflineAttendanceSubmissions(
        tx,
        dataSubject,
        anonymizedSubjectId,
      );
      const eventDrafts = await anonymizeEventDrafts(tx, dataSubject, anonymizedSubjectId);
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
      const permissionGrants = await tx.eventManagerPermissionGrant.deleteMany({
        where: { userId: { in: userIds } },
      });
      const people = await tx.people.deleteMany({ where: { id: { in: personIds } } });
      const users = await tx.user.deleteMany({ where: { id: { in: userIds } } });

      return {
        anonymizedAuditEntryIds,
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
          lecturers.count +
          permissionGrants.count +
          offlineAttendanceSubmissions +
          eventDrafts,
      };
    });

    await synchronizeAnonymizedAuditEntries(this.prisma, this.typesenseSearch, this.logger, anonymizedAuditEntryIds);
    await deleteReceiptObjects(this.s3, this.logger, receiptObjectKeys);

    this.logger.log(
      `Hard-deleted LGPD data request=${input.requestId}, user=${input.userId}, people=${result.peopleDeleted}, users=${result.usersDeleted}, related=${result.recordsDeleted}.`,
    );

    return { success: true, ...result };
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


}
