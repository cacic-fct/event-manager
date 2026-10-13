import type { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CollectionCreateSchema } from 'typesense';
import type { Client as TypesenseClient } from 'typesense';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUDIT_LOG_REINDEX_BATCH_SIZE,
  SEARCH_REINDEX_BATCH_SIZE,
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
  upsertTypesenseDocument,
} from './typesense-search.writer';

type ReindexPage = {
  orderBy: { id: 'asc' };
  take: number;
  cursor?: { id: string };
  skip?: number;
};

async function replaceSearchDocumentsInBatches<T extends { id: string }>(input: {
  client: TypesenseClient | null;
  logger: Logger;
  schema: CollectionCreateSchema;
  loadDocuments: (page: ReindexPage) => Promise<T[]>;
}): Promise<void> {
  const client = input.client;
  if (!client) {
    return;
  }

  await replaceTypesenseCollection({
    client,
    logger: input.logger,
    schema: input.schema,
    importDocuments: async (collectionName) => {
      const collection = client.collections<T & Record<string, unknown>>(collectionName);
      let cursor: { id: string } | undefined;
      for (;;) {
        const documents = await input.loadDocuments({
          orderBy: { id: 'asc' },
          take: SEARCH_REINDEX_BATCH_SIZE,
          ...(cursor ? { cursor, skip: 1 } : {}),
        });
        if (documents.length === 0) {
          return;
        }

        // The SDK's import API has no client-side timeout, including on slow HDDs.
        const importResult = await collection.documents().import(documents, { action: 'upsert' });
        assertTypesenseImportSucceeded(importResult, input.schema.name);
        cursor = { id: documents[documents.length - 1].id };
        if (documents.length < SEARCH_REINDEX_BATCH_SIZE) {
          return;
        }
      }
    },
  });
}

export async function reindexAllSearchDocuments(input: {
  client: TypesenseClient | null;
  logger: Logger;
  prisma: PrismaService;
}): Promise<void> {
  if (!input.client) {
    return;
  }

  const getSchema = buildSchemaResolver();
  const replaceCollection = <T extends { id: string }>(
    collectionName: string,
    loadDocuments: (page: ReindexPage) => Promise<T[]>,
  ) =>
    replaceSearchDocumentsInBatches({
      ...input,
      schema: getSchema(collectionName),
      loadDocuments,
    });

  // One collection and one batch at a time keeps startup memory and HDD contention bounded.
  // Do not impose a total deadline: large indexes on slow disks must be allowed to finish.
  await replaceCollection<EventSearchDocument>(TYPESENSE_COLLECTIONS.events, async (page) => {
    const events = await input.prisma.event.findMany({
      where: { deletedAt: null },
      select: EVENT_SEARCH_SELECT,
      ...page,
    });
    return events.map((event) => toEventSearchDocument(event));
  });
  await replaceCollection<MajorEventSearchDocument>(TYPESENSE_COLLECTIONS.majorEvents, async (page) => {
    const majorEvents = await input.prisma.majorEvent.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        publicationState: true,
      },
      ...page,
    });
    return majorEvents.map((majorEvent) => toMajorEventSearchDocument(majorEvent));
  });
  await replaceCollection<EventGroupSearchDocument>(TYPESENSE_COLLECTIONS.eventGroups, async (page) => {
    const eventGroups = await input.prisma.eventGroup.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        emoji: true,
        majorEventId: true,
        majorEvent: { select: { name: true, deletedAt: true } },
      },
      ...page,
    });
    return eventGroups.map((eventGroup) => ({
      id: eventGroup.id,
      name: eventGroup.name,
      emoji: eventGroup.emoji,
      majorEventId: eventGroup.majorEventId ?? undefined,
      majorEventName: eventGroup.majorEvent?.deletedAt ? undefined : eventGroup.majorEvent?.name,
    }));
  });
  await replaceCollection<PersonSearchDocument>(TYPESENSE_COLLECTIONS.people, async (page) => {
    const people = await input.prisma.people.findMany({
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
      ...page,
    });
    return people.map((person) => toPersonSearchDocument(person));
  });
  await replaceCollection<PlacePresetSearchDocument>(TYPESENSE_COLLECTIONS.placePresets, async (page) => {
    const placePresets = await input.prisma.placePreset.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        locationDescription: true,
      },
      ...page,
    });
    return placePresets.map((placePreset) => toPlacePresetSearchDocument(placePreset));
  });
  await replaceCollection<CertificateTemplateSearchDocument>(
    TYPESENSE_COLLECTIONS.certificateTemplates,
    async (page) => {
      const certificateTemplates = await input.prisma.certificateTemplate.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          description: true,
          isActive: true,
        },
        ...page,
      });
      return certificateTemplates.map((certificateTemplate) =>
        toCertificateTemplateSearchDocument(certificateTemplate),
      );
    },
  );
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

export async function reindexEventGroupSearchDocuments(input: {
  client: TypesenseClient | null;
  logger: Logger;
  prisma: PrismaService;
  where: Prisma.EventGroupWhereInput;
}): Promise<void> {
  if (!input.client) {
    return;
  }
  const groups = await input.prisma.eventGroup.findMany({
    where: { ...input.where, deletedAt: null },
    select: {
      id: true,
      name: true,
      emoji: true,
      majorEventId: true,
      majorEvent: { select: { name: true, deletedAt: true } },
    },
  });
  await Promise.all(
    groups.map((group) =>
      upsertTypesenseDocument<EventGroupSearchDocument>({
        client: input.client,
        logger: input.logger,
        collectionName: TYPESENSE_COLLECTIONS.eventGroups,
        document: {
          id: group.id,
          name: group.name,
          emoji: group.emoji,
          majorEventId: group.majorEventId ?? undefined,
          majorEventName: group.majorEvent?.deletedAt ? undefined : group.majorEvent?.name,
        },
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

          const importResult = await collection.documents().import(
            entries.map((entry) => toAuditLogSearchDocument(entry)),
            {
              action: 'upsert',
            },
          );
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
