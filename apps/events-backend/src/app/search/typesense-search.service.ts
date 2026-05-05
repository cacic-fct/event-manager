import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Typesense from 'typesense';
import type { CollectionCreateSchema, CollectionFieldSchema } from 'typesense';
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
  eventGroupId?: string;
  startDate: number;
  endDate: number;
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

  async searchEvents(query: string, take = 50): Promise<string[]> {
    return this.searchDocumentIds<EventSearchDocument>(
      'events',
      query,
      'name,description,shortDescription,emoji',
      take,
    );
  }

  async searchMajorEvents(query: string, take = 50): Promise<string[]> {
    return this.searchDocumentIds<MajorEventSearchDocument>(
      'major_events',
      query,
      'name,description',
      take,
    );
  }

  async searchEventGroups(query: string, take = 50): Promise<string[]> {
    return this.searchDocumentIds<EventGroupSearchDocument>(
      'event_groups',
      query,
      'name',
      take,
    );
  }

  async searchPeople(query: string, take = 50): Promise<string[]> {
    return this.searchDocumentIds<PersonSearchDocument>(
      'people',
      query,
      'name,email,secondaryEmails,phone,identityDocument,academicId',
      take,
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
    startDate: Date;
    endDate: Date;
  }): Promise<void> {
    await this.upsertDocument<EventSearchDocument>('events', {
      id: input.id,
      name: input.name,
      emoji: input.emoji,
      type: input.type,
      description: this.toOptionalString(input.description),
      shortDescription: this.toOptionalString(input.shortDescription),
      locationDescription: this.toOptionalString(input.locationDescription),
      majorEventId: this.toOptionalString(input.majorEventId),
      eventGroupId: this.toOptionalString(input.eventGroupId),
      startDate: this.toUnixTimestamp(input.startDate),
      endDate: this.toUnixTimestamp(input.endDate),
    });
  }

  async deleteEvent(id: string): Promise<void> {
    await this.deleteDocument('events', id);
  }

  async upsertMajorEvent(input: {
    id: string;
    name: string;
    description?: string | null;
    startDate: Date;
    endDate: Date;
  }): Promise<void> {
    await this.upsertDocument<MajorEventSearchDocument>('major_events', {
      id: input.id,
      name: input.name,
      description: this.toOptionalString(input.description),
      startDate: this.toUnixTimestamp(input.startDate),
      endDate: this.toUnixTimestamp(input.endDate),
    });
  }

  async deleteMajorEvent(id: string): Promise<void> {
    await this.deleteDocument('major_events', id);
  }

  async upsertEventGroup(input: { id: string; name: string }): Promise<void> {
    await this.upsertDocument<EventGroupSearchDocument>('event_groups', {
      id: input.id,
      name: input.name,
    });
  }

  async deleteEventGroup(id: string): Promise<void> {
    await this.deleteDocument('event_groups', id);
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
    await this.upsertDocument<PersonSearchDocument>('people', {
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
    await this.deleteDocument('people', id);
  }

  private buildClient(): TypesenseClient | null {
    if (!this.enabled) {
      return null;
    }

    const host = process.env.TYPESENSE_HOST;
    const protocol = process.env.TYPESENSE_PROTOCOL;
    const apiKey = process.env.TYPESENSE_API_KEY;
    const portRaw = process.env.TYPESENSE_PORT;

    if (!host || !protocol || !apiKey || !portRaw) {
      this.logger.warn(
        'Typesense is enabled but configuration is incomplete. Disabling search indexing.',
      );
      return null;
    }

    const port = Number(portRaw);
    if (!Number.isFinite(port)) {
      this.logger.warn(
        'Typesense port is invalid. Disabling search indexing.',
      );
      return null;
    }

    return new Typesense.Client({
      apiKey,
      nodes: [{ host, port, protocol }],
      connectionTimeoutSeconds: 5,
    });
  }

  private async ensureCollections(): Promise<void> {
    if (!this.client) {
      return;
    }

    const schemas = [
      this.createCollectionSchema('events', [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'emoji', type: 'string', optional: true },
        { name: 'type', type: 'string', facet: true },
        { name: 'description', type: 'string', optional: true },
        { name: 'shortDescription', type: 'string', optional: true },
        { name: 'locationDescription', type: 'string', optional: true },
        { name: 'majorEventId', type: 'string', optional: true, facet: true },
        { name: 'eventGroupId', type: 'string', optional: true, facet: true },
        { name: 'startDate', type: 'int64', sort: true },
        { name: 'endDate', type: 'int64', sort: true },
      ]),
      this.createCollectionSchema('major_events', [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', optional: true },
        { name: 'startDate', type: 'int64', sort: true },
        { name: 'endDate', type: 'int64', sort: true },
      ]),
      this.createCollectionSchema('event_groups', [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
      ]),
      this.createCollectionSchema('people', [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string', optional: true },
        { name: 'secondaryEmails', type: 'string[]', optional: true },
        { name: 'phone', type: 'string', optional: true },
        { name: 'identityDocument', type: 'string', optional: true, facet: true },
        { name: 'academicId', type: 'string', optional: true, facet: true },
        { name: 'userId', type: 'string', optional: true, facet: true },
      ]),
    ];

    for (const schema of schemas) {
      const collection = this.client.collections(schema.name);
      const exists = await collection.exists();
      if (!exists) {
        await this.client.collections().create(schema);
      }
    }
  }

  private createCollectionSchema(
    name: string,
    fields: CollectionFieldSchema[],
  ): CollectionCreateSchema {
    return {
      name,
      fields,
    };
  }

  private async reindexAll(): Promise<void> {
    if (!this.client) {
      return;
    }

    const [events, majorEvents, eventGroups, people] = await Promise.all([
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
          eventGroupId: true,
          startDate: true,
          endDate: true,
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
    ]);

    await Promise.all([
      this.replaceCollectionDocuments<EventSearchDocument>(
        'events',
        events.map((event) => ({
          id: event.id,
          name: event.name,
          emoji: event.emoji,
          type: event.type,
          description: this.toOptionalString(event.description),
          shortDescription: this.toOptionalString(event.shortDescription),
          locationDescription: this.toOptionalString(event.locationDescription),
          majorEventId: this.toOptionalString(event.majorEventId),
          eventGroupId: this.toOptionalString(event.eventGroupId),
          startDate: this.toUnixTimestamp(event.startDate),
          endDate: this.toUnixTimestamp(event.endDate),
        })),
      ),
      this.replaceCollectionDocuments<MajorEventSearchDocument>(
        'major_events',
        majorEvents.map((majorEvent) => ({
          id: majorEvent.id,
          name: majorEvent.name,
          description: this.toOptionalString(majorEvent.description),
          startDate: this.toUnixTimestamp(majorEvent.startDate),
          endDate: this.toUnixTimestamp(majorEvent.endDate),
        })),
      ),
      this.replaceCollectionDocuments<EventGroupSearchDocument>(
        'event_groups',
        eventGroups.map((eventGroup) => ({
          id: eventGroup.id,
          name: eventGroup.name,
        })),
      ),
      this.replaceCollectionDocuments<PersonSearchDocument>(
        'people',
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
    ]);
  }

  private async replaceCollectionDocuments<T extends { id: string }>(
    collectionName: string,
    documents: T[],
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      const collection = this.client.collections<T & Record<string, unknown>>(
        collectionName,
      );
      await collection.documents().delete({ truncate: true });
      if (documents.length === 0) {
        return;
      }
      await collection.documents().import(documents, { action: 'upsert' });
    } catch (error) {
      this.logger.error(
        `Failed to replace Typesense documents for ${collectionName}.`,
        error,
      );
    }
  }

  private async upsertDocument<T extends { id: string }>(
    collectionName: string,
    document: T,
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client
        .collections<T & Record<string, unknown>>(collectionName)
        .documents()
        .upsert(document);
    } catch (error) {
      this.logger.error(
        `Failed to upsert Typesense document ${document.id} in ${collectionName}.`,
        error,
      );
    }
  }

  private async deleteDocument(
    collectionName: string,
    id: string,
  ): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.collections(collectionName).documents(id).delete();
    } catch (error) {
      this.logger.error(
        `Failed to delete Typesense document ${id} from ${collectionName}.`,
        error,
      );
    }
  }

  private async searchDocumentIds<T extends { id: string }>(
    collectionName: string,
    query: string,
    queryBy: string,
    take: number,
  ): Promise<string[]> {
    const normalizedQuery = query.trim();
    if (!this.client || !normalizedQuery) {
      return [];
    }

    try {
      const result = await this.client
        .collections<T & Record<string, unknown>>(collectionName)
        .documents()
        .search({
          q: normalizedQuery,
          query_by: queryBy,
          per_page: take,
        });

      return (
        result.hits?.map((hit) => hit.document.id).filter((id) => Boolean(id)) ??
        []
      );
    } catch (error) {
      this.logger.error(
        `Typesense search failed for collection ${collectionName}.`,
        error,
      );
      return [];
    }
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
