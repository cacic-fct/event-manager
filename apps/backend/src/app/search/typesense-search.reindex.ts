import type { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CollectionCreateSchema } from 'typesense';
import type { Client as TypesenseClient } from 'typesense';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUDIT_LOG_REINDEX_BATCH_SIZE,
  TYPESENSE_COLLECTIONS,
  createTypesenseCollectionSchemas,
} from './typesense-search.collections';
import {
  toCertificateTemplateSearchDocument,
  toMajorEventSearchDocument,
  toPersonSearchDocument,
  toPlacePresetSearchDocument,
} from './typesense-search.documents';
import { EVENT_SEARCH_SELECT, toEventSearchDocument } from './typesense-search.events';
import type {
  AuditLogSearchDocument,
  CertificateTemplateSearchDocument,
  EventGroupSearchDocument,
  EventSearchDocument,
  MajorEventSearchDocument,
  PersonSearchDocument,
  PlacePresetSearchDocument,
} from './typesense-search.types';
import { AUDIT_LOG_SEARCH_SELECT, toAuditLogSearchDocument } from './typesense-search.audit-log';
import {
  assertTypesenseImportSucceeded,
  replaceTypesenseCollection,
  replaceTypesenseCollectionDocuments,
  upsertTypesenseDocument,
} from './typesense-search.writer';

export async function reindexAllSearchDocuments(input: {
  client: TypesenseClient | null;
  logger: Logger;
  prisma: PrismaService;
}): Promise<void> {
  if (!input.client) {
    return;
  }

  const [events, majorEvents, eventGroups, people, placePresets, certificateTemplates] = await Promise.all([
    input.prisma.event.findMany({
      where: { deletedAt: null },
      select: EVENT_SEARCH_SELECT,
    }),
    input.prisma.majorEvent.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        publicationState: true,
      },
    }),
    input.prisma.eventGroup.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
      },
    }),
    input.prisma.people.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        secondaryEmails: true,
        phone: true,
        identityDocument: true,
        academicId: true,
        userId: true,
      },
    }),
    input.prisma.placePreset.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        locationDescription: true,
      },
    }),
    input.prisma.certificateTemplate.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        version: true,
        isActive: true,
      },
    }),
  ]);

  const getSchema = buildSchemaResolver();

  await Promise.all([
    replaceTypesenseCollectionDocuments<EventSearchDocument>({
      client: input.client,
      logger: input.logger,
      schema: getSchema(TYPESENSE_COLLECTIONS.events),
      documents: events.map((event) => toEventSearchDocument(event)),
    }),
    replaceTypesenseCollectionDocuments<MajorEventSearchDocument>({
      client: input.client,
      logger: input.logger,
      schema: getSchema(TYPESENSE_COLLECTIONS.majorEvents),
      documents: majorEvents.map((majorEvent) => toMajorEventSearchDocument(majorEvent)),
    }),
    replaceTypesenseCollectionDocuments<EventGroupSearchDocument>({
      client: input.client,
      logger: input.logger,
      schema: getSchema(TYPESENSE_COLLECTIONS.eventGroups),
      documents: eventGroups.map((eventGroup) => ({
        id: eventGroup.id,
        name: eventGroup.name,
      })),
    }),
    replaceTypesenseCollectionDocuments<PersonSearchDocument>({
      client: input.client,
      logger: input.logger,
      schema: getSchema(TYPESENSE_COLLECTIONS.people),
      documents: people.map((person) => toPersonSearchDocument(person)),
    }),
    replaceTypesenseCollectionDocuments<PlacePresetSearchDocument>({
      client: input.client,
      logger: input.logger,
      schema: getSchema(TYPESENSE_COLLECTIONS.placePresets),
      documents: placePresets.map((placePreset) => toPlacePresetSearchDocument(placePreset)),
    }),
    replaceTypesenseCollectionDocuments<CertificateTemplateSearchDocument>({
      client: input.client,
      logger: input.logger,
      schema: getSchema(TYPESENSE_COLLECTIONS.certificateTemplates),
      documents: certificateTemplates.map((certificateTemplate) =>
        toCertificateTemplateSearchDocument(certificateTemplate),
      ),
    }),
  ]);
  await replaceAuditLogSearchDocuments({
    client: input.client,
    logger: input.logger,
    prisma: input.prisma,
    schema: getSchema(TYPESENSE_COLLECTIONS.auditLogs),
  });
}

export async function reindexEventSearchDocuments(input: {
  client: TypesenseClient | null;
  logger: Logger;
  prisma: PrismaService;
  where: Prisma.EventWhereInput;
}): Promise<void> {
  if (!input.client) {
    return;
  }

  const events = await input.prisma.event.findMany({
    where: {
      ...input.where,
      deletedAt: null,
    },
    select: EVENT_SEARCH_SELECT,
  });

  await Promise.all(
    events.map((event) =>
      upsertTypesenseDocument<EventSearchDocument>({
        client: input.client,
        logger: input.logger,
        collectionName: TYPESENSE_COLLECTIONS.events,
        document: toEventSearchDocument(event),
      }),
    ),
  );
}

export async function replaceAuditLogSearchDocuments(input: {
  client: TypesenseClient | null;
  logger: Logger;
  prisma: PrismaService;
  schema: CollectionCreateSchema;
}): Promise<void> {
  if (!input.client) {
    return;
  }
  const client = input.client;

  try {
    await replaceTypesenseCollection({
      client,
      logger: input.logger,
      schema: input.schema,
      importDocuments: async (collectionName) => {
        const collection = client.collections<AuditLogSearchDocument & Record<string, unknown>>(collectionName);

        let cursor: { id: string } | undefined;
        for (;;) {
          const entries = await input.prisma.auditLogEntry.findMany({
            select: AUDIT_LOG_SEARCH_SELECT,
            orderBy: { id: 'asc' },
            take: AUDIT_LOG_REINDEX_BATCH_SIZE,
            ...(cursor ? { cursor, skip: 1 } : {}),
          });
          if (entries.length === 0) {
            return;
          }

          const importResult = await collection.documents().import(entries.map((entry) => toAuditLogSearchDocument(entry)), {
            action: 'upsert',
          });
          assertTypesenseImportSucceeded(importResult, input.schema.name);

          cursor = { id: entries[entries.length - 1].id };
          if (entries.length < AUDIT_LOG_REINDEX_BATCH_SIZE) {
            return;
          }
        }
      },
    });
  } catch (error) {
    input.logger.error(`Failed to replace Typesense documents for ${input.schema.name}.`, error);
  }
}

function buildSchemaResolver(): (collectionName: string) => CollectionCreateSchema {
  const schemas = new Map(createTypesenseCollectionSchemas().map((schema) => [schema.name, schema]));
  return (collectionName: string) => {
    const schema = schemas.get(collectionName);
    if (!schema) {
      throw new Error(`Missing Typesense collection schema for ${collectionName}.`);
    }
    return schema;
  };
}
