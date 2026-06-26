import type { Logger } from '@nestjs/common';
import type { CollectionCreateSchema } from 'typesense';
import type { Client as TypesenseClient } from 'typesense';
import { createTypesenseCollectionSchemas, findMissingTypesenseFields } from './typesense-search.collections';

export async function ensureTypesenseCollections(client: TypesenseClient | null): Promise<void> {
  if (!client) {
    return;
  }

  for (const schema of createTypesenseCollectionSchemas()) {
    await ensureTypesenseCollection(client, schema);
  }
}

export async function ensureTypesenseCollection(
  client: TypesenseClient | null,
  schema: CollectionCreateSchema,
): Promise<void> {
  if (!client) {
    return;
  }

  const collection = client.collections(schema.name);
  const exists = await collection.exists();
  if (!exists) {
    await client.collections().create(schema);
    return;
  }

  const existing = await collection.retrieve();
  const missingFields = findMissingTypesenseFields(schema, existing);
  if (missingFields.length > 0) {
    await collection.update({ fields: missingFields });
  }
}

export async function replaceTypesenseCollectionDocuments<T extends { id: string }>(input: {
  client: TypesenseClient | null;
  logger: Logger;
  schema: CollectionCreateSchema;
  documents: T[];
}): Promise<void> {
  if (!input.client) {
    return;
  }

  try {
    const collection = input.client.collections<T & Record<string, unknown>>(input.schema.name);
    await collection.delete();
    await input.client.collections().create(input.schema);
    if (input.documents.length === 0) {
      return;
    }
    await collection.documents().import(input.documents, { action: 'upsert' });
  } catch (error) {
    input.logger.error(`Failed to replace Typesense documents for ${input.schema.name}.`, error);
  }
}

export async function upsertTypesenseDocument<T extends { id: string }>(input: {
  client: TypesenseClient | null;
  logger: Logger;
  collectionName: string;
  document: T;
}): Promise<void> {
  if (!input.client) {
    return;
  }

  try {
    await input.client.collections<T & Record<string, unknown>>(input.collectionName).documents().upsert(input.document);
  } catch (error) {
    input.logger.error(`Failed to upsert Typesense document ${input.document.id} in ${input.collectionName}.`, error);
  }
}

export async function deleteTypesenseDocument(input: {
  client: TypesenseClient | null;
  logger: Logger;
  collectionName: string;
  id: string;
}): Promise<void> {
  if (!input.client) {
    return;
  }

  try {
    await input.client.collections(input.collectionName).documents(input.id).delete();
  } catch (error) {
    input.logger.error(`Failed to delete Typesense document ${input.id} from ${input.collectionName}.`, error);
  }
}
