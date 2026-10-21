import { PGlite } from '@electric-sql/pglite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

type SqlClient = Pick<PGlite, 'query'>;
type Row = Record<string, unknown>;

/** A PostgreSQL-backed test adapter, deliberately isolated from the running application's database. */
export function transferDatabaseDelegates(client: SqlClient) {
  const allRows = async (model: string): Promise<Row[]> => {
    const result = await client.query<{ data: Row }>('SELECT data FROM transfer_fixture WHERE model = $1 ORDER BY id', [
      model,
    ]);
    return result.rows.map(({ data }) => hydrate(data));
  };
  const modelMetadata = new Map(
    Prisma.dmmf.datamodel.models.map((model) => [model.name.charAt(0).toLowerCase() + model.name.slice(1), model]),
  );
  const delegate = (model: string) => {
    const findMany = async (args: { where?: unknown; take?: number; select?: unknown } = {}) => {
      const rows = (await allRows(model)).filter((row) => matches(row, args.where)).slice(0, args.take);
      const select = args.select && typeof args.select === 'object' ? (args.select as Row) : undefined;
      if (!select) return rows;
      const metadata = modelMetadata.get(model);
      return Promise.all(
        rows.map(async (row) => {
          const projected: Row = Object.fromEntries(
            Object.entries(select)
              .filter(([, selected]) => selected === true)
              .map(([field]) => [field, row[field]]),
          );
          for (const [relationName, relationArgs] of Object.entries(select)) {
            const relation = metadata?.fields.find((field) => field.name === relationName && field.kind === 'object');
            if (!relation || !relationArgs || typeof relationArgs !== 'object') continue;
            const nestedSelect = (relationArgs as Row)['select'];
            if (!nestedSelect || typeof nestedSelect !== 'object') continue;
            let related: Row[] = [];
            if (model === 'eventGroup' && relationName === 'events')
              related = (await allRows('event')).filter((candidate) => candidate['eventGroupId'] === row['id']);
            else if (model === 'eventGroup' && relationName === 'audienceInvitations')
              related = (await allRows('eventGroupAudienceInvitation')).filter(
                (candidate) => candidate['eventGroupId'] === row['id'],
              );
            else if (model === 'people' && relationName === 'eventSubscriptions')
              related = (await allRows('eventSubscription')).filter((candidate) => candidate['personId'] === row['id']);
            else if (model === 'event' && relationName === 'ticketConfig')
              related = (await allRows('ticketConfig')).filter((candidate) => candidate['eventId'] === row['id']);
            const keys = Object.keys(nestedSelect as Row);
            const selected = related.map((candidate) => Object.fromEntries(keys.map((key) => [key, candidate[key]])));
            projected[relationName] = relation.isList ? selected : (selected[0] ?? null);
          }
          return projected;
        }),
      );
    };
    const create = async ({ data }: { data: Row }) => {
      const now = new Date();
      const row = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        revertedAt: null,
        ...(model === 'people' ? { mergedIntoId: null, secondaryEmails: [] } : {}),
        ...data,
      };
      await client.query('INSERT INTO transfer_fixture (model, id, data) VALUES ($1, $2, $3::jsonb)', [
        model,
        row.id,
        JSON.stringify(row),
      ]);
      return row;
    };
    const updateMany = async ({ where, data }: { where: unknown; data: Row }) => {
      const rows = await findMany({ where });
      for (const row of rows)
        await client.query('UPDATE transfer_fixture SET data = $3::jsonb WHERE model = $1 AND id = $2', [
          model,
          row['id'],
          JSON.stringify({ ...row, ...data }),
        ]);
      return { count: rows.length };
    };
    const deleteMany = async ({ where }: { where: unknown }) => {
      const rows = await findMany({ where });
      for (const row of rows)
        await client.query('DELETE FROM transfer_fixture WHERE model = $1 AND id = $2', [model, row['id']]);
      return { count: rows.length };
    };
    return {
      findMany,
      create,
      createMany: async ({ data }: { data: Row[] }) => {
        for (const row of data) await create({ data: row });
        return { count: data.length };
      },
      updateMany,
      deleteMany,
      findFirst: async (args: { where?: unknown } = {}) => (await findMany(args))[0] ?? null,
      findUnique: async ({ where }: { where: unknown }) => (await findMany({ where }))[0] ?? null,
      update: async ({ where, data }: { where: unknown; data: Row }) => {
        await updateMany({ where, data });
        return (await findMany({ where }))[0];
      },
    };
  };
  return {
    eventGroup: delegate('eventGroup'),
    event: delegate('event'),
    ticketConfig: delegate('ticketConfig'),
    ticketPurchase: delegate('ticketPurchase'),
    eventTicket: delegate('eventTicket'),
    ticketRealtimeOutbox: delegate('ticketRealtimeOutbox'),
    ticketTransfer: delegate('ticketTransfer'),
    eventGroupAudienceInvitation: delegate('eventGroupAudienceInvitation'),
    eventSubscription: delegate('eventSubscription'),
    people: delegate('people'),
    user: delegate('user'),
    eventTicketHistory: delegate('eventTicketHistory'),
    eventFormLink: delegate('eventFormLink'),
    placePreset: delegate('placePreset'),
    auditLogEntry: delegate('auditLogEntry'),
    $queryRaw: async () => [],
    $executeRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.reduce(
        (statement, part, index) => statement + part + (index < values.length ? `$${index + 1}` : ''),
        '',
      );
      await client.query(
        sql,
        values.map((value) => (typeof value === 'bigint' ? value.toString() : value)),
      );
      return 1;
    },
  };
}

function matches(row: Row, where: unknown): boolean {
  if (!where || typeof where !== 'object') return true;
  return Object.entries(where).every(([field, value]) => {
    if (field === 'OR' && Array.isArray(value)) return value.some((entry) => matches(row, entry));
    if (field === 'AND' && Array.isArray(value)) return value.every((entry) => matches(row, entry));
    if (field === 'metadata' && value && typeof value === 'object' && 'path' in value && Array.isArray(value.path)) {
      let metadataValue: unknown = row['metadata'];
      for (const pathPart of value.path) {
        metadataValue =
          metadataValue && typeof metadataValue === 'object' ? (metadataValue as Row)[String(pathPart)] : undefined;
      }
      return JSON.stringify(metadataValue) === JSON.stringify(value.equals);
    }
    if (value && typeof value === 'object' && 'not' in value) return !matches(row, { [field]: value.not });
    if (value && typeof value === 'object' && 'startsWith' in value)
      return typeof row[field] === 'string' && row[field].startsWith(String(value.startsWith));
    if (value && typeof value === 'object' && 'in' in value && Array.isArray(value.in))
      return value.in.includes(row[field]);
    if (value && typeof value === 'object' && 'has' in value)
      return Array.isArray(row[field]) && row[field].includes(value.has);
    if (value && typeof value === 'object' && 'equals' in value) {
      if ('mode' in value && value.mode === 'insensitive' && typeof value.equals === 'string')
        return typeof row[field] === 'string' && row[field].toLowerCase() === value.equals.toLowerCase();
      return JSON.stringify(row[field]) === JSON.stringify(value.equals);
    }
    return JSON.stringify(row[field]) === JSON.stringify(value);
  });
}

function hydrate(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      /At$/.test(key) && typeof value === 'string' ? new Date(value) : value,
    ]),
  );
}

/** Uses no environment variables, external services, migrations, or application data. */
export async function createTransferDatabaseFixture() {
  const database = new PGlite();
  await database.exec(
    'CREATE TABLE transfer_fixture (model text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (model, id))',
  );
  // Journal replay reads through PrismaService while the import transaction is active.
  // Route those reads through the same connection, as PostgreSQL would on that transaction.
  const transaction = new AsyncLocalStorage<SqlClient>();
  const connection: SqlClient = {
    query: (...args) => (transaction.getStore() ?? database).query(...args),
  };
  const client = transferDatabaseDelegates(connection);
  const prisma = {
    ...client,
    $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      database.transaction((tx) =>
        transaction.run(tx, () => operation(transferDatabaseDelegates(tx) as unknown as Prisma.TransactionClient)),
      ),
  } as unknown as PrismaService;
  return { database, client, prisma };
}
