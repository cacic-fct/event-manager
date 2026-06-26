import type { CollectionCreateSchema, CollectionFieldSchema, CollectionSchema } from 'typesense';

export const TYPESENSE_MAX_PER_PAGE = 250;
export const AUDIT_LOG_REINDEX_BATCH_SIZE = 500;
export const TYPESENSE_COLLECTION_PREFIX = 'cacic_event_manager_';
export const TYPESENSE_COLLECTIONS = {
  events: `${TYPESENSE_COLLECTION_PREFIX}events`,
  majorEvents: `${TYPESENSE_COLLECTION_PREFIX}major_events`,
  eventGroups: `${TYPESENSE_COLLECTION_PREFIX}event_groups`,
  people: `${TYPESENSE_COLLECTION_PREFIX}people`,
  placePresets: `${TYPESENSE_COLLECTION_PREFIX}place_presets`,
  certificateTemplates: `${TYPESENSE_COLLECTION_PREFIX}certificate_templates`,
  auditLogs: `${TYPESENSE_COLLECTION_PREFIX}audit_logs`,
} as const;

export function createTypesenseCollectionSchemas(): CollectionCreateSchema[] {
  return [
    createTypesenseCollectionSchema(TYPESENSE_COLLECTIONS.events, [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'emoji', type: 'string', optional: true },
      { name: 'type', type: 'string', facet: true },
      { name: 'description', type: 'string', optional: true },
      { name: 'shortDescription', type: 'string', optional: true },
      { name: 'locationDescription', type: 'string', optional: true },
      { name: 'majorEventId', type: 'string', optional: true, facet: true },
      { name: 'majorEventName', type: 'string', optional: true },
      { name: 'eventGroupId', type: 'string', optional: true, facet: true },
      { name: 'eventGroupName', type: 'string', optional: true },
      { name: 'startDate', type: 'int64', sort: true },
      { name: 'endDate', type: 'int64', sort: true },
      { name: 'publiclyVisible', type: 'bool', optional: true, facet: true },
      { name: 'publicationState', type: 'string', optional: true, facet: true },
      { name: 'majorEventPublicationState', type: 'string', optional: true, facet: true },
      { name: 'isIssuableCertificateEvent', type: 'bool', optional: true, facet: true },
    ]),
    createTypesenseCollectionSchema(TYPESENSE_COLLECTIONS.majorEvents, [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string', optional: true },
      { name: 'startDate', type: 'int64', sort: true },
      { name: 'endDate', type: 'int64', sort: true },
      { name: 'publicationState', type: 'string', optional: true, facet: true },
    ]),
    createTypesenseCollectionSchema(TYPESENSE_COLLECTIONS.eventGroups, [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
    ]),
    createTypesenseCollectionSchema(TYPESENSE_COLLECTIONS.people, [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'email', type: 'string', optional: true },
      { name: 'secondaryEmails', type: 'string[]', optional: true },
      { name: 'phone', type: 'string', optional: true },
      { name: 'identityDocument', type: 'string', optional: true, facet: true },
      { name: 'academicId', type: 'string', optional: true, facet: true },
      { name: 'userId', type: 'string', optional: true, facet: true },
    ]),
    createTypesenseCollectionSchema(TYPESENSE_COLLECTIONS.placePresets, [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'locationDescription', type: 'string', optional: true },
    ]),
    createTypesenseCollectionSchema(TYPESENSE_COLLECTIONS.certificateTemplates, [
      { name: 'id', type: 'string' },
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string', optional: true },
      { name: 'version', type: 'int32', sort: true },
      { name: 'isActive', type: 'bool', facet: true },
    ]),
    createTypesenseCollectionSchema(TYPESENSE_COLLECTIONS.auditLogs, [
      { name: 'id', type: 'string', sort: true },
      { name: 'entityType', type: 'string', facet: true },
      { name: 'entityId', type: 'string', facet: true },
      { name: 'entityLabel', type: 'string', optional: true },
      { name: 'operation', type: 'string', facet: true },
      { name: 'summary', type: 'string', optional: true },
      { name: 'actorId', type: 'string', optional: true, facet: true },
      { name: 'actorName', type: 'string' },
      { name: 'actorEmail', type: 'string', optional: true },
      { name: 'actorType', type: 'string', facet: true },
      { name: 'permission', type: 'string', optional: true, facet: true },
      { name: 'eventId', type: 'string', optional: true, facet: true },
      { name: 'majorEventId', type: 'string', optional: true, facet: true },
      { name: 'eventGroupId', type: 'string', optional: true, facet: true },
      { name: 'changedFields', type: 'string[]', optional: true, facet: true },
      { name: 'changedFieldLabels', type: 'string[]', optional: true },
      { name: 'changesText', type: 'string', optional: true },
      { name: 'beforeText', type: 'string', optional: true },
      { name: 'afterText', type: 'string', optional: true },
      { name: 'metadataText', type: 'string', optional: true },
      { name: 'groupedCount', type: 'int32', sort: true },
      { name: 'firstRecordedAt', type: 'int64', sort: true },
      { name: 'lastRecordedAt', type: 'int64', sort: true },
      { name: 'createdAt', type: 'int64', sort: true },
      { name: 'reverted', type: 'bool', facet: true },
      { name: 'revertedAt', type: 'int64', optional: true, sort: true },
      { name: 'revertedById', type: 'string', optional: true, facet: true },
      { name: 'revertedByName', type: 'string', optional: true },
      { name: 'revertedByEntryId', type: 'string', optional: true, facet: true },
      { name: 'revertTargetId', type: 'string', optional: true, facet: true },
      { name: 'revertMode', type: 'string', optional: true, facet: true },
    ]),
  ];
}

export function findMissingTypesenseFields(
  schema: CollectionCreateSchema,
  existing: CollectionSchema,
): CollectionFieldSchema[] {
  const currentNames = new Set(existing.fields.map((field) => field.name));
  return (schema.fields ?? []).filter((field) => field.name !== 'id' && !currentNames.has(field.name));
}

export function createTypesenseCollectionSchema(
  name: string,
  fields: CollectionFieldSchema[],
): CollectionCreateSchema {
  return {
    name,
    fields,
  };
}
