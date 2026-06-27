import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CollectionCreateSchema, CollectionFieldSchema } from 'typesense';
import type { Client as TypesenseClient } from 'typesense';
import { TYPESENSE_COLLECTIONS, createTypesenseCollectionSchema } from './typesense-search.collections';
import { AUDIT_LOG_QUERY_BY, toAuditLogSearchDocument } from './typesense-search.audit-log';
import { buildTypesenseClient, buildTypesenseNodeConfigFromUrl } from './typesense-search.client';
import {
  toCertificateTemplateSearchDocument,
  toMajorEventSearchDocument,
  toPersonSearchDocument,
  toPlacePresetSearchDocument,
} from './typesense-search.documents';
import { toEventSearchDocument } from './typesense-search.events';
import { searchTypesenseDocumentIds, searchTypesensePagedDocumentIds } from './typesense-search.query';
import {
  reindexAllSearchDocuments,
  reindexEventSearchDocuments,
  replaceAuditLogSearchDocuments,
} from './typesense-search.reindex';
import { toOptionalString } from './typesense-search.shared';
import type {
  AuditLogSearchDocument,
  AuditLogSearchDocumentInput,
  CertificateTemplateSearchDocument,
  EventGroupSearchDocument,
  EventSearchDocument,
  MajorEventSearchDocument,
  PersonSearchDocument,
  PlacePresetSearchDocument,
  TypesenseNodeConfig,
  TypesensePagedSearchResult,
  TypesenseSearchOptions,
  TypesenseSearchResult,
} from './typesense-search.types';
import {
  deleteTypesenseDocument,
  ensureTypesenseCollection,
  ensureTypesenseCollections,
  replaceTypesenseCollectionDocuments,
  upsertTypesenseDocument,
} from './typesense-search.writer';

export type {
  AuditLogSearchDocumentInput,
  TypesensePagedSearchResult,
  TypesenseSearchOptions,
  TypesenseSearchResult,
} from './typesense-search.types';

@Injectable()
export class TypesenseSearchService implements OnModuleInit {
  private readonly logger = new Logger(TypesenseSearchService.name);
  private readonly enabled = process.env.TYPESENSE_ENABLED === 'true';
  private readonly client = this.buildClient();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.ensureCollections();
      await this.reindexAll();
    } catch (error) {
      this.logger.error('Typesense initialization failed.', error);
    }
  }

  isEnabled(): boolean {
    return this.client != null;
  }

  async searchEvents(query: string, options: number | TypesenseSearchOptions = 50): Promise<TypesenseSearchResult> {
    return this.searchDocumentIds<EventSearchDocument>(
      TYPESENSE_COLLECTIONS.events,
      query,
      'name,description,shortDescription,locationDescription,majorEventName,eventGroupName,emoji',
      options,
    );
  }

  async searchMajorEvents(query: string, options: number | TypesenseSearchOptions = 50): Promise<TypesenseSearchResult> {
    return this.searchDocumentIds<MajorEventSearchDocument>(
      TYPESENSE_COLLECTIONS.majorEvents,
      query,
      'name,description',
      options,
    );
  }

  async searchEventGroups(query: string, options: number | TypesenseSearchOptions = 50): Promise<TypesenseSearchResult> {
    return this.searchDocumentIds<EventGroupSearchDocument>(TYPESENSE_COLLECTIONS.eventGroups, query, 'name', options);
  }

  async searchPeople(query: string, take = 50): Promise<TypesenseSearchResult> {
    return this.searchDocumentIds<PersonSearchDocument>(
      TYPESENSE_COLLECTIONS.people,
      query,
      'name,email,secondaryEmails,phone,identityDocument,academicId',
      take,
    );
  }

  async searchPlacePresets(query: string, take = 50): Promise<TypesenseSearchResult> {
    return this.searchDocumentIds<PlacePresetSearchDocument>(
      TYPESENSE_COLLECTIONS.placePresets,
      query,
      'name,locationDescription',
      take,
    );
  }

  async searchCertificateTemplates(
    query: string,
    options: number | TypesenseSearchOptions = 50,
  ): Promise<TypesenseSearchResult> {
    return this.searchDocumentIds<CertificateTemplateSearchDocument>(
      TYPESENSE_COLLECTIONS.certificateTemplates,
      query,
      'name,description',
      options,
    );
  }

  async searchAuditLogEntries(
    query: string,
    options: TypesenseSearchOptions = {},
  ): Promise<TypesensePagedSearchResult> {
    return this.searchPagedDocumentIds<AuditLogSearchDocument>(
      TYPESENSE_COLLECTIONS.auditLogs,
      query,
      AUDIT_LOG_QUERY_BY,
      options,
      true,
    );
  }

  async upsertAuditLogEntry(input: AuditLogSearchDocumentInput): Promise<void> {
    await this.upsertDocument<AuditLogSearchDocument>(TYPESENSE_COLLECTIONS.auditLogs, toAuditLogSearchDocument(input));
  }

  async upsertEvent(input: {
    id: string;
    name: string;
    emoji: string;
    type: string;
    description?: string | null;
    shortDescription?: string | null;
    locationDescription?: string | null;
    majorEventId?: string | null;
    eventGroupId?: string | null;
    shouldIssueCertificate?: boolean | null;
    publiclyVisible?: boolean | null;
    publicationState?: string | null;
    startDate: Date;
    endDate: Date;
  }): Promise<void> {
    if (!this.client) {
      return;
    }

    const [majorEventName, eventGroupContext, majorEventPublicationState] = await Promise.all([
      this.resolveMajorEventName(input.majorEventId),
      this.resolveEventGroupContext(input.eventGroupId),
      this.resolveMajorEventPublicationState(input.majorEventId),
    ]);

    await this.upsertDocument<EventSearchDocument>(
      TYPESENSE_COLLECTIONS.events,
      toEventSearchDocument({
        ...input,
        majorEventName,
        eventGroup: eventGroupContext,
        eventGroupName: eventGroupContext?.name,
        majorEventPublicationState,
      }),
    );
  }

  async deleteEvent(id: string): Promise<void> {
    await this.deleteDocument(TYPESENSE_COLLECTIONS.events, id);
  }

  async upsertMajorEvent(input: {
    id: string;
    name: string;
    description?: string | null;
    startDate: Date;
    endDate: Date;
    publicationState?: string | null;
  }): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.upsertDocument<MajorEventSearchDocument>(
      TYPESENSE_COLLECTIONS.majorEvents,
      toMajorEventSearchDocument(input),
    );
    await this.reindexEventsByMajorEventId(input.id);
  }

  async deleteMajorEvent(id: string): Promise<void> {
    await this.deleteDocument(TYPESENSE_COLLECTIONS.majorEvents, id);
    await this.reindexEventsByMajorEventId(id);
  }

  async upsertEventGroup(input: { id: string; name: string }): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.upsertDocument<EventGroupSearchDocument>(TYPESENSE_COLLECTIONS.eventGroups, {
      id: input.id,
      name: input.name,
    });
    await this.reindexEventsByEventGroupId(input.id);
  }

  async deleteEventGroup(id: string): Promise<void> {
    await this.deleteDocument(TYPESENSE_COLLECTIONS.eventGroups, id);
    await this.reindexEventsByEventGroupId(id);
  }

  async upsertPerson(input: {
    id: string;
    name: string;
    email?: string | null;
    secondaryEmails?: string[];
    phone?: string | null;
    identityDocument?: string | null;
    academicId?: string | null;
    userId?: string | null;
  }): Promise<void> {
    await this.upsertDocument<PersonSearchDocument>(TYPESENSE_COLLECTIONS.people, toPersonSearchDocument(input));
  }

  async deletePerson(id: string): Promise<void> {
    await this.deleteDocument(TYPESENSE_COLLECTIONS.people, id);
  }

  async upsertPlacePreset(input: {
    id: string;
    name: string;
    locationDescription?: string | null;
  }): Promise<void> {
    await this.upsertDocument<PlacePresetSearchDocument>(
      TYPESENSE_COLLECTIONS.placePresets,
      toPlacePresetSearchDocument(input),
    );
  }

  async deletePlacePreset(id: string): Promise<void> {
    await this.deleteDocument(TYPESENSE_COLLECTIONS.placePresets, id);
  }

  async upsertCertificateTemplate(input: {
    id: string;
    name: string;
    description?: string | null;
    version: number;
    isActive: boolean;
  }): Promise<void> {
    await this.upsertDocument<CertificateTemplateSearchDocument>(
      TYPESENSE_COLLECTIONS.certificateTemplates,
      toCertificateTemplateSearchDocument(input),
    );
  }

  async deleteCertificateTemplate(id: string): Promise<void> {
    await this.deleteDocument(TYPESENSE_COLLECTIONS.certificateTemplates, id);
  }

  private buildClient(): TypesenseClient | null {
    return buildTypesenseClient({
      enabled: this.enabled,
      apiKey: process.env.TYPESENSE_API_KEY,
      rawUrl: process.env.TYPESENSE_URL,
      logger: this.logger,
    });
  }

  private buildNodeConfigFromUrl(rawUrl?: string): TypesenseNodeConfig | null {
    return buildTypesenseNodeConfigFromUrl(rawUrl, this.logger);
  }

  private async ensureCollections(): Promise<void> {
    await ensureTypesenseCollections(this.client);
  }

  private async ensureCollection(schema: CollectionCreateSchema): Promise<void> {
    await ensureTypesenseCollection(this.client, schema);
  }

  private createCollectionSchema(name: string, fields: CollectionFieldSchema[]): CollectionCreateSchema {
    return createTypesenseCollectionSchema(name, fields);
  }

  private async reindexAll(): Promise<void> {
    await reindexAllSearchDocuments({
      client: this.client,
      logger: this.logger,
      prisma: this.prisma,
    });
  }

  private async reindexEventsByMajorEventId(majorEventId: string): Promise<void> {
    await this.reindexEvents({ majorEventId });
  }

  private async reindexEventsByEventGroupId(eventGroupId: string): Promise<void> {
    await this.reindexEvents({ eventGroupId });
  }

  private async reindexEvents(where: Prisma.EventWhereInput): Promise<void> {
    await reindexEventSearchDocuments({
      client: this.client,
      logger: this.logger,
      prisma: this.prisma,
      where,
    });
  }

  private async replaceCollectionDocuments<T extends { id: string }>(
    schema: CollectionCreateSchema,
    documents: T[],
  ): Promise<void> {
    await replaceTypesenseCollectionDocuments({
      client: this.client,
      logger: this.logger,
      schema,
      documents,
    });
  }

  private async replaceAuditLogDocuments(schema: CollectionCreateSchema): Promise<void> {
    await replaceAuditLogSearchDocuments({
      client: this.client,
      logger: this.logger,
      prisma: this.prisma,
      schema,
    });
  }

  private async upsertDocument<T extends { id: string }>(collectionName: string, document: T): Promise<void> {
    await upsertTypesenseDocument({
      client: this.client,
      logger: this.logger,
      collectionName,
      document,
    });
  }

  private async deleteDocument(collectionName: string, id: string): Promise<void> {
    await deleteTypesenseDocument({
      client: this.client,
      logger: this.logger,
      collectionName,
      id,
    });
  }

  private async searchDocumentIds<T extends { id: string }>(
    collectionName: string,
    query: string,
    queryBy: string,
    options: number | TypesenseSearchOptions,
  ): Promise<TypesenseSearchResult> {
    return searchTypesenseDocumentIds<T>({
      client: this.client,
      logger: this.logger,
      collectionName,
      query,
      queryBy,
      options,
    });
  }

  private async searchPagedDocumentIds<T extends { id: string }>(
    collectionName: string,
    query: string,
    queryBy: string,
    options: number | TypesenseSearchOptions,
    allowMatchAll: boolean,
  ): Promise<TypesensePagedSearchResult> {
    return searchTypesensePagedDocumentIds<T>({
      client: this.client,
      logger: this.logger,
      collectionName,
      query,
      queryBy,
      options,
      allowMatchAll,
    });
  }

  private async resolveMajorEventName(majorEventId?: string | null): Promise<string | undefined> {
    if (!majorEventId) {
      return undefined;
    }

    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: { id: majorEventId, deletedAt: null },
      select: { name: true },
    });

    return toOptionalString(majorEvent?.name);
  }

  private async resolveMajorEventPublicationState(majorEventId?: string | null): Promise<string> {
    if (!majorEventId) {
      return 'PUBLISHED';
    }

    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: { id: majorEventId, deletedAt: null },
      select: { publicationState: true },
    });

    return majorEvent?.publicationState ?? 'UNPUBLISHED';
  }

  private async resolveEventGroupContext(eventGroupId?: string | null): Promise<{
    name: string;
    shouldIssueCertificate: boolean;
    shouldIssueCertificateForEachEvent: boolean;
  } | null> {
    if (!eventGroupId) {
      return null;
    }

    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: { id: eventGroupId, deletedAt: null },
      select: {
        name: true,
        shouldIssueCertificate: true,
        shouldIssueCertificateForEachEvent: true,
      },
    });

    if (!eventGroup) {
      return null;
    }

    return {
      name: toOptionalString(eventGroup.name) ?? '',
      shouldIssueCertificate: eventGroup.shouldIssueCertificate,
      shouldIssueCertificateForEachEvent: eventGroup.shouldIssueCertificateForEachEvent,
    };
  }
}
