import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canonicalTransferJson,
  TransferDocumentSchema,
  type JsonValue,
  type TransferResource,
  type TransferResourceKind,
} from '@cacic-fct/shared-data-transfer';
import type { TransferAuthorizationScope, TransferWriteAction } from './data-transfer-adapter';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { AUDIT_BATCH_TRANSACTION } from '../audit-log/audit-transaction-context';

export interface JournalSource {
  kind: TransferResourceKind;
  id: string;
  action: TransferWriteAction;
  scope: TransferAuthorizationScope;
}

export interface JournalMutation {
  model: string;
  key: Record<string, JsonValue>;
  before: Record<string, JsonValue> | null;
  after: Record<string, JsonValue> | null;
  source: JournalSource;
}

interface Delegate {
  findMany(args: { where?: unknown; take?: number; select?: unknown }): Promise<object[]>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: { where: unknown; data: Record<string, unknown> }): Promise<{ count: number }>;
  deleteMany(args: { where: unknown }): Promise<{ count: number }>;
}

const writes = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);
const maximumRows = 5000;
const maximumBytes = 20 * 1024 * 1024;
const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [lowerFirst(model.name), model]));
type PrismaModel = keyof Prisma.TypeMap['model'] & string;
type PrismaModelProperty = Uncapitalize<PrismaModel>;
type PrismaScalarKeysByModel = {
  [Model in PrismaModel as Uncapitalize<Model>]: keyof Prisma.TypeMap['model'][Model]['payload']['scalars'] & string;
};
const compoundKeys = {
  eventAttendance: ['personId', 'eventId'],
  eventAttendanceCollector: ['eventId', 'personId'],
  eventAudienceInvitation: ['eventId', 'personId'],
  eventGroupAudienceInvitation: ['eventGroupId', 'personId'],
  majorEventAudienceInvitation: ['majorEventId', 'personId'],
  eventLecturer: ['eventId', 'personId'],
  externalImportRecord: ['sourceNamespace', 'entityType', 'sourceId'],
  eventFormLinkPriceTier: ['linkId', 'priceTierId'],
  eventManagerRolePermission: ['roleId', 'permission'],
  sportsPlayerApplicationCategory: ['applicationId', 'categoryId'],
  ticketTransferAuthorCooldown: ['userId'],
  userCalendarFeedSettings: ['userId'],
  userAdminCalendarFeedSettings: ['userId'],
  accountUserMerge: ['oldUserId'],
} as const satisfies Partial<{ [Model in PrismaModelProperty]: readonly PrismaScalarKeysByModel[Model][] }>;
const deletableLeaves = new Set([
  'eventFormLinkPriceTier',
  'majorEventSubscriptionEventSelection',
  'eventTicketHistory',
  'ticketNotificationOutbox',
  'eventTicketRealtimeOutbox',
]);

export interface JournalRelationReference {
  targetModel: string;
  keys: Record<string, JsonValue>[];
}

export interface JournalCreationReferenceSnapshot {
  model: string;
  key: Record<string, JsonValue>;
  relations: Record<string, JournalRelationReference>;
}

function lowerFirst(value: string): string {
  return value[0].toLowerCase() + value.slice(1);
}
function hasCompoundKey(modelName: string): modelName is keyof typeof compoundKeys {
  return Object.prototype.hasOwnProperty.call(compoundKeys, modelName);
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function journalSchemaFingerprint(): string {
  const database = Prisma.dmmf.datamodel.models.map((model) => ({
    name: model.name,
    key: primaryFields(lowerFirst(model.name)),
    fields: model.fields.map((field) => ({
      name: field.name,
      type: field.type,
      kind: field.kind,
      relationName: field.relationName,
      list: field.isList,
      required: field.isRequired,
    })),
  }));
  // TypeBox uses symbol metadata and the runtime DMMF omits optional fields; serialize their JSON representation.
  return createHash('sha256')
    .update(JSON.stringify({ database, transferSchema: TransferDocumentSchema }))
    .digest('hex');
}

export function journalDelegate(tx: Prisma.TransactionClient, model: string): Delegate {
  if (!models.has(model)) throw new ConflictException('O schema deste lote não corresponde ao schema atual.');
  const delegate: unknown = Reflect.get(tx, model);
  if (!delegate || typeof delegate !== 'object')
    throw new ConflictException('O recurso deste lote não está disponível.');
  return delegate as Delegate;
}

export function primaryFields(modelName: string): readonly string[] {
  const model = models.get(modelName);
  if (!model) return [];
  // Prisma 7's runtime DMMF omits PK metadata; this map is compile-time checked against generated scalar keys.
  return (
    model.primaryKey?.fields ??
    (hasCompoundKey(modelName) ? compoundKeys[modelName] : undefined) ??
    (model.fields.some((field) => field.name === 'id' && field.kind !== 'object') ? ['id'] : [])
  );
}

function modelRelations(modelName: string): Array<{ name: string; targetModel: string }> {
  const model = models.get(modelName);
  if (!model) throw new BadRequestException('Não foi possível conferir as relações deste lote.');
  return model.fields
    .filter((field) => field.kind === 'object')
    .map((field) => {
      const targetModel = lowerFirst(field.type);
      if (!models.has(targetModel) || !primaryFields(targetModel).length)
        throw new BadRequestException('Não foi possível conferir as relações deste lote.');
      return { name: field.name, targetModel };
    });
}

function primarySelect(modelName: string): Record<string, true> {
  const keys = primaryFields(modelName);
  if (!keys.length) throw new BadRequestException('Não foi possível identificar a chave deste recurso.');
  return Object.fromEntries(keys.map((field) => [field, true]));
}

export function normalizeJournalRelationKeys(targetModel: string, value: unknown): Record<string, JsonValue>[] {
  if (value === undefined) throw new BadRequestException('Não foi possível conferir as relações deste lote.');
  if (value === null) return [];
  const values = Array.isArray(value) ? value : [value];
  const keys = values.map((entry) => {
    const row = journalJson(object(entry));
    const fields = primaryFields(targetModel);
    if (!fields.length || fields.some((field) => row[field] === undefined))
      throw new BadRequestException('Não foi possível criar uma cópia reversível das relações deste lote.');
    return Object.fromEntries(fields.map((field) => [field, row[field]]));
  });
  return keys.sort((left, right) => canonicalTransferJson(left).localeCompare(canonicalTransferJson(right)));
}

function liveCreatedRows(mutations: JournalMutation[]): Array<{ model: string; key: Record<string, JsonValue> }> {
  const rows = new Map<
    string,
    { model: string; key: Record<string, JsonValue>; created: boolean; after: Record<string, JsonValue> | null }
  >();
  for (const mutation of mutations) {
    const identity = `${mutation.model}:${canonicalTransferJson(mutation.key)}`;
    const current = rows.get(identity);
    if (current) current.after = mutation.after;
    else
      rows.set(identity, {
        model: mutation.model,
        key: mutation.key,
        created: mutation.before === null,
        after: mutation.after,
      });
  }
  return [...rows.values()]
    .filter((row) => row.created && row.after !== null)
    .map(({ model, key }) => ({ model, key }));
}

function assertReferenceSnapshotLimits(rowCount: number, referenceCount: number, bytes: number): void {
  if (rowCount > maximumRows || referenceCount > maximumRows || bytes > maximumBytes)
    throw new BadRequestException('O lote excede o limite de cópias reversíveis.');
}

export function assertJournalReferenceLimits(rowCount: number, referenceCount: number, bytes: number): void {
  assertReferenceSnapshotLimits(rowCount, referenceCount, bytes);
}

async function captureCreationReferences(
  tx: Prisma.TransactionClient,
  rows: Array<{ model: string; key: Record<string, JsonValue> }>,
): Promise<JournalCreationReferenceSnapshot[]> {
  const snapshots: JournalCreationReferenceSnapshot[] = [];
  let references = 0;
  let bytes = 0;
  const rowsByModel = new Map<string, Array<{ model: string; key: Record<string, JsonValue> }>>();
  for (const row of rows) rowsByModel.set(row.model, [...(rowsByModel.get(row.model) ?? []), row]);
  for (const [model, modelRows] of rowsByModel) {
    const relations = modelRelations(model);
    const select: Record<string, unknown> = { ...primarySelect(model) };
    for (const relation of relations) select[relation.name] = { select: primarySelect(relation.targetModel) };
    const where = modelRows.length === 1 ? modelRows[0]?.key : { OR: modelRows.map((entry) => entry.key) };
    const matches = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      journalDelegate(tx, model).findMany({ where, take: maximumRows + 1, select }),
    );
    if (matches.length !== modelRows.length || matches.length > maximumRows)
      throw new BadRequestException('Não foi possível criar uma cópia reversível deste recurso.');
    const rowsByKey = new Map(
      matches.map((entry) => {
        const row = object(entry);
        if (primaryFields(model).some((field) => row[field] === undefined))
          throw new BadRequestException('Não foi possível identificar a chave deste recurso.');
        return [canonicalTransferJson(keyOf(model, journalJson(row))), row] as const;
      }),
    );
    if (
      rowsByKey.size !== matches.length ||
      modelRows.some((entry) => !rowsByKey.has(canonicalTransferJson(entry.key)))
    )
      throw new BadRequestException('Não foi possível criar uma cópia reversível deste recurso.');
    for (const { key } of modelRows) {
      const row = rowsByKey.get(canonicalTransferJson(key));
      if (!row) throw new BadRequestException('Não foi possível criar uma cópia reversível deste recurso.');
      const relationReferences: Record<string, JournalRelationReference> = {};
      for (const relation of relations) {
        const relatedKeys = normalizeJournalRelationKeys(relation.targetModel, row[relation.name]);
        references += relatedKeys.length;
        relationReferences[relation.name] = { targetModel: relation.targetModel, keys: relatedKeys };
      }
      const snapshot: JournalCreationReferenceSnapshot = { model, key, relations: relationReferences };
      snapshots.push(snapshot);
      references += 1;
      bytes += Buffer.byteLength(JSON.stringify(snapshot));
      assertReferenceSnapshotLimits(snapshots.length, references, bytes);
    }
  }
  return snapshots;
}

export async function journalCreationReferences(
  tx: Prisma.TransactionClient,
  mutations: JournalMutation[],
): Promise<JournalCreationReferenceSnapshot[]> {
  return captureCreationReferences(tx, liveCreatedRows(mutations));
}

export async function assertJournalCreationReferencesUnchanged(
  tx: Prisma.TransactionClient,
  mutations: JournalMutation[],
  snapshots: JournalCreationReferenceSnapshot[] | undefined,
): Promise<void> {
  const createdRows = liveCreatedRows(mutations);
  if (!Array.isArray(snapshots) || snapshots.length !== createdRows.length)
    throw new ConflictException(
      'As relações de um registro criado mudaram depois da importação. Nenhuma alteração foi desfeita.',
    );
  const expected = new Map(
    snapshots.map((snapshot) => [`${snapshot.model}:${canonicalTransferJson(snapshot.key)}`, snapshot]),
  );
  if (
    expected.size !== snapshots.length ||
    createdRows.some(({ model, key }) => !expected.has(`${model}:${canonicalTransferJson(key)}`))
  ) {
    throw new ConflictException(
      'As relações de um registro criado mudaram depois da importação. Nenhuma alteração foi desfeita.',
    );
  }
  const actual = await captureCreationReferences(tx, createdRows);
  if (canonicalTransferJson(actual) !== canonicalTransferJson(snapshots))
    throw new ConflictException(
      'As relações de um registro criado mudaram depois da importação. Nenhuma alteração foi desfeita.',
    );
}

export function journalJson(value: object): Record<string, JsonValue> {
  return JSON.parse(
    JSON.stringify(value, (_key, entry: unknown) => (typeof entry === 'bigint' ? entry.toString() : entry)),
  ) as Record<string, JsonValue>;
}

function keyOf(model: string, row: Record<string, JsonValue>): Record<string, JsonValue> {
  const fields = primaryFields(model);
  if (!fields.length || fields.some((field) => row[field] === undefined))
    throw new BadRequestException('Não foi possível criar uma cópia reversível deste recurso.');
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

/** Compound primary-key selectors are accepted by single-row writes, but not by findMany. */
function journalReadWhere(model: string, input: unknown): unknown {
  const fields = primaryFields(model);
  if (fields.length < 2) return input;
  const where = object(input);
  const selector = fields.join('_');
  if (!Object.prototype.hasOwnProperty.call(where, selector)) return input;
  const compound = object(where[selector]);
  if (fields.some((field) => compound[field] === undefined) || Object.keys(compound).length !== fields.length)
    throw new BadRequestException('Não foi possível identificar a chave deste recurso.');
  const remaining = { ...where };
  delete remaining[selector];
  const key = Object.fromEntries(fields.map((field) => [field, compound[field]]));
  return Object.keys(remaining).length ? { AND: [remaining, key] } : key;
}

/** Restore trusted scalar database snapshots; relations and client-supplied fields never enter this function. */
export function journalRestoreData(
  modelName: string,
  row: Record<string, JsonValue>,
  includeKey: boolean,
): Record<string, unknown> {
  const model = models.get(modelName);
  if (!model) throw new ConflictException('Schema incompatível com este lote.');
  const keys = primaryFields(modelName);
  const data: Record<string, unknown> = {};
  for (const field of model.fields) {
    if (field.kind === 'object' || !(field.name in row) || (!includeKey && keys.includes(field.name))) continue;
    const value = row[field.name];
    data[field.name] =
      field.type === 'DateTime' && typeof value === 'string'
        ? new Date(value)
        : field.type === 'BigInt' && typeof value === 'string'
          ? BigInt(value)
          : field.type === 'Json' && value === null
            ? field.isRequired
              ? Prisma.JsonNull
              : Prisma.DbNull
            : value;
  }
  return data;
}

/** Tracks database writes in the caller-owned transaction. No durable write occurs outside that transaction. */
export class TransferJournalRecorder {
  readonly batchId = randomUUID();
  readonly auditEntryIds: string[] = [];
  readonly mutations: JournalMutation[] = [];
  readonly tx: Prisma.TransactionClient;
  private source?: JournalSource;
  private capturedRows = 0;
  private capturedBytes = 0;

  constructor(private readonly original: Prisma.TransactionClient) {
    this.tx = new Proxy(original, {
      get: (target, property) => {
        if (property === AUDIT_BATCH_TRANSACTION) return this.batchId;
        const value: unknown = Reflect.get(target, property, target);
        if (property === '$executeRaw' || property === '$executeRawUnsafe')
          return (...args: unknown[]) => this.rawWrite(property, args);
        if (property === '$queryRaw' || property === '$queryRawUnsafe')
          return (...args: unknown[]) => this.rawRead(property, args);
        if (property === 'auditLogEntry' && value && typeof value === 'object') {
          return new Proxy(value, {
            get: (delegate, operation) => {
              const method: unknown = Reflect.get(delegate, operation, delegate);
              if (typeof method !== 'function') return method;
              if (operation !== 'create') return method.bind(delegate);
              return async (args: unknown) => {
                const entry: unknown = await Reflect.apply(method, delegate, [args]);
                const id = object(entry)['id'];
                if (typeof id !== 'string')
                  throw new BadRequestException('A alteração não gerou um registro de auditoria rastreável.');
                this.auditEntryIds.push(id);
                return entry;
              };
            },
          });
        }
        if (typeof property !== 'string' || !models.has(property) || !value || typeof value !== 'object')
          return typeof value === 'function' ? value.bind(target) : value;
        return new Proxy(value, {
          get: (delegate, operation) => {
            const method: unknown = Reflect.get(delegate, operation, delegate);
            if (typeof method !== 'function') return method;
            if (typeof operation === 'string' && writes.has(operation))
              return (args: unknown) =>
                this.write(property, operation, args, () => Reflect.apply(method, delegate, [args]));
            return method.bind(delegate);
          },
        });
      },
    });
  }

  setSource(resource: TransferResource, action: TransferWriteAction, scope: TransferAuthorizationScope): void {
    this.source = { kind: resource.kind, id: resource.id, action, scope };
  }

  private async write(
    model: string,
    operation: string,
    input: unknown,
    perform: () => Promise<unknown>,
  ): Promise<unknown> {
    const args = object(input);
    const source = this.requireSource();
    const where = journalReadWhere(model, args['where'] ?? this.createWhere(model, args['data']));
    const nestedData = args['data'] ?? { ...object(args['create']), ...object(args['update']) };
    this.assertNoNestedMutation(model, nestedData);
    // Deletes with cascades need complete child backups; transfer writers use soft deletion or explicit delegates.
    if ((operation === 'delete' || operation === 'deleteMany') && !deletableLeaves.has(model))
      throw new BadRequestException('Use uma alteração reversível sem exclusão em cascata neste lote.');
    const before = await this.rows(model, where);
    const result = await perform();
    // createMany returns only a count. Its creation filter can match archived
    // predecessors, so retain that filter to discover newly generated IDs too.
    const afterWhere =
      operation === 'delete' || operation === 'deleteMany'
        ? { OR: before.map((row) => keyOf(model, row)) }
        : before.length
          ? {
              OR: [
                ...before.map((row) => keyOf(model, row)),
                ...this.resultKeys(model, result),
                ...(operation === 'createMany' ? [where] : []),
              ],
            }
          : where;
    const after = await this.rows(model, afterWhere);
    this.record(model, before, after, source);
    return result;
  }

  private async rawWrite(operation: '$executeRaw' | '$executeRawUnsafe', args: unknown[]): Promise<unknown> {
    const first = args[0];
    const sql = Array.isArray(first) ? first.join(' ') : typeof first === 'string' ? first : object(first)['sql'];
    if (typeof sql !== 'string')
      throw new BadRequestException('A operação SQL não pode ser incluída em um lote reversível.');
    if (/^\s*SELECT\s+pg_advisory_xact_lock\b/i.test(sql)) return this.invokeRaw(operation, args);
    // The established subscription counter writer is the only raw mutation in this workflow.
    if (!/^\s*UPDATE\s+"events"\s+event\b/i.test(sql) || typeof args[1] !== 'string')
      throw new BadRequestException('A operação SQL não possui uma cópia reversível.');
    const where = { id: args[1] };
    const before = await this.rows('event', where);
    const result = await this.invokeRaw(operation, args);
    const after = await this.rows('event', where);
    this.record('event', before, after, this.requireSource());
    return result;
  }

  private invokeRaw(operation: string, args: unknown[]): Promise<unknown> {
    const method: unknown = Reflect.get(this.original, operation);
    if (typeof method !== 'function') throw new BadRequestException('Operação SQL indisponível.');
    return Reflect.apply(method, this.original, args) as Promise<unknown>;
  }

  private async rawRead(operation: string, args: unknown[]): Promise<unknown> {
    const first = args[0];
    const sql = Array.isArray(first) ? first.join(' ') : typeof first === 'string' ? first : object(first)['sql'];
    if (
      typeof sql !== 'string' ||
      !/^\s*(?:SELECT\b|WITH\s+RECURSIVE\s+person_lineage\s+AS\s*\()/i.test(sql) ||
      /\b(?:INSERT|DELETE|MERGE|CALL|COPY|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql) ||
      /\bUPDATE\b/i.test(sql.replace(/FOR\s+UPDATE/gi, '')) ||
      sql.includes(';')
    )
      throw new BadRequestException('A consulta SQL não foi reconhecida como uma leitura reversível.');
    return this.invokeRaw(operation, args);
  }

  private async rows(model: string, where: unknown): Promise<Record<string, JsonValue>[]> {
    const rows = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
      journalDelegate(this.original, model).findMany({ where, take: maximumRows + 1 }),
    );
    if (rows.length > maximumRows)
      throw new BadRequestException('O lote excede o limite de cópias reversíveis. Use um contexto menor.');
    return rows.map(journalJson);
  }

  private record(
    model: string,
    before: Record<string, JsonValue>[],
    after: Record<string, JsonValue>[],
    source: JournalSource,
  ): void {
    const beforeByKey = new Map(before.map((row) => [canonicalTransferJson(keyOf(model, row)), row]));
    const afterByKey = new Map(after.map((row) => [canonicalTransferJson(keyOf(model, row)), row]));
    for (const key of new Set([...beforeByKey.keys(), ...afterByKey.keys()])) {
      const previous = beforeByKey.get(key) ?? null;
      const next = afterByKey.get(key) ?? null;
      if (canonicalTransferJson(previous) === canonicalTransferJson(next)) continue;
      const mutation = { model, key: keyOf(model, previous ?? next ?? {}), before: previous, after: next, source };
      this.mutations.push(mutation);
      this.capturedBytes += Buffer.byteLength(JSON.stringify(mutation));
      if (++this.capturedRows > maximumRows || this.capturedBytes > maximumBytes)
        throw new BadRequestException('O lote excede o limite de cópias reversíveis.');
    }
  }

  private createWhere(model: string, input: unknown): unknown {
    const fields = new Set(
      models
        .get(model)
        ?.fields.filter((field) => field.kind !== 'object')
        .map((field) => field.name),
    );
    const records = Array.isArray(input) ? input : [input];
    const filters = records.map((row) =>
      Object.fromEntries(
        Object.entries(object(row)).filter(
          ([key, value]) =>
            fields.has(key) &&
            value !== undefined &&
            (value === null || typeof value !== 'object' || value instanceof Date),
        ),
      ),
    );
    if (filters.some((filter) => Object.keys(filter).length === 0))
      throw new BadRequestException('Não foi possível identificar a criação reversível.');
    return { OR: filters };
  }

  private resultKeys(model: string, value: unknown): Record<string, JsonValue>[] {
    return (Array.isArray(value) ? value : [value]).flatMap((row) => {
      const data = journalJson(object(row));
      return primaryFields(model).every((field) => data[field] !== undefined) ? [keyOf(model, data)] : [];
    });
  }

  private requireSource(): JournalSource {
    if (!this.source) throw new BadRequestException('O recurso de origem da alteração não foi identificado.');
    return this.source;
  }

  private assertNoNestedMutation(modelName: string, data: unknown): void {
    for (const field of models.get(modelName)?.fields ?? []) {
      const value = object(data)[field.name];
      if (field.kind === 'object' && value && typeof value === 'object') {
        throw new BadRequestException(
          'As alterações relacionadas precisam ser registradas separadamente para permitir reversão.',
        );
      }
    }
  }
}
