import type { Logger } from '@nestjs/common';
import type {
  CollectionAliasSchema,
  CollectionCreateSchema,
  CollectionFieldSchema,
  CollectionSchema,
  ImportResponse,
} from 'typesense';
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

  if (hasStructuralTypesenseFieldDrift(schema, existing)) {
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
    const conflictingCollection = existingCollection && !existingAlias ? existingCollection : null;
    const temporaryCollection = client.collections<T & Record<string, unknown>>(temporaryCollectionName);

    await client.collections().create(temporarySchema);
    if (input.documents.length > 0) {
      const importResult = await temporaryCollection.documents().import(input.documents, { action: 'upsert' });
      assertTypesenseImportSucceeded(importResult, collectionName);
    }
    await pointTypesenseAliasAtCollection(client, collectionName, temporaryCollectionName, conflictingCollection);
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
  conflictingCollection: CollectionSchema | null,
): Promise<void> {
  try {
    await client.aliases().upsert(aliasName, { collection_name: collectionName });
  } catch (error) {
    if (!conflictingCollection || !isAliasCollectionNameConflict(error)) {
      throw error;
    }

    await migrateDirectTypesenseCollectionToAlias(client, aliasName, collectionName, conflictingCollection);
  }
}

async function migrateDirectTypesenseCollectionToAlias(
  client: TypesenseClient,
  aliasName: string,
  collectionName: string,
  conflictingCollection: CollectionSchema,
): Promise<void> {
  const backupCollectionName = createTemporaryTypesenseCollectionName(`${aliasName}_migration_backup`);
  const backupSchema = toCollectionCreateSchema(conflictingCollection, backupCollectionName);
  await client.collections().create(backupSchema);

  try {
    const exportedDocuments = await client.collections(aliasName).documents().export();
    if (exportedDocuments.trim()) {
      const backupImportResult = await client.collections(backupCollectionName).documents().import(exportedDocuments, {
        action: 'create',
      });
      assertTypesenseImportSucceeded(backupImportResult, backupCollectionName);
    }

    await deleteTypesenseCollectionIfExists(client, aliasName);
    try {
      await client.aliases().upsert(aliasName, { collection_name: collectionName });
    } catch (error) {
      await restoreDirectTypesenseCollectionFromBackup(client, aliasName, conflictingCollection, backupCollectionName).catch(
        () => undefined,
      );
      throw error;
    }
  } finally {
    await deleteTypesenseCollectionIfExists(client, backupCollectionName).catch(() => undefined);
  }
}

async function restoreDirectTypesenseCollectionFromBackup(
  client: TypesenseClient,
  collectionName: string,
  schema: CollectionSchema,
  backupCollectionName: string,
): Promise<void> {
  await deleteTypesenseCollectionIfExists(client, collectionName);
  await client.collections().create(toCollectionCreateSchema(schema, collectionName));

  const exportedDocuments = await client.collections(backupCollectionName).documents().export();
  if (!exportedDocuments.trim()) {
    return;
  }

  const importResult = await client.collections(collectionName).documents().import(exportedDocuments, { action: 'create' });
  assertTypesenseImportSucceeded(importResult, collectionName);
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

function toCollectionCreateSchema(schema: CollectionSchema, name: string): CollectionCreateSchema {
  return {
    name,
    fields: schema.fields,
    default_sorting_field: schema.default_sorting_field,
    symbols_to_index: schema.symbols_to_index,
    token_separators: schema.token_separators,
    enable_nested_fields: schema.enable_nested_fields,
    metadata: schema.metadata,
    voice_query_model: schema.voice_query_model,
    synonym_sets: schema.synonym_sets,
    curation_sets: schema.curation_sets,
  };
}

function hasStructuralTypesenseFieldDrift(schema: CollectionCreateSchema, existing: CollectionSchema): boolean {
  const currentFields = new Map(existing.fields.map((field) => [field.name, field]));

  return (schema.fields ?? []).some((field) => {
    const currentField = currentFields.get(field.name);
    return currentField ? hasTypesenseFieldDrift(field, currentField) : false;
  });
}

function hasTypesenseFieldDrift(expected: CollectionFieldSchema, current: CollectionFieldSchema): boolean {
  return (
    expected.type !== current.type ||
    Boolean(expected.facet) !== Boolean(current.facet) ||
    Boolean(expected.optional) !== Boolean(current.optional) ||
    Boolean(expected.sort) !== Boolean(current.sort)
  );
}

function assertTypesenseImportSucceeded(result: ImportResponse[] | string, collectionName: string): void {
  const failures =
    typeof result === 'string' ? parseTypesenseImportFailures(result) : result.filter((entry) => !entry.success);
  if (failures.length === 0) {
    return;
  }

  const failure = failures[0];
  const message = typeof failure.error === 'string' ? failure.error : 'Unknown Typesense import failure.';
  throw new Error(`Failed to import Typesense documents into ${collectionName}: ${message}`);
}

function parseTypesenseImportFailures(result: string): ImportResponse[] {
  return result
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const entry = JSON.parse(line) as ImportResponse;
        return entry.success === false ? [entry] : [];
      } catch {
        return [{ success: false, error: `Invalid Typesense import response: ${line}`, code: 0 }];
      }
    });
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
