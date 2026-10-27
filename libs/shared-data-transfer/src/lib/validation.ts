import { Value } from '@sinclair/typebox/value';
import type { TransferIssue } from './models';
import { TransferDocumentSchema, type TransferDocument } from './schema';
import { TRANSFER_MAX_BYTES, TRANSFER_MAX_DEPTH } from './schema-helpers';

const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);

export class TransferValidationError extends Error {
  constructor(readonly issues: TransferIssue[]) {
    super(issues[0]?.message ?? 'Arquivo JSON inválido.');
    this.name = 'TransferValidationError';
  }
}

/** Reject dangerous keys and non-JSON values before inspecting the trusted, local schema. */
function assertJsonTree(
  value: unknown,
  depth = 0,
  ancestors = new Set<object>(),
  budget = { remaining: 100000 },
): void {
  if (depth > TRANSFER_MAX_DEPTH || --budget.remaining < 0) {
    throw new TransferValidationError([{ message: 'O arquivo excede o limite de complexidade.' }]);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return;
  }
  if (typeof value !== 'object') {
    throw new TransferValidationError([{ message: 'O arquivo deve conter apenas valores JSON.' }]);
  }
  if (ancestors.has(value)) {
    throw new TransferValidationError([{ message: 'O arquivo contém uma referência circular.' }]);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TransferValidationError([{ message: 'O arquivo contém um objeto inválido.' }]);
  }
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') {
      continue;
    }
    if (typeof key !== 'string' || unsafeKeys.has(key)) {
      throw new TransferValidationError([{ message: 'O arquivo contém uma propriedade não permitida.' }]);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
      throw new TransferValidationError([{ message: 'O arquivo contém uma propriedade inválida.' }]);
    }
    assertJsonTree(descriptor.value, depth + 1, ancestors, budget);
  }
  ancestors.delete(value);
}

export function parseTransferDocument(input: unknown): TransferDocument {
  assertJsonTree(input);
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > TRANSFER_MAX_BYTES) {
    throw new TransferValidationError([{ message: 'O arquivo excede o limite de 5 MiB.' }]);
  }
  if (!Value.Check(TransferDocumentSchema, input)) {
    const issues: TransferIssue[] = [];
    for (const error of Value.Errors(TransferDocumentSchema, input)) {
      issues.push({
        path: error.path,
        message: `Estrutura incompatível em ${error.path || '/'}. Baixe o schema da versão atual.`,
      });
      if (issues.length === 30) break;
    }
    throw new TransferValidationError(issues);
  }
  const document = input;
  const identities = new Set<string>();
  const keys = new Set<string>();
  for (const record of document.resources) {
    // TypeBox's object checker ignores supplementary anyOf; mirror the public schema's identity rule explicitly.
    if (!record.id && !record.key)
      throw new TransferValidationError([
        { kind: record.kind, message: 'Informe um ID existente ou uma chave local para cada registro.' },
      ]);
    const identity = record.id ? `${record.kind}:${record.id}` : undefined;
    if (identity && identities.has(identity)) {
      throw new TransferValidationError([
        { kind: record.kind, id: record.id, message: 'O mesmo ID aparece mais de uma vez para este tipo de registro.' },
      ]);
    }
    if (identity) identities.add(identity);
    if (record.key) {
      if (keys.has(record.key))
        throw new TransferValidationError([{ message: `A chave local ${record.key} aparece mais de uma vez.` }]);
      keys.add(record.key);
    }
  }
  return document;
}

export function parseTransferJson(text: string): TransferDocument {
  if (new TextEncoder().encode(text).byteLength > TRANSFER_MAX_BYTES) {
    throw new TransferValidationError([{ message: 'O arquivo excede o limite de 5 MiB.' }]);
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new TransferValidationError([{ message: 'JSON inválido. Confira vírgulas, aspas e chaves.' }]);
  }
  return parseTransferDocument(input);
}

export function validateTransferDocument(
  input: unknown,
): { valid: true; document: TransferDocument; issues: [] } | { valid: false; issues: TransferIssue[] } {
  try {
    return { valid: true, document: parseTransferDocument(input), issues: [] };
  } catch (error) {
    if (error instanceof TransferValidationError) {
      return { valid: false, issues: error.issues };
    }
    throw error;
  }
}

/** Sorting keys makes preview fingerprints independent of an editor's object-key ordering. */
export function canonicalTransferJson(value: unknown): string {
  assertJsonTree(value);
  function sorted(current: unknown): unknown {
    if (Array.isArray(current)) {
      return current.map(sorted);
    }
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, sorted(child)]),
      );
    }
    return current;
  }
  return JSON.stringify(sorted(value));
}
