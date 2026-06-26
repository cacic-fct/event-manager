import type { Logger } from '@nestjs/common';
import type { CollectionAliasSchema, CollectionCreateSchema, CollectionSchema } from 'typesense';
import type { Client as TypesenseClient } from 'typesense';
import { createTypesenseCollectionSchemas, findMissingTypesenseFields } from './typesense-search.collections';

type TypesenseCollectionReader = {
  retrieve(): Promise<CollectionSchema>;
};

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
  const existing = await retrieveTypesenseCollectionIfExists(collection);
  if (!existing) {
    await client.collections().create(schema);
    return;
  }

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
  const client = input.client;
  if (!client) {
    return;
  }

  let temporaryCollectionName: string | null = null;
  try {
    const collectionName = input.schema.name;
    temporaryCollectionName = createTemporaryTypesenseCollectionName(collectionName);
    const temporarySchema = { ...input.schema, name: temporaryCollectionName };
    const existingAlias = await retrieveTypesenseAliasIfExists(client, collectionName);
    const existingCollection = await retrieveTypesenseCollectionIfExists(client.collections(collectionName));
    const previousCollectionName = existingAlias?.collection_name ?? null;
    const aliasMayConflictWithCollection = Boolean(existingCollection && !existingAlias);
    const temporaryCollection = client.collections<T & Record<string, unknown>>(temporaryCollectionName);

    await client.collections().create(temporarySchema);
    if (input.documents.length === 0) {
      await pointTypesenseAliasAtCollection(client, collectionName, temporaryCollectionName, aliasMayConflictWithCollection);
      await deletePreviousTypesenseCollection(client, previousCollectionName, temporaryCollectionName);
      return;
    }
    await temporaryCollection.documents().import(input.documents, { action: 'upsert' });
    await pointTypesenseAliasAtCollection(client, collectionName, temporaryCollectionName, aliasMayConflictWithCollection);
    await deletePreviousTypesenseCollection(client, previousCollectionName, temporaryCollectionName);
  } catch (error) {
    if (temporaryCollectionName) {
      await deleteTypesenseCollectionIfExists(client, temporaryCollectionName).catch(() => undefined);
    }
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

async function retrieveTypesenseCollectionIfExists(collection: TypesenseCollectionReader): Promise<CollectionSchema | null> {
  try {
    return await collection.retrieve();
  } catch (error) {
    if (readHttpStatus(error) === 404) {
      return null;
    }

    throw error;
  }
}

async function retrieveTypesenseAliasIfExists(
  client: TypesenseClient,
  aliasName: string,
): Promise<CollectionAliasSchema | null> {
  try {
    return await client.aliases(aliasName).retrieve();
  } catch (error) {
    if (readHttpStatus(error) === 404) {
      return null;
    }

    throw error;
  }
}

async function pointTypesenseAliasAtCollection(
  client: TypesenseClient,
  aliasName: string,
  collectionName: string,
  aliasMayConflictWithCollection: boolean,
): Promise<void> {
  try {
    await client.aliases().upsert(aliasName, { collection_name: collectionName });
  } catch (error) {
    if (!aliasMayConflictWithCollection || !isAliasCollectionNameConflict(error)) {
      throw error;
    }

    await deleteTypesenseCollectionIfExists(client, aliasName);
    await client.aliases().upsert(aliasName, { collection_name: collectionName });
  }
}

async function deletePreviousTypesenseCollection(
  client: TypesenseClient,
  previousCollectionName: string | null,
  currentCollectionName: string,
): Promise<void> {
  if (!previousCollectionName || previousCollectionName === currentCollectionName) {
    return;
  }

  await deleteTypesenseCollectionIfExists(client, previousCollectionName);
}

async function deleteTypesenseCollectionIfExists(client: TypesenseClient, collectionName: string): Promise<void> {
  const collection = client.collections(collectionName);
  const existing = await retrieveTypesenseCollectionIfExists(collection);
  if (!existing) {
    return;
  }

  await collection.delete();
}

function createTemporaryTypesenseCollectionName(collectionName: string): string {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `${collectionName}_reindex_${suffix}`;
}

function isAliasCollectionNameConflict(error: unknown): boolean {
  const httpStatus = readHttpStatus(error);
  return httpStatus === 400 || httpStatus === 409;
}

function readHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('httpStatus' in error)) {
    return undefined;
  }

  const httpStatus = (error as { httpStatus?: unknown }).httpStatus;
  return typeof httpStatus === 'number' ? httpStatus : undefined;
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
