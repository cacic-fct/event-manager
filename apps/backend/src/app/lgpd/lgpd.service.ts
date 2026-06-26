import { Injectable, Logger } from '@nestjs/common';
import { AuditLogEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { S3Service } from '../s3/s3.service';

type LgpdCategoryData = Record<string, unknown>;
type LgpdUserLookup = { userId: string; email?: string };
type LgpdResolvedPerson = Prisma.PeopleGetPayload<{
  include: { user: true; mergedFrom: true; mergedInto: true };
}>;
type DataSubjectResolution = {
  userIds: string[];
  personIds: string[];
  emails: string[];
  people: LgpdResolvedPerson[];
};

const ANONYMIZED_AUDIT_VALUE = '[ANONIMIZADO]';
const AUDIT_IDENTITY_FIELDS = new Set([
  'personId',
  'userId',
  'authorUserId',
  'submittedById',
  'createdById',
  'committedById',
  'updatedById',
  'revertedById',
  'receiptValidatedBy',
  'undoneById',
]);
const PERSONAL_AUDIT_FIELDS = new Set([
  'name',
  'email',
  'secondaryEmails',
  'phone',
  'identityDocument',
  'academicId',
  'externalRef',
]);

@Injectable()
export class LgpdService {
  private readonly logger = new Logger(LgpdService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  async collectUserData(input: { userId: string; email?: string }): Promise<Record<string, LgpdCategoryData>> {
    const dataSubject = await this.resolveDataSubject(input);
    const { people, personIds, userIds } = dataSubject;
    const offlineSubmissionWhere = this.buildOfflineSubmissionSubjectWhere(dataSubject);

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
      auditLogEntries,
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
      offlineSubmissionWhere
        ? this.prisma.offlineEventAttendanceSubmission.findMany({
            where: offlineSubmissionWhere,
            include: { event: true, person: true },
            orderBy: { submittedAt: 'desc' },
          })
        : Promise.resolve([]),
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
      this.prisma.auditLogEntry.findMany({
        where: this.buildAuditLogSubjectWhere(dataSubject),
        orderBy: { lastRecordedAt: 'desc' },
      }),
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
      attendances: { records: attendances, offlineSubmissions: offlineAttendanceSubmissions },
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
      auditHistory: { records: auditLogEntries },
    };
  }

  async scheduleDeletion(input: { userId: string; email?: string; requestId: string; scheduledHardDeleteAt?: string }) {
    const dataSubject = await this.resolveDataSubject(input);
    const { personIds, userIds } = dataSubject;
    if (personIds.length === 0 && userIds.length === 0) {
      return { success: true, peopleUpdated: 0, recordsUpdated: 0 };
    }

    const receiptObjectKeys = await this.findReceiptObjectKeys(personIds);

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
      const offlineAttendanceSubmissions = await this.anonymizeOfflineAttendanceSubmissions(
        tx,
        dataSubject,
        this.buildAnonymizedAuditSubjectId(input.requestId),
      );

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
          offlineAttendanceSubmissions,
      };
    });

    await this.deleteReceiptObjects(receiptObjectKeys);

    this.logger.log(
      `Scheduled LGPD deletion request=${input.requestId}, user=${input.userId}, people=${result.people.count}, related=${result.recordsUpdated}.`,
    );

    return { success: true, peopleUpdated: result.people.count, recordsUpdated: result.recordsUpdated };
  }

  async hardDelete(input: { userId: string; email?: string; requestId: string }) {
    const dataSubject = await this.resolveDataSubject(input);
    const { people: dataSubjectPeople, personIds, userIds } = dataSubject;
    if (personIds.length === 0 && userIds.length === 0) {
      return { success: true, peopleDeleted: 0, usersDeleted: 0, recordsDeleted: 0 };
    }

    const receiptObjectKeys = await this.findReceiptObjectKeys(personIds);

    const { anonymizedAuditEntryIds, ...result } = await this.prisma.$transaction(async (tx) => {
      const anonymizedAuditEntryIds = await this.anonymizeAuditEntries(
        tx,
        {
          people: dataSubjectPeople,
          personIds,
          userIds,
          emails: dataSubject.emails,
        },
        this.buildAnonymizedAuditSubjectId(input.requestId),
      );
      const offlineAttendanceSubmissions = await this.anonymizeOfflineAttendanceSubmissions(
        tx,
        dataSubject,
        this.buildAnonymizedAuditSubjectId(input.requestId),
      );
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
          offlineAttendanceSubmissions,
      };
    });

    await this.synchronizeAnonymizedAuditEntries(anonymizedAuditEntryIds);
    await this.deleteReceiptObjects(receiptObjectKeys);

    this.logger.log(
      `Hard-deleted LGPD data request=${input.requestId}, user=${input.userId}, people=${result.peopleDeleted}, users=${result.usersDeleted}, related=${result.recordsDeleted}.`,
    );

    return { success: true, ...result };
  }

  private async anonymizeAuditEntries(
    tx: Prisma.TransactionClient,
    dataSubject: DataSubjectResolution,
    anonymizedSubjectId: string,
  ): Promise<string[]> {
    const entries = await tx.auditLogEntry.findMany({
      where: this.buildAuditLogSubjectWhere(dataSubject),
    });
    const identifiers = [...new Set([...dataSubject.userIds, ...dataSubject.personIds])];
    const sensitiveValues = this.getSensitiveAuditValues(dataSubject);
    const identityValues = new Set(identifiers);

    const auditEntryUpdates = entries.map((entry) => {
      const actorMatches = entry.actorId != null && dataSubject.userIds.includes(entry.actorId);
      const entitySubjectMatches =
        (entry.entityType === AuditLogEntityType.PERSON && dataSubject.personIds.includes(entry.entityId)) ||
        this.isEventAttendanceAuditEntityForPerson(entry.entityType, entry.entityId, dataSubject.personIds);
      const payloadMatches =
        this.containsAuditIdentity(entry.before, identityValues, entry.entityType === AuditLogEntityType.PERSON) ||
        this.containsAuditIdentity(entry.after, identityValues, entry.entityType === AuditLogEntityType.PERSON) ||
        this.containsAuditIdentity(entry.changes, identityValues, false) ||
        this.containsAuditIdentity(entry.metadata, identityValues, false);
      const shouldScrubPayload = actorMatches || entitySubjectMatches || payloadMatches;

      return tx.auditLogEntry.update({
        where: { id: entry.id },
        data: {
          actorId: actorMatches ? null : entry.actorId,
          actorName: actorMatches ? 'Usuário anonimizado' : entry.actorName,
          actorEmail: actorMatches ? null : entry.actorEmail,
          entityId: entitySubjectMatches
            ? this.anonymizeAuditEntityId(entry.entityType, entry.entityId, dataSubject.personIds, anonymizedSubjectId)
            : entry.entityId,
          entityLabel: actorMatches || entitySubjectMatches || payloadMatches ? 'Dados anonimizados' : entry.entityLabel,
          before: shouldScrubPayload
            ? this.anonymizeNullableAuditJson(
                entry.before,
                sensitiveValues,
                identityValues,
                anonymizedSubjectId,
                entry.entityType === AuditLogEntityType.PERSON,
              )
            : undefined,
          after: shouldScrubPayload
            ? this.anonymizeNullableAuditJson(
                entry.after,
                sensitiveValues,
                identityValues,
                anonymizedSubjectId,
                entry.entityType === AuditLogEntityType.PERSON,
              )
            : undefined,
          changes: shouldScrubPayload
            ? this.anonymizeAuditJson(
                entry.changes,
                sensitiveValues,
                identityValues,
                anonymizedSubjectId,
                [],
                entry.entityType === AuditLogEntityType.PERSON,
              )
            : undefined,
          metadata:
            shouldScrubPayload && entry.metadata != null
              ? this.anonymizeAuditJson(entry.metadata, sensitiveValues, identityValues, anonymizedSubjectId, [], false)
              : undefined,
        },
      });
    });

    await Promise.all(auditEntryUpdates);
    return entries.map((entry) => entry.id);
  }

  private async synchronizeAnonymizedAuditEntries(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const entries = await this.prisma.auditLogEntry.findMany({
      where: {
        id: {
          in: [...ids],
        },
      },
    });
    await Promise.all(entries.map((entry) => this.typesenseSearch.upsertAuditLogEntry(entry)));
  }

  private buildAuditLogSubjectWhere(dataSubject: DataSubjectResolution): Prisma.AuditLogEntryWhereInput {
    const identifiers = [...new Set([...dataSubject.userIds, ...dataSubject.personIds])];
    const jsonIdentityConditions: Prisma.AuditLogEntryWhereInput[] = identifiers.flatMap((identifier) =>
      [...AUDIT_IDENTITY_FIELDS].flatMap((field) => [
        { before: { path: [field], equals: identifier } },
        { after: { path: [field], equals: identifier } },
        { metadata: { path: [field], equals: identifier } },
        { metadata: { path: ['offlineAttendanceAuthor', field], equals: identifier } },
      ]),
    );
    const eventAttendanceEntityConditions: Prisma.AuditLogEntryWhereInput[] = dataSubject.personIds.flatMap(
      (personId) => [
        {
          entityType: AuditLogEntityType.EVENT_ATTENDANCE,
          entityId: { startsWith: `${personId}:` },
        },
        {
          entityType: AuditLogEntityType.EVENT_ATTENDANCE,
          entityId: { startsWith: `${encodeURIComponent(personId)}:` },
        },
      ],
    );

    return {
      OR: [
        ...(dataSubject.userIds.length > 0 ? [{ actorId: { in: dataSubject.userIds } }] : []),
        ...(dataSubject.personIds.length > 0
          ? [
              {
                entityType: AuditLogEntityType.PERSON,
                entityId: { in: dataSubject.personIds },
              },
            ]
          : []),
        ...eventAttendanceEntityConditions,
        ...jsonIdentityConditions,
      ],
    };
  }

  private anonymizeAuditEntityId(
    entityType: AuditLogEntityType,
    entityId: string,
    personIds: readonly string[],
    anonymizedSubjectId: string,
  ): string {
    if (entityType === AuditLogEntityType.PERSON && personIds.includes(entityId)) {
      return anonymizedSubjectId;
    }

    if (entityType !== AuditLogEntityType.EVENT_ATTENDANCE) {
      return entityId;
    }

    const [personSegment, ...remainingSegments] = entityId.split(':');
    if (!personSegment || remainingSegments.length === 0) {
      return entityId;
    }

    const personId = this.decodeAuditEntityIdSegment(personSegment);
    if (!personIds.includes(personId)) {
      return entityId;
    }

    return [encodeURIComponent(anonymizedSubjectId), ...remainingSegments].join(':');
  }

  private buildAnonymizedAuditSubjectId(requestId: string): string {
    const normalizedRequestId = requestId.trim() || 'request';
    return `anonymized:${encodeURIComponent(normalizedRequestId)}`;
  }

  private isEventAttendanceAuditEntityForPerson(
    entityType: AuditLogEntityType,
    entityId: string,
    personIds: readonly string[],
  ): boolean {
    if (entityType !== AuditLogEntityType.EVENT_ATTENDANCE) {
      return false;
    }

    const [personSegment, ...remainingSegments] = entityId.split(':');
    if (!personSegment || remainingSegments.length === 0) {
      return false;
    }

    return personIds.includes(this.decodeAuditEntityIdSegment(personSegment));
  }

  private decodeAuditEntityIdSegment(segment: string): string {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }

  private getSensitiveAuditValues(dataSubject: DataSubjectResolution): Set<string> {
    const values = new Set<string>([...dataSubject.userIds, ...dataSubject.personIds]);
    for (const person of dataSubject.people) {
      for (const value of [
        person.name,
        person.email,
        ...person.secondaryEmails,
        person.phone,
        person.identityDocument,
        person.academicId,
        person.externalRef,
        person.user?.name,
        person.user?.email,
      ]) {
        if (typeof value === 'string' && value.length > 0) {
          values.add(value);
          values.add(value.toLowerCase());
        }
      }
    }
    return values;
  }

  private containsAuditIdentity(
    value: Prisma.JsonValue | null,
    identities: ReadonlySet<string>,
    personRoot: boolean,
    path: readonly string[] = [],
  ): boolean {
    if (typeof value === 'string') {
      return this.isAuditIdentityPath(path, personRoot) && identities.has(value);
    }
    if (Array.isArray(value)) {
      return value.some((child) => this.containsAuditIdentity(child, identities, personRoot, path));
    }
    if (value && typeof value === 'object') {
      const changedField = typeof value['field'] === 'string' ? value['field'] : null;
      return Object.entries(value as Record<string, Prisma.JsonValue>).some(([key, child]) => {
        const nextPath = [...path, key];
        if (
          (key === 'before' || key === 'after') &&
          changedField &&
          this.isAuditIdentityField(changedField, personRoot)
        ) {
          return this.containsAuditIdentity(child, identities, personRoot, [...path, changedField]);
        }
        return this.containsAuditIdentity(child, identities, personRoot, nextPath);
      });
    }
    return false;
  }

  private anonymizeNullableAuditJson(
    value: Prisma.JsonValue | null,
    sensitiveValues: ReadonlySet<string>,
    identityValues: ReadonlySet<string>,
    anonymizedSubjectId: string,
    personRoot: boolean,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return value === null
      ? Prisma.JsonNull
      : this.anonymizeAuditJson(value, sensitiveValues, identityValues, anonymizedSubjectId, [], personRoot);
  }

  private anonymizeAuditJson(
    value: Prisma.JsonValue,
    sensitiveValues: ReadonlySet<string>,
    identityValues: ReadonlySet<string>,
    anonymizedSubjectId: string,
    path: readonly string[],
    personRoot: boolean,
    identityContext = false,
  ): Prisma.InputJsonValue {
    if (typeof value === 'string') {
      if ((identityContext || this.isAuditIdentityPath(path, personRoot)) && identityValues.has(value)) {
        return anonymizedSubjectId;
      }
      return sensitiveValues.has(value) || sensitiveValues.has(value.toLowerCase()) ? ANONYMIZED_AUDIT_VALUE : value;
    }
    if (Array.isArray(value)) {
      return value.map((child) =>
        this.anonymizeAuditJson(
          child,
          sensitiveValues,
          identityValues,
          anonymizedSubjectId,
          path,
          personRoot,
          identityContext,
        ),
      );
    }
    if (value && typeof value === 'object') {
      const changedField = typeof value['field'] === 'string' ? value['field'].split('.')[0] : null;
      const redactChangeValues = personRoot && changedField != null && PERSONAL_AUDIT_FIELDS.has(changedField);
      const anonymizeChangeValues = changedField != null && this.isAuditIdentityField(changedField, personRoot);
      return Object.fromEntries(
        Object.entries(value as Record<string, Prisma.JsonValue>).map(([key, child]) => {
          const nextPath = [...path, key];
          const isNestedPerson = path.includes('person') || path.includes('user');
          const redactPersonalField = PERSONAL_AUDIT_FIELDS.has(key) && (personRoot || isNestedPerson);
          if (redactPersonalField || (redactChangeValues && (key === 'before' || key === 'after'))) {
            return [key, ANONYMIZED_AUDIT_VALUE];
          }
          return [
            key,
            this.anonymizeAuditJson(
              child,
              sensitiveValues,
              identityValues,
              anonymizedSubjectId,
              nextPath,
              personRoot,
              identityContext ||
                this.isAuditIdentityPath(nextPath, personRoot) ||
                (anonymizeChangeValues && (key === 'before' || key === 'after')),
            ),
          ];
        }),
      );
    }
    return value as Prisma.InputJsonValue;
  }

  private isAuditIdentityPath(path: readonly string[], personRoot: boolean): boolean {
    const key = path.at(-1);
    if (!key) {
      return false;
    }

    return this.isAuditIdentityField(key, personRoot || path.includes('person') || path.includes('user'));
  }

  private isAuditIdentityField(field: string, personRoot: boolean): boolean {
    const rootField = field.split('.')[0];
    return AUDIT_IDENTITY_FIELDS.has(rootField) || (rootField === 'id' && personRoot);
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
      emails: [...emails],
      people,
    };
  }

  private buildOfflineSubmissionSubjectWhere(
    dataSubject: DataSubjectResolution,
  ): Prisma.OfflineEventAttendanceSubmissionWhereInput | null {
    const conditions: Prisma.OfflineEventAttendanceSubmissionWhereInput[] = [];
    if (dataSubject.personIds.length > 0) {
      conditions.push({ personId: { in: dataSubject.personIds } });
    }
    if (dataSubject.userIds.length > 0) {
      conditions.push({ authorUserId: { in: dataSubject.userIds } });
      conditions.push({ submittedById: { in: dataSubject.userIds } });
      conditions.push({ committedById: { in: dataSubject.userIds } });
      conditions.push({ rejectedById: { in: dataSubject.userIds } });
      conditions.push({ scannerCode: { in: dataSubject.userIds.map((userId) => `user:${userId}`) } });
    }
    for (const email of dataSubject.emails) {
      conditions.push({ authorEmail: { equals: email, mode: 'insensitive' } });
    }
    const manualValues = this.getOfflineManualSubjectValueCandidates(dataSubject);
    if (manualValues.length > 0) {
      conditions.push({ manualValue: { in: manualValues, mode: 'insensitive' } });
    }

    return conditions.length > 0 ? { OR: conditions } : null;
  }

  private async anonymizeOfflineAttendanceSubmissions(
    tx: Prisma.TransactionClient,
    dataSubject: DataSubjectResolution,
    anonymizedSubjectId: string,
  ): Promise<number> {
    const where = this.buildOfflineSubmissionSubjectWhere(dataSubject);
    if (!where) {
      return 0;
    }

    const submissions = await tx.offlineEventAttendanceSubmission.findMany({
      where,
      select: {
        id: true,
        personId: true,
        scannerCode: true,
        manualValue: true,
        authorUserId: true,
        authorName: true,
        authorEmail: true,
        submittedById: true,
        committedById: true,
        rejectedById: true,
      },
    });
    const userIds = new Set(dataSubject.userIds);
    const personIds = new Set(dataSubject.personIds);
    const emails = new Set(dataSubject.emails.map((email) => email.toLowerCase()));
    const manualValues = new Set(
      this.getOfflineManualSubjectValueCandidates(dataSubject).map((value) => this.caseInsensitiveKey(value)),
    );
    let updated = 0;

    for (const submission of submissions) {
      const data: Prisma.OfflineEventAttendanceSubmissionUncheckedUpdateInput = {};
      const personMatches = submission.personId != null && personIds.has(submission.personId);
      if (personMatches) {
        data.personId = null;
        data.scannerCode = ANONYMIZED_AUDIT_VALUE;
        data.manualValue = ANONYMIZED_AUDIT_VALUE;
      }
      if (submission.scannerCode && userIds.has(this.parseScannerUserId(submission.scannerCode) ?? '')) {
        data.scannerCode = anonymizedSubjectId;
      }
      if (submission.manualValue && manualValues.has(this.caseInsensitiveKey(submission.manualValue))) {
        data.manualValue = ANONYMIZED_AUDIT_VALUE;
      }
      if (submission.authorUserId && userIds.has(submission.authorUserId)) {
        data.authorUserId = anonymizedSubjectId;
      }
      if (submission.authorEmail && emails.has(submission.authorEmail.toLowerCase())) {
        data.authorEmail = null;
      }
      if (
        (submission.authorUserId && userIds.has(submission.authorUserId)) ||
        (submission.authorEmail && emails.has(submission.authorEmail.toLowerCase()))
      ) {
        data.authorName = ANONYMIZED_AUDIT_VALUE;
      }
      if (userIds.has(submission.submittedById)) {
        data.submittedById = anonymizedSubjectId;
      }
      if (submission.committedById && userIds.has(submission.committedById)) {
        data.committedById = anonymizedSubjectId;
      }
      if (submission.rejectedById && userIds.has(submission.rejectedById)) {
        data.rejectedById = anonymizedSubjectId;
      }
      if (Object.keys(data).length === 0) {
        continue;
      }

      await tx.offlineEventAttendanceSubmission.update({
        where: { id: submission.id },
        data,
      });
      updated += 1;
    }

    return updated;
  }

  private parseScannerUserId(scannerCode: string): string | null {
    const [kind, userId, ...extraParts] = scannerCode.split(':');
    return kind === 'user' && userId && extraParts.length === 0 ? userId : null;
  }

  private getOfflineManualSubjectValueCandidates(dataSubject: DataSubjectResolution): string[] {
    const values = new Map<string, string>();
    const addValue = (value?: string | null) => {
      const normalizedValue = value?.trim();
      if (!normalizedValue) {
        return;
      }
      values.set(this.caseInsensitiveKey(normalizedValue), normalizedValue);
    };

    for (const email of dataSubject.emails) {
      addValue(email);
    }

    for (const person of dataSubject.people) {
      addValue(person.email);
      for (const email of person.secondaryEmails ?? []) {
        addValue(email);
      }
      this.addPhoneManualValueCandidates(values, person.phone);
      this.addIdentityDocumentManualValueCandidates(values, person.identityDocument, person.isCPF !== false);
    }

    return [...values.values()];
  }

  private addPhoneManualValueCandidates(values: Map<string, string>, phone?: string | null): void {
    const normalizedPhone = phone?.trim();
    if (!normalizedPhone) {
      return;
    }

    this.addManualValueCandidate(values, normalizedPhone);
    for (const candidate of this.getBrazilianPhoneCandidates(normalizedPhone.replace(/\D/g, ''))) {
      this.addManualValueCandidate(values, candidate);
    }
  }

  private addIdentityDocumentManualValueCandidates(
    values: Map<string, string>,
    identityDocument?: string | null,
    isCpf = true,
  ): void {
    const normalizedDocument = identityDocument?.trim();
    if (!normalizedDocument) {
      return;
    }

    this.addManualValueCandidate(values, normalizedDocument);
    const digits = normalizedDocument.replace(/\D/g, '');
    if (!digits) {
      return;
    }

    this.addManualValueCandidate(values, digits);
    if (isCpf && digits.length === 11) {
      this.addManualValueCandidate(
        values,
        `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`,
      );
    }
  }

  private getBrazilianPhoneCandidates(digits: string): string[] {
    if (!digits) {
      return [];
    }

    const candidates = new Set<string>();
    const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    const withCountry = withoutCountry.length >= 10 ? `55${withoutCountry}` : digits;
    for (const candidate of [digits, withoutCountry, withCountry, `+${withCountry}`]) {
      candidates.add(candidate);
    }
    this.addBrazilianPhoneDisplayCandidates(candidates, withoutCountry);
    return [...candidates];
  }

  private addBrazilianPhoneDisplayCandidates(candidates: Set<string>, withoutCountry: string): void {
    if (withoutCountry.length !== 10 && withoutCountry.length !== 11) {
      return;
    }

    const areaCode = withoutCountry.slice(0, 2);
    const localNumber = withoutCountry.slice(2);
    const prefixLength = localNumber.length === 9 ? 5 : 4;
    const prefix = localNumber.slice(0, prefixLength);
    const suffix = localNumber.slice(prefixLength);
    const localDisplay = `${prefix}-${suffix}`;
    for (const candidate of [
      `(${areaCode}) ${localDisplay}`,
      `${areaCode} ${localDisplay}`,
      `${areaCode}${localDisplay}`,
      `55 ${areaCode} ${localDisplay}`,
      `+55 ${areaCode} ${localDisplay}`,
      `+55 (${areaCode}) ${localDisplay}`,
    ]) {
      candidates.add(candidate);
    }
  }

  private addManualValueCandidate(values: Map<string, string>, value: string): void {
    const normalizedValue = value.trim();
    if (normalizedValue) {
      values.set(this.caseInsensitiveKey(normalizedValue), normalizedValue);
    }
  }

  private caseInsensitiveKey(value: string): string {
    return value.trim().toLowerCase();
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
    const failedObjectKeys: string[] = [];

    for (const objectKey of uniqueObjectKeys) {
      try {
        await this.s3.deleteFile(objectKey);
      } catch (error: unknown) {
        failedObjectKeys.push(objectKey);
        this.logger.warn(
          `Failed to delete LGPD receipt object ${objectKey}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (failedObjectKeys.length > 0) {
      this.logger.warn(
        `LGPD receipt cleanup completed with ${failedObjectKeys.length} failed object deletion(s): ${failedObjectKeys.join(', ')}`,
      );
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
