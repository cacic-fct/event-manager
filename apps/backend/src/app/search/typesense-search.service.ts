import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import Typesense from 'typesense';
import type { CollectionCreateSchema, CollectionFieldSchema, CollectionSchema, SearchParams } from 'typesense';
import type { Client as TypesenseClient } from 'typesense';

type EventSearchDocument = {
  id: string;
  name: string;
  emoji: string;
  type: string;
  description?: string;
  shortDescription?: string;
  locationDescription?: string;
  majorEventId?: string;
  majorEventName?: string;
  eventGroupId?: string;
  eventGroupName?: string;
  startDate: number;
  endDate: number;
  publiclyVisible: boolean;
  isIssuableCertificateEvent: boolean;
};

type MajorEventSearchDocument = {
  id: string;
  name: string;
  description?: string;
  startDate: number;
  endDate: number;
};

type EventGroupSearchDocument = {
  id: string;
  name: string;
};

type PersonSearchDocument = {
  id: string;
  name: string;
  email?: string;
  secondaryEmails?: string[];
  phone?: string;
  identityDocument?: string;
  academicId?: string;
  userId?: string;
};

type PlacePresetSearchDocument = {
  id: string;
  name: string;
  locationDescription?: string;
};

type CertificateTemplateSearchDocument = {
  id: string;
  name: string;
  description?: string;
  version: number;
  isActive: boolean;
};

export type TypesenseSearchResult = {
  available: boolean;
  ids: string[];
};

export type TypesenseSearchOptions = {
  filterBy?: string;
  limit?: number;
  offset?: number;
};

type TypesenseNodeConfig = {
  host: string;
  port: number;
  protocol: string;
};

const TYPESENSE_MAX_PER_PAGE = 250;
const TYPESENSE_COLLECTION_PREFIX = 'cacic_event_manager_';
const TYPESENSE_COLLECTIONS = {
  events: `${TYPESENSE_COLLECTION_PREFIX}events`,
  majorEvents: `${TYPESENSE_COLLECTION_PREFIX}major_events`,
  eventGroups: `${TYPESENSE_COLLECTION_PREFIX}event_groups`,
  people: `${TYPESENSE_COLLECTION_PREFIX}people`,
  placePresets: `${TYPESENSE_COLLECTION_PREFIX}place_presets`,
  certificateTemplates: `${TYPESENSE_COLLECTION_PREFIX}certificate_templates`,
} as const;

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
    startDate: Date;
    endDate: Date;
  }): Promise<void> {
    if (!this.client) {
      return;
    }

    const [majorEventName, eventGroupContext] = await Promise.all([
      this.resolveMajorEventName(input.majorEventId),
      this.resolveEventGroupContext(input.eventGroupId),
    ]);

    await this.upsertDocument<EventSearchDocument>(TYPESENSE_COLLECTIONS.events, {
      id: input.id,
      name: input.name,
      emoji: input.emoji,
      type: input.type,
      description: this.toOptionalString(input.description),
      shortDescription: this.toOptionalString(input.shortDescription),
      locationDescription: this.toOptionalString(input.locationDescription),
      majorEventId: this.toOptionalString(input.majorEventId),
      majorEventName,
      eventGroupId: this.toOptionalString(input.eventGroupId),
      eventGroupName: eventGroupContext?.name,
      startDate: this.toUnixTimestamp(input.startDate),
      endDate: this.toUnixTimestamp(input.endDate),
      publiclyVisible: Boolean(input.publiclyVisible),
      isIssuableCertificateEvent: this.isIssuableCertificateEvent({
        eventGroup: eventGroupContext,
        eventGroupId: input.eventGroupId,
        majorEventId: input.majorEventId,
        shouldIssueCertificate: input.shouldIssueCertificate,
      }),
    });
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
  }): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.upsertDocument<MajorEventSearchDocument>(TYPESENSE_COLLECTIONS.majorEvents, {
      id: input.id,
      name: input.name,
      description: this.toOptionalString(input.description),
      startDate: this.toUnixTimestamp(input.startDate),
      endDate: this.toUnixTimestamp(input.endDate),
    });
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
    await this.upsertDocument<PersonSearchDocument>(TYPESENSE_COLLECTIONS.people, {
      id: input.id,
      name: input.name,
      email: this.toOptionalString(input.email),
      secondaryEmails: input.secondaryEmails?.filter(Boolean),
      phone: this.toOptionalString(input.phone),
      identityDocument: this.toOptionalString(input.identityDocument),
      academicId: this.toOptionalString(input.academicId),
      userId: this.toOptionalString(input.userId),
    });
  }

  async deletePerson(id: string): Promise<void> {
    await this.deleteDocument(TYPESENSE_COLLECTIONS.people, id);
  }

  async upsertPlacePreset(input: {
    id: string;
    name: string;
    locationDescription?: string | null;
  }): Promise<void> {
    await this.upsertDocument<PlacePresetSearchDocument>(TYPESENSE_COLLECTIONS.placePresets, {
      id: input.id,
      name: input.name,
      locationDescription: this.toOptionalString(input.locationDescription),
    });
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
    await this.upsertDocument<CertificateTemplateSearchDocument>(TYPESENSE_COLLECTIONS.certificateTemplates, {
      id: input.id,
      name: input.name,
      description: this.toOptionalString(input.description),
      version: input.version,
      isActive: input.isActive,
    });
  }

  async deleteCertificateTemplate(id: string): Promise<void> {
    await this.deleteDocument(TYPESENSE_COLLECTIONS.certificateTemplates, id);
  }

  private buildClient(): TypesenseClient | null {
    if (!this.enabled) {
      return null;
    }

    const urlConfig = this.buildNodeConfigFromUrl(process.env.TYPESENSE_URL);
    const apiKey = process.env.TYPESENSE_API_KEY;

    if (!apiKey) {
      this.logger.warn('Typesense is enabled but TYPESENSE_API_KEY is missing. Disabling search indexing.');
      return null;
    }

    if (!urlConfig) {
      this.logger.warn('Typesense is enabled but TYPESENSE_URL is missing or invalid. Disabling search indexing.');
      return null;
    }

    return new Typesense.Client({
      apiKey,
      nodes: [urlConfig],
      connectionTimeoutSeconds: 5,
    });
  }

  private buildNodeConfigFromUrl(rawUrl?: string): TypesenseNodeConfig | null {
    const value = rawUrl?.trim();
    if (!value) {
      return null;
    }

    try {
      const parsed = new URL(value);
      const protocol = parsed.protocol.replace(':', '');
      if (protocol !== 'http' && protocol !== 'https') {
        this.logger.warn('Typesense URL protocol must be http or https.');
        return null;
      }

      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : protocol === 'https' ? 443 : 80,
        protocol,
      };
    } catch {
      this.logger.warn('Typesense URL is invalid.');
      return null;
    }
  }

  private async ensureCollections(): Promise<void> {
    if (!this.client) {
      return;
    }

    const schemas = [
      this.createCollectionSchema(TYPESENSE_COLLECTIONS.events, [
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
        { name: 'isIssuableCertificateEvent', type: 'bool', optional: true, facet: true },
      ]),
      this.createCollectionSchema(TYPESENSE_COLLECTIONS.majorEvents, [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', optional: true },
        { name: 'startDate', type: 'int64', sort: true },
        { name: 'endDate', type: 'int64', sort: true },
      ]),
      this.createCollectionSchema(TYPESENSE_COLLECTIONS.eventGroups, [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
      ]),
      this.createCollectionSchema(TYPESENSE_COLLECTIONS.people, [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string', optional: true },
        { name: 'secondaryEmails', type: 'string[]', optional: true },
        { name: 'phone', type: 'string', optional: true },
        { name: 'identityDocument', type: 'string', optional: true, facet: true },
        { name: 'academicId', type: 'string', optional: true, facet: true },
        { name: 'userId', type: 'string', optional: true, facet: true },
      ]),
      this.createCollectionSchema(TYPESENSE_COLLECTIONS.placePresets, [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'locationDescription', type: 'string', optional: true },
      ]),
      this.createCollectionSchema(TYPESENSE_COLLECTIONS.certificateTemplates, [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', optional: true },
        { name: 'version', type: 'int32', sort: true },
        { name: 'isActive', type: 'bool', facet: true },
      ]),
    ];

    for (const schema of schemas) {
      await this.ensureCollection(schema);
    }
  }

  private async ensureCollection(schema: CollectionCreateSchema): Promise<void> {
    if (!this.client) {
      return;
    }

    const collection = this.client.collections(schema.name);
    const exists = await collection.exists();
    if (!exists) {
      await this.client.collections().create(schema);
      return;
    }

    const existing = await collection.retrieve();
    const missingFields = this.findMissingFields(schema, existing);
    if (missingFields.length > 0) {
      await collection.update({ fields: missingFields });
    }
  }

  private findMissingFields(schema: CollectionCreateSchema, existing: CollectionSchema): CollectionFieldSchema[] {
    const currentNames = new Set(existing.fields.map((field) => field.name));
    return (schema.fields ?? []).filter((field) => !currentNames.has(field.name));
  }

  private createCollectionSchema(name: string, fields: CollectionFieldSchema[]): CollectionCreateSchema {
    return {
      name,
      fields,
    };
  }

  private async reindexAll(): Promise<void> {
    if (!this.client) {
      return;
    }

    const [events, majorEvents, eventGroups, people, placePresets, certificateTemplates] = await Promise.all([
      this.prisma.event.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          emoji: true,
          type: true,
          description: true,
          shortDescription: true,
          locationDescription: true,
          majorEventId: true,
          majorEvent: {
            select: {
              name: true,
              deletedAt: true,
            },
          },
          eventGroupId: true,
          eventGroup: {
            select: {
              name: true,
              deletedAt: true,
              shouldIssueCertificate: true,
              shouldIssueCertificateForEachEvent: true,
            },
          },
          startDate: true,
          endDate: true,
          shouldIssueCertificate: true,
          publiclyVisible: true,
        },
      }),
      this.prisma.majorEvent.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          description: true,
          startDate: true,
          endDate: true,
        },
      }),
      this.prisma.eventGroup.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
        },
      }),
      this.prisma.people.findMany({
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
      this.prisma.placePreset.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          locationDescription: true,
        },
      }),
      this.prisma.certificateTemplate.findMany({
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

    await Promise.all([
      this.replaceCollectionDocuments<EventSearchDocument>(
        TYPESENSE_COLLECTIONS.events,
        events.map((event) => ({
          id: event.id,
          name: event.name,
          emoji: event.emoji,
          type: event.type,
          description: this.toOptionalString(event.description),
          shortDescription: this.toOptionalString(event.shortDescription),
          locationDescription: this.toOptionalString(event.locationDescription),
          majorEventId: this.toOptionalString(event.majorEventId),
          majorEventName: event.majorEvent?.deletedAt ? undefined : this.toOptionalString(event.majorEvent?.name),
          eventGroupId: this.toOptionalString(event.eventGroupId),
          eventGroupName: event.eventGroup?.deletedAt ? undefined : this.toOptionalString(event.eventGroup?.name),
          startDate: this.toUnixTimestamp(event.startDate),
          endDate: this.toUnixTimestamp(event.endDate),
          publiclyVisible: event.publiclyVisible,
          isIssuableCertificateEvent: this.isIssuableCertificateEvent(event),
        })),
      ),
      this.replaceCollectionDocuments<MajorEventSearchDocument>(
        TYPESENSE_COLLECTIONS.majorEvents,
        majorEvents.map((majorEvent) => ({
          id: majorEvent.id,
          name: majorEvent.name,
          description: this.toOptionalString(majorEvent.description),
          startDate: this.toUnixTimestamp(majorEvent.startDate),
          endDate: this.toUnixTimestamp(majorEvent.endDate),
        })),
      ),
      this.replaceCollectionDocuments<EventGroupSearchDocument>(
        TYPESENSE_COLLECTIONS.eventGroups,
        eventGroups.map((eventGroup) => ({
          id: eventGroup.id,
          name: eventGroup.name,
        })),
      ),
      this.replaceCollectionDocuments<PersonSearchDocument>(
        TYPESENSE_COLLECTIONS.people,
        people.map((person) => ({
          id: person.id,
          name: person.name,
          email: this.toOptionalString(person.email),
          secondaryEmails: person.secondaryEmails.filter(Boolean),
          phone: this.toOptionalString(person.phone),
          identityDocument: this.toOptionalString(person.identityDocument),
          academicId: this.toOptionalString(person.academicId),
          userId: this.toOptionalString(person.userId),
        })),
      ),
      this.replaceCollectionDocuments<PlacePresetSearchDocument>(
        TYPESENSE_COLLECTIONS.placePresets,
        placePresets.map((placePreset) => ({
          id: placePreset.id,
          name: placePreset.name,
          locationDescription: this.toOptionalString(placePreset.locationDescription),
        })),
      ),
      this.replaceCollectionDocuments<CertificateTemplateSearchDocument>(
        TYPESENSE_COLLECTIONS.certificateTemplates,
        certificateTemplates.map((certificateTemplate) => ({
          id: certificateTemplate.id,
          name: certificateTemplate.name,
          description: this.toOptionalString(certificateTemplate.description),
          version: certificateTemplate.version,
          isActive: certificateTemplate.isActive,
        })),
      ),
    ]);
  }

  private async reindexEventsByMajorEventId(majorEventId: string): Promise<void> {
    await this.reindexEvents({ majorEventId });
  }

  private async reindexEventsByEventGroupId(eventGroupId: string): Promise<void> {
    await this.reindexEvents({ eventGroupId });
  }

  private async reindexEvents(where: Prisma.EventWhereInput): Promise<void> {
    if (!this.client) {
      return;
    }

    const events = await this.prisma.event.findMany({
      where: {
        ...where,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        emoji: true,
        type: true,
        description: true,
        shortDescription: true,
        locationDescription: true,
        majorEventId: true,
        majorEvent: {
          select: {
            name: true,
            deletedAt: true,
          },
        },
        eventGroupId: true,
        eventGroup: {
          select: {
            name: true,
            deletedAt: true,
            shouldIssueCertificate: true,
            shouldIssueCertificateForEachEvent: true,
          },
        },
        startDate: true,
        endDate: true,
        shouldIssueCertificate: true,
        publiclyVisible: true,
      },
    });

    await Promise.all(
      events.map((event) =>
        this.upsertDocument<EventSearchDocument>(TYPESENSE_COLLECTIONS.events, {
          id: event.id,
          name: event.name,
          emoji: event.emoji,
          type: event.type,
          description: this.toOptionalString(event.description),
          shortDescription: this.toOptionalString(event.shortDescription),
          locationDescription: this.toOptionalString(event.locationDescription),
          majorEventId: this.toOptionalString(event.majorEventId),
          majorEventName: event.majorEvent?.deletedAt ? undefined : this.toOptionalString(event.majorEvent?.name),
          eventGroupId: this.toOptionalString(event.eventGroupId),
          eventGroupName: event.eventGroup?.deletedAt ? undefined : this.toOptionalString(event.eventGroup?.name),
          startDate: this.toUnixTimestamp(event.startDate),
          endDate: this.toUnixTimestamp(event.endDate),
          publiclyVisible: event.publiclyVisible,
          isIssuableCertificateEvent: this.isIssuableCertificateEvent(event),
        }),
      ),
    );
  }

  private async replaceCollectionDocuments<T extends { id: string }>(
    collectionName: string,
    documents: T[],
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const collection = this.client.collections<T & Record<string, unknown>>(collectionName);
      await collection.documents().delete({ truncate: true });
      if (documents.length === 0) {
        return;
      }
      await collection.documents().import(documents, { action: 'upsert' });
    } catch (error) {
      this.logger.error(`Failed to replace Typesense documents for ${collectionName}.`, error);
    }
  }

  private async upsertDocument<T extends { id: string }>(collectionName: string, document: T): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.collections<T & Record<string, unknown>>(collectionName).documents().upsert(document);
    } catch (error) {
      this.logger.error(`Failed to upsert Typesense document ${document.id} in ${collectionName}.`, error);
    }
  }

  private async deleteDocument(collectionName: string, id: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.collections(collectionName).documents(id).delete();
    } catch (error) {
      this.logger.error(`Failed to delete Typesense document ${id} from ${collectionName}.`, error);
    }
  }

  private async searchDocumentIds<T extends { id: string }>(
    collectionName: string,
    query: string,
    queryBy: string,
    options: number | TypesenseSearchOptions,
  ): Promise<TypesenseSearchResult> {
    const normalizedQuery = query.trim();
    if (!this.client || !normalizedQuery) {
      return { available: false, ids: [] };
    }

    const { filterBy, limit, offset } = this.normalizeSearchOptions(options);
    if (limit === 0) {
      return { available: true, ids: [] };
    }

    try {
      const ids: string[] = [];
      let nextOffset = offset;

      while (ids.length < limit) {
        const pageSize = Math.min(TYPESENSE_MAX_PER_PAGE, limit - ids.length);
        const searchParameters: SearchParams<T & Record<string, unknown>> = {
          q: normalizedQuery,
          query_by: queryBy,
          per_page: pageSize,
        };

        if (nextOffset > 0) {
          searchParameters.offset = nextOffset;
        }
        if (filterBy) {
          searchParameters.filter_by = filterBy;
        }

        const result = await this.client
          .collections<T & Record<string, unknown>>(collectionName)
          .documents()
          .search(searchParameters);
        const hits = result.hits ?? [];
        ids.push(...hits.map((hit) => hit.document.id).filter((id) => Boolean(id)));

        if (hits.length < pageSize) {
          break;
        }
        nextOffset += hits.length;
      }

      return {
        available: true,
        ids,
      };
    } catch (error) {
      this.logger.error(`Typesense search failed for collection ${collectionName}.`, error);
      return { available: false, ids: [] };
    }
  }

  private normalizeSearchOptions(options: number | TypesenseSearchOptions): Required<TypesenseSearchOptions> {
    if (typeof options === 'number') {
      return {
        filterBy: '',
        limit: Math.max(0, Math.floor(options)),
        offset: 0,
      };
    }

    return {
      filterBy: options.filterBy?.trim() ?? '',
      limit: Math.max(0, Math.floor(options.limit ?? 50)),
      offset: Math.max(0, Math.floor(options.offset ?? 0)),
    };
  }

  private async resolveMajorEventName(majorEventId?: string | null): Promise<string | undefined> {
    if (!majorEventId) {
      return undefined;
    }

    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: { id: majorEventId, deletedAt: null },
      select: { name: true },
    });

    return this.toOptionalString(majorEvent?.name);
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
      name: this.toOptionalString(eventGroup.name) ?? '',
      shouldIssueCertificate: eventGroup.shouldIssueCertificate,
      shouldIssueCertificateForEachEvent: eventGroup.shouldIssueCertificateForEachEvent,
    };
  }

  private isIssuableCertificateEvent(input: {
    eventGroup?: {
      deletedAt?: Date | string | null;
      shouldIssueCertificate?: boolean | null;
      shouldIssueCertificateForEachEvent?: boolean | null;
    } | null;
    eventGroupId?: string | null;
    majorEventId?: string | null;
    shouldIssueCertificate?: boolean | null;
  }): boolean {
    if (input.majorEventId || !input.shouldIssueCertificate) {
      return false;
    }

    if (!input.eventGroupId) {
      return true;
    }

    return Boolean(
      input.eventGroup &&
        !input.eventGroup.deletedAt &&
        input.eventGroup.shouldIssueCertificate &&
        input.eventGroup.shouldIssueCertificateForEachEvent,
    );
  }

  private toUnixTimestamp(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }

  private toOptionalString(value?: string | null): string | undefined {
    if (!value) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
