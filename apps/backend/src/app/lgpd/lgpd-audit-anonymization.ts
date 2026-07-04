import { AuditLogEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { DataSubjectResolution } from './lgpd-records';

export const ANONYMIZED_AUDIT_VALUE = '[ANONIMIZADO]';

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

export function buildAuditLogSubjectWhere(
  dataSubject: DataSubjectResolution,
  options: { includeActorEmail?: boolean } = {},
): Prisma.AuditLogEntryWhereInput {
  const includeActorEmail = options.includeActorEmail ?? true;
  const identifiers = [...new Set([...dataSubject.userIds, ...dataSubject.personIds])];
  const jsonIdentityConditions: Prisma.AuditLogEntryWhereInput[] = identifiers.flatMap((identifier) =>
    [...AUDIT_IDENTITY_FIELDS].flatMap((field) => [
      { before: { path: [field], equals: identifier } },
      { after: { path: [field], equals: identifier } },
      { changes: { path: [field], equals: identifier } },
      { metadata: { path: [field], equals: identifier } },
      { metadata: { path: ['offlineAttendanceAuthor', field], equals: identifier } },
    ]),
  );
  const emailConditions: Prisma.AuditLogEntryWhereInput[] = dataSubject.emails.flatMap((email) => [
    ...(includeActorEmail
      ? [{ actorEmail: { equals: email, mode: Prisma.QueryMode.insensitive } }]
      : []),
    { before: { path: ['email'], equals: email } },
    { after: { path: ['email'], equals: email } },
    { changes: { path: ['email'], equals: email } },
    { metadata: { path: ['email'], equals: email } },
    { metadata: { path: ['offlineAttendanceAuthor', 'email'], equals: email } },
  ]);
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
      ...emailConditions,
    ],
  };
}

export function anonymizeAuditEntityId(
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

  const personId = decodeAuditEntityIdSegment(personSegment);
  if (!personIds.includes(personId)) {
    return entityId;
  }

  return [encodeURIComponent(anonymizedSubjectId), ...remainingSegments].join(':');
}

export function buildAnonymizedAuditSubjectId(requestId: string): string {
  const normalizedRequestId = requestId.trim() || 'request';
  return `anonymized:${encodeURIComponent(normalizedRequestId)}`;
}

export async function anonymizeAuditEntries(
  tx: Prisma.TransactionClient,
  dataSubject: DataSubjectResolution,
  anonymizedSubjectId: string,
): Promise<string[]> {
  const entries = await tx.auditLogEntry.findMany({
    where: buildAuditLogSubjectWhere(dataSubject),
  });
  const identifiers = [...new Set([...dataSubject.userIds, ...dataSubject.personIds])];
  const sensitiveValues = getSensitiveAuditValues(dataSubject);
  const identityValues = new Set(identifiers);

  const auditEntryUpdates = entries.map((entry) => {
    const actorMatches = entry.actorId != null && dataSubject.userIds.includes(entry.actorId);
    const entitySubjectMatches =
      (entry.entityType === AuditLogEntityType.PERSON && dataSubject.personIds.includes(entry.entityId)) ||
      isEventAttendanceAuditEntityForPerson(entry.entityType, entry.entityId, dataSubject.personIds);
    const payloadMatches =
      containsAuditIdentity(entry.before, identityValues, entry.entityType === 'PERSON') ||
      containsAuditIdentity(entry.after, identityValues, entry.entityType === 'PERSON') ||
      containsAuditIdentity(entry.changes, identityValues, false) ||
      containsAuditIdentity(entry.metadata, identityValues, false);
    const shouldScrubPayload = actorMatches || entitySubjectMatches || payloadMatches;

    return tx.auditLogEntry.update({
      where: { id: entry.id },
      data: {
        actorId: actorMatches ? null : entry.actorId,
        actorName: actorMatches ? 'Usuário anonimizado' : entry.actorName,
        actorEmail: actorMatches ? null : entry.actorEmail,
        entityId: entitySubjectMatches
          ? anonymizeAuditEntityId(entry.entityType, entry.entityId, dataSubject.personIds, anonymizedSubjectId)
          : entry.entityId,
        entityLabel: actorMatches || entitySubjectMatches || payloadMatches ? 'Dados anonimizados' : entry.entityLabel,
        before: shouldScrubPayload
          ? anonymizeNullableAuditJson(
              entry.before,
              sensitiveValues,
              identityValues,
              anonymizedSubjectId,
              entry.entityType === AuditLogEntityType.PERSON,
            )
          : undefined,
        after: shouldScrubPayload
          ? anonymizeNullableAuditJson(
              entry.after,
              sensitiveValues,
              identityValues,
              anonymizedSubjectId,
              entry.entityType === AuditLogEntityType.PERSON,
            )
          : undefined,
        changes: shouldScrubPayload
          ? anonymizeAuditJson(
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
            ? anonymizeAuditJson(entry.metadata, sensitiveValues, identityValues, anonymizedSubjectId, [], false)
            : undefined,
      },
    });
  });

  await Promise.all(auditEntryUpdates);
  return entries.map((entry) => entry.id);
}

export async function synchronizeAnonymizedAuditEntries(
  prisma: PrismaService,
  typesenseSearch: TypesenseSearchService,
  logger: { warn(message: string): void },
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const entries = await prisma.auditLogEntry.findMany({
    where: {
      id: {
        in: [...ids],
      },
    },
  });
  await Promise.all(
    entries.map((entry) =>
      typesenseSearch.upsertAuditLogEntry(entry).catch((error: unknown) => {
        logger.warn(
          `Falha ao reindexar audit log anonimizado ${entry.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }),
    ),
  );
}

export function isEventAttendanceAuditEntityForPerson(
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

  return personIds.includes(decodeAuditEntityIdSegment(personSegment));
}

export function getSensitiveAuditValues(dataSubject: DataSubjectResolution): Set<string> {
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

export function containsAuditIdentity(
  value: Prisma.JsonValue | null,
  identities: ReadonlySet<string>,
  personRoot: boolean,
  path: readonly string[] = [],
): boolean {
  if (typeof value === 'string') {
    return isAuditIdentityPath(path, personRoot) && identities.has(value);
  }
  if (Array.isArray(value)) {
    return value.some((child) => containsAuditIdentity(child, identities, personRoot, path));
  }
  if (value && typeof value === 'object') {
    const changedField = typeof value['field'] === 'string' ? value['field'] : null;
    return Object.entries(value as Record<string, Prisma.JsonValue>).some(([key, child]) => {
      const nextPath = [...path, key];
      if ((key === 'before' || key === 'after') && changedField && isAuditIdentityField(changedField, personRoot)) {
        return containsAuditIdentity(child, identities, personRoot, [...path, changedField]);
      }
      return containsAuditIdentity(child, identities, personRoot, nextPath);
    });
  }
  return false;
}

export function anonymizeNullableAuditJson(
  value: Prisma.JsonValue | null,
  sensitiveValues: ReadonlySet<string>,
  identityValues: ReadonlySet<string>,
  anonymizedSubjectId: string,
  personRoot: boolean,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null
    ? Prisma.JsonNull
    : anonymizeAuditJson(value, sensitiveValues, identityValues, anonymizedSubjectId, [], personRoot);
}

export function anonymizeAuditJson(
  value: Prisma.JsonValue,
  sensitiveValues: ReadonlySet<string>,
  identityValues: ReadonlySet<string>,
  anonymizedSubjectId: string,
  path: readonly string[],
  personRoot: boolean,
  identityContext = false,
): Prisma.InputJsonValue {
  if (typeof value === 'string') {
    if ((identityContext || isAuditIdentityPath(path, personRoot)) && identityValues.has(value)) {
      return anonymizedSubjectId;
    }
    return sensitiveValues.has(value) || sensitiveValues.has(value.toLowerCase()) ? ANONYMIZED_AUDIT_VALUE : value;
  }
  if (Array.isArray(value)) {
    return value.map((child) =>
      anonymizeAuditJson(
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
    const anonymizeChangeValues = changedField != null && isAuditIdentityField(changedField, personRoot);
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
          anonymizeAuditJson(
            child,
            sensitiveValues,
            identityValues,
            anonymizedSubjectId,
            nextPath,
            personRoot,
            identityContext ||
              isAuditIdentityPath(nextPath, personRoot) ||
              (anonymizeChangeValues && (key === 'before' || key === 'after')),
          ),
        ];
      }),
    );
  }
  return value as Prisma.InputJsonValue;
}

function isAuditIdentityPath(path: readonly string[], personRoot: boolean): boolean {
  const key = path.at(-1);
  if (!key) {
    return false;
  }

  return isAuditIdentityField(key, personRoot || path.includes('person') || path.includes('user'));
}

function isAuditIdentityField(field: string, personRoot: boolean): boolean {
  const rootField = field.split('.')[0];
  return AUDIT_IDENTITY_FIELDS.has(rootField) || (rootField === 'id' && personRoot);
}

function decodeAuditEntityIdSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
