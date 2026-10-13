import { PGlite } from '@electric-sql/pglite';
import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { Prisma } from '@prisma/client';
import {
  canonicalTransferJson,
  type ResolvedTransferDocument,
  type ResourceOfKind,
  type TransferItem,
} from '@cacic-fct/shared-data-transfer';
import { DataTransferJournalService } from './data-transfer-journal.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ConfigurationTransferAdapter } from './configuration-transfer.adapter';

type SqlClient = Pick<PGlite, 'query'>;
type Row = Record<string, unknown>;

/** A PostgreSQL-backed test adapter, deliberately isolated from the running application's database. */
function delegates(client: SqlClient) {
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
          const projected = { ...row };
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
      const row = { id: randomUUID(), createdAt: now, updatedAt: now, deletedAt: null, revertedAt: null, ...data };
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
    eventGroupAudienceInvitation: delegate('eventGroupAudienceInvitation'),
    eventSubscription: delegate('eventSubscription'),
    eventFormLink: delegate('eventFormLink'),
    placePreset: delegate('placePreset'),
    auditLogEntry: delegate('auditLogEntry'),
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
    if (value && typeof value === 'object' && 'startsWith' in value)
      return typeof row[field] === 'string' && row[field].startsWith(String(value.startsWith));
    if (value && typeof value === 'object' && 'in' in value && Array.isArray(value.in))
      return value.in.includes(row[field]);
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

describe('durable audit-backed import rollback and undo', () => {
  let database: PGlite;
  let client: ReturnType<typeof delegates>;
  let prisma: PrismaService;
  let journal: DataTransferJournalService;
  const actor = {
    sub: 'organizer-1',
    preferredUsername: 'Organizador',
    roleSet: new Set(['access']),
  } as AuthenticatedUser;
  const authorization = {
    hasEventManagerAccess: () => true,
    isSuperAdmin: () => false,
    assertPermissions: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthorizationPolicyService;
  const frozen = {
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
  } as unknown as FrozenResourceService;

  beforeEach(async () => {
    database = new PGlite();
    await database.exec(
      'CREATE TABLE transfer_fixture (model text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (model, id))',
    );
    client = delegates(database);
    prisma = {
      ...client,
      $transaction: (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        database.transaction((tx) => operation(delegates(tx) as unknown as Prisma.TransactionClient)),
    } as unknown as PrismaService;
    journal = new DataTransferJournalService(prisma, authorization, frozen);
    jest.clearAllMocks();
    jest.mocked(authorization.assertPermissions).mockResolvedValue(undefined);
  });
  afterEach(async () => {
    await database.close();
  });

  it('executes the exact-request lock as a signed PostgreSQL advisory key', async () => {
    const execute = jest.fn(async (parts: TemplateStringsArray, key: bigint) => {
      const sql = `${parts[0]}$1${parts[1]}`;
      await database.query(sql, [key.toString()]);
      return 1;
    });
    await journal.lockRequest({ $executeRaw: execute } as unknown as Prisma.TransactionClient, 'f'.repeat(64));
    expect(execute.mock.calls[0][1]).toBe(-1n);
  });

  it('journals and undoes createMany rows when an archived row matches the creation fields', async () => {
    const data = {
      eventId: 'event-1',
      personId: 'person-1',
      createdById: actor.sub,
      createdByMethod: 'ADMIN_DASHBOARD',
    } satisfies Prisma.EventSubscriptionCreateManyInput;
    const archived = await client.eventSubscription.create({
      data: {
        ...data,
        id: 'archived-subscription',
        deletedAt: new Date(Date.now() - 60000),
      },
    });
    const resource = {
      kind: 'event-subscription',
      id: 'imported-subscription',
      data: {
        eventId: data.eventId,
        person: { id: data.personId },
      },
    } satisfies ResourceOfKind<'event-subscription'>;
    const doc: ResolvedTransferDocument = { format: 'cacic-event-data', version: 1, resources: [resource] };
    const batch = await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      recorder.setSource(resource, 'create', { eventId: data.eventId });
      await recorder.tx.eventSubscription.createMany({ data: [data] });
      expect(recorder.mutations).toEqual([
        expect.objectContaining({
          model: 'eventSubscription',
          before: null,
          after: expect.objectContaining({ deletedAt: null }),
        }),
      ]);
      return journal.record(recorder, tx, actor, undefined, doc, items(doc, 'create'));
    });
    expect(await client.eventSubscription.findMany()).toHaveLength(2);
    await journal.undo(batch.batchId, actor);
    expect(await client.eventSubscription.findMany()).toEqual([archived]);
  });

  const document = (rows: Array<{ id: string; name: string }>): ResolvedTransferDocument => ({
    format: 'cacic-event-data',
    version: 1,
    resources: rows.map((row) => ({ kind: 'group', id: row.id, data: { name: row.name } })),
  });
  const eventDocument = (id: string): ResolvedTransferDocument =>
    ({
      format: 'cacic-event-data',
      version: 1,
      resources: [{ kind: 'event', id, data: { name: 'Evento importado' } }],
    }) as unknown as ResolvedTransferDocument;
  const items = (doc: ResolvedTransferDocument, action: 'create' | 'update'): TransferItem[] =>
    doc.resources.map((row) => ({
      kind: row.kind,
      id: row.id,
      action,
      status: 'applied',
      message: 'Aplicado.',
      changes: [],
    }));

  it.each(['create', 'update'] as const)('atomically journals and undoes a place-preset %s', async (action) => {
    const resource = {
      kind: 'place-preset',
      id: 'place-1',
      data: { name: 'Ginásio importado', latitude: -22, longitude: -51 },
    } satisfies ResourceOfKind<'place-preset'>;
    const doc: ResolvedTransferDocument = { format: 'cacic-event-data', version: 1, resources: [resource] };
    if (action === 'update')
      await client.placePreset.create({
        data: {
          id: resource.id,
          name: 'Nome anterior',
          latitude: null,
          longitude: null,
          locationDescription: 'Preservada',
        },
      });
    const adapter = new ConfigurationTransferAdapter(
      prisma,
      authorization,
      frozen,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const batch = await prisma.$transaction(async (tx) => {
      const context = { tx, actor, document: doc, frozenResources: frozen };
      const snapshot = await adapter.resolve(resource, context);
      await adapter.assertRead(snapshot, context);
      await adapter.assertWrite(snapshot, action, context);
      await adapter.validate(snapshot, context);
      const recorder = journal.begin(tx);
      recorder.setSource(resource, action, snapshot.scope);
      await adapter.apply(snapshot, action, { ...context, tx: recorder.tx });
      return journal.record(recorder, tx, actor, undefined, doc, items(doc, action));
    });
    expect(await client.placePreset.findUnique({ where: { id: resource.id } })).toMatchObject({
      name: 'Ginásio importado',
      latitude: -22,
      longitude: -51,
    });
    await new DataTransferJournalService(prisma, authorization, frozen).undo(batch.batchId, actor);
    if (action === 'create') expect(await client.placePreset.findMany()).toEqual([]);
    else
      expect(await client.placePreset.findUnique({ where: { id: resource.id } })).toMatchObject({
        name: 'Nome anterior',
        latitude: null,
        longitude: null,
        locationDescription: 'Preservada',
      });
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      actor,
      [
        Permission.DataTransfer.Undo,
        Permission.PlacePreset.Read,
        action === 'create' ? Permission.PlacePreset.Delete : Permission.PlacePreset.Update,
      ],
      {},
    );
  });

  it('rolls back earlier writes and the audit batch after an unrecoverable exception or client shutdown', async () => {
    const id = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        const recorder = journal.begin(tx);
        recorder.setSource({ kind: 'group', id, data: { name: 'Novo grupo' } }, 'create', { eventGroupId: id });
        await recorder.tx.eventGroup.create({ data: { id, name: 'Novo grupo' } });
        throw new Error('Simulated terminated request before commit');
      }),
    ).rejects.toThrow('terminated request');
    expect(await client.eventGroup.findMany()).toEqual([]);
    expect(await client.auditLogEntry.findMany()).toEqual([]);
  });

  it('persists complete before/after copies and undoes a committed batch after a service restart', async () => {
    const id = randomUUID();
    await client.eventGroup.create({ data: { id, name: 'Nome anterior' } });
    const doc = document([{ id, name: 'Nome importado' }]);
    const batch = await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      recorder.setSource(doc.resources[0], 'update', { eventGroupId: id });
      await recorder.tx.eventGroup.update({ where: { id }, data: { name: 'Nome importado' } });
      return journal.record(recorder, tx, actor, undefined, doc, items(doc, 'update'));
    });
    const freshJournal = new DataTransferJournalService(prisma, authorization, frozen);
    await freshJournal.undo(batch.batchId, actor);
    expect((await client.eventGroup.findUnique({ where: { id } }))?.['name']).toBe('Nome anterior');
    const audit = await client.auditLogEntry.findUnique({ where: { id: batch.auditEntryId } });
    expect(audit?.['revertedAt']).toBeInstanceOf(Date);
    await expect(freshJournal.undo(batch.batchId, actor)).rejects.toThrow('já foi desfeito');
  });

  it('rejects undo before deleting a created group when another event later references it', async () => {
    const id = randomUUID();
    const doc = document([{ id, name: 'Grupo criado' }]);
    const resource = doc.resources[0];
    if (!resource) throw new Error('Missing test resource.');
    const batch = await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      recorder.setSource(resource, 'create', { eventGroupId: id });
      await recorder.tx.eventGroup.create({ data: { id, name: 'Grupo criado' } });
      return journal.record(recorder, tx, actor, undefined, doc, items(doc, 'create'));
    });
    await client.event.create({ data: { id: 'later-event', name: 'Evento adicionado depois', eventGroupId: id } });

    await expect(journal.undo(batch.batchId, actor)).rejects.toThrow(ConflictException);
    expect(await client.eventGroup.findUnique({ where: { id } })).not.toBeNull();
    expect(await client.event.findUnique({ where: { id: 'later-event' } })).not.toBeNull();
    expect((await client.auditLogEntry.findUnique({ where: { id: batch.batchId } }))?.['revertedAt']).toBeNull();
  });

  it('includes an incoming audience-invitation row in the private reference snapshot', async () => {
    const id = randomUUID();
    const doc = document([{ id, name: 'Grupo criado' }]);
    const resource = doc.resources[0];
    if (!resource) throw new Error('Missing test resource.');
    const batch = await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      recorder.setSource(resource, 'create', { eventGroupId: id });
      await recorder.tx.eventGroup.create({ data: { id, name: 'Grupo criado' } });
      return journal.record(recorder, tx, actor, undefined, doc, items(doc, 'create'));
    });
    await client.eventGroupAudienceInvitation.create({
      data: { id: 'later-invitation', eventGroupId: id, personId: 'private-person-id' },
    });

    await expect(journal.undo(batch.batchId, actor)).rejects.toThrow(ConflictException);
    expect(await client.eventGroup.findUnique({ where: { id } })).not.toBeNull();
    expect(await client.eventGroupAudienceInvitation.findUnique({ where: { id: 'later-invitation' } })).not.toBeNull();
  });

  it('rejects undo when a created event later receives its one-to-one ticket configuration', async () => {
    const id = randomUUID();
    const doc = eventDocument(id);
    const resource = doc.resources[0];
    if (!resource) throw new Error('Missing test resource.');
    const batch = await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      recorder.setSource(resource, 'create', { eventId: id });
      await recorder.tx.event.create({
        data: { id, name: 'Evento importado', startDate: new Date().toISOString(), endDate: new Date().toISOString() },
      });
      return journal.record(recorder, tx, actor, undefined, doc, items(doc, 'create'));
    });
    await client.ticketConfig.create({ data: { id: 'later-ticket-config', eventId: id } });

    await expect(journal.undo(batch.batchId, actor)).rejects.toThrow(ConflictException);
    expect(await client.event.findUnique({ where: { id } })).not.toBeNull();
    expect(await client.ticketConfig.findUnique({ where: { id: 'later-ticket-config' } })).not.toBeNull();
  });

  it('preserves later edits and rolls back a partially executed undo', async () => {
    const first = randomUUID();
    const second = randomUUID();
    await client.eventGroup.create({ data: { id: first, name: 'Primeiro anterior' } });
    await client.eventGroup.create({ data: { id: second, name: 'Segundo anterior' } });
    const doc = document([
      { id: first, name: 'Primeiro importado' },
      { id: second, name: 'Segundo importado' },
    ]);
    const batch = await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      for (const resource of doc.resources) {
        if (resource.kind !== 'group') throw new Error('This integration fixture requires event groups.');
        recorder.setSource(resource, 'update', { eventGroupId: resource.id });
        await recorder.tx.eventGroup.update({ where: { id: resource.id }, data: { name: resource.data.name } });
      }
      return journal.record(recorder, tx, actor, undefined, doc, items(doc, 'update'));
    });
    await client.eventGroup.updateMany({ where: { id: first }, data: { name: 'Edição posterior' } });
    await expect(journal.undo(batch.batchId, actor)).rejects.toThrow(ConflictException);
    expect((await client.eventGroup.findUnique({ where: { id: first } }))?.['name']).toBe('Edição posterior');
    expect((await client.eventGroup.findUnique({ where: { id: second } }))?.['name']).toBe('Segundo importado');
  });

  it('checks ownership and permissions again before reading private backups or undoing', async () => {
    const id = randomUUID();
    const doc = document([{ id, name: 'Novo grupo' }]);
    const batch = await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      recorder.setSource(doc.resources[0], 'create', { eventGroupId: id });
      await recorder.tx.eventGroup.create({ data: { id, name: 'Novo grupo' } });
      return journal.record(recorder, tx, actor, undefined, doc, items(doc, 'create'));
    });
    await expect(journal.undo(batch.batchId, { ...actor, sub: 'other-organizer' })).rejects.toThrow(
      'Lote não encontrado',
    );
    expect((await client.eventGroup.findMany()).length).toBe(1);
    const summary = (await journal.history(actor))[0];
    expect(summary).not.toHaveProperty('mutations');
    expect(summary).not.toHaveProperty('creationReferences');
    expect(summary).not.toHaveProperty('document');
  });

  it('allows an undo-only organizer to read their own authorized batch summaries', async () => {
    const id = randomUUID();
    const doc = document([{ id, name: 'Grupo criado' }]);
    await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      recorder.setSource(doc.resources[0], 'create', { eventGroupId: id });
      await recorder.tx.eventGroup.create({ data: { id, name: 'Grupo criado' } });
      await journal.record(recorder, tx, actor, undefined, doc, items(doc, 'create'));
    });
    jest.mocked(authorization.assertPermissions).mockImplementation(async (_actor, permissions) => {
      if (permissions.includes(Permission.DataTransfer.Import)) throw new ForbiddenException();
    });
    expect(await journal.history(actor)).toHaveLength(1);
    expect(authorization.assertPermissions).toHaveBeenLastCalledWith(
      actor,
      [Permission.DataTransfer.Undo, Permission.EventGroup.Read],
      { eventGroupId: id },
    );
  });

  it.each([false, true])(
    'requires event update only when subscription imports change event content: %s',
    async (contentChanged) => {
      const eventId = 'limited-event';
      await client.event.create({ data: { id: eventId, name: 'Evento', slotsAvailable: 2, queueCount: 0 } });
      await client.eventSubscription.create({ data: { id: 'subscription-1', eventId, personId: 'person-1' } });
      const resource = {
        kind: 'event-subscription',
        id: 'subscription-1',
        data: { eventId, person: { id: 'person-1' } },
      } satisfies ResourceOfKind<'event-subscription'>;
      const doc: ResolvedTransferDocument = { format: 'cacic-event-data', version: 1, resources: [resource] };
      const batch = await prisma.$transaction(async (tx) => {
        const recorder = journal.begin(tx);
        recorder.setSource(resource, 'update', { eventId });
        await recorder.tx.eventSubscription.update({
          where: { id: resource.id },
          data: { subscriptionStatus: 'CONFIRMED' },
        });
        await recorder.tx.event.update({
          where: { id: eventId },
          data: {
            slotsAvailable: 1,
            queueCount: 1,
            ...(contentChanged ? { name: 'Nome alterado' } : {}),
          },
        });
        return journal.record(recorder, tx, actor, undefined, doc, items(doc, 'update'));
      });
      jest.mocked(authorization.assertPermissions).mockImplementation(async (_actor, permissions) => {
        if (permissions.includes(Permission.Event.Update)) throw new ForbiddenException();
      });
      if (contentChanged) {
        await expect(journal.undo(batch.batchId, actor)).rejects.toThrow(ForbiddenException);
        expect((await client.event.findUnique({ where: { id: eventId } }))?.['slotsAvailable']).toBe(1);
      } else {
        await journal.undo(batch.batchId, actor);
        expect(await client.event.findUnique({ where: { id: eventId } })).toMatchObject({
          slotsAvailable: 2,
          queueCount: 0,
        });
        expect(authorization.assertPermissions).toHaveBeenCalledWith(
          actor,
          [Permission.DataTransfer.Undo, Permission.Subscription.Read, Permission.Subscription.Update],
          { eventId },
        );
      }
    },
  );

  it('undoes a link-only import with form update permission without requiring form deletion', async () => {
    const resource = {
      kind: 'form-link',
      id: 'new-link',
      data: { formId: 'existing-form', targetType: 'EVENT', eventId: 'event-1' },
    } satisfies ResourceOfKind<'form-link'>;
    const doc: ResolvedTransferDocument = { format: 'cacic-event-data', version: 1, resources: [resource] };
    const batch = await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      recorder.setSource(resource, 'create', { eventId: 'event-1', eventFormId: 'existing-form' });
      await recorder.tx.eventFormLink.create({ data: { id: resource.id, ...resource.data } });
      return journal.record(recorder, tx, actor, undefined, doc, items(doc, 'create'));
    });
    jest.mocked(authorization.assertPermissions).mockImplementation(async (_actor, permissions) => {
      if (permissions.includes(Permission.EventForm.Delete)) throw new ForbiddenException();
    });
    await journal.undo(batch.batchId, actor);
    expect(await client.eventFormLink.findMany()).toEqual([]);
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Undo, Permission.EventForm.Read, Permission.EventForm.Update],
      { eventFormLinkId: resource.id },
    );
  });

  it('links individual audit entries to the durable batch and marks them reverted in the same undo', async () => {
    const id = randomUUID();
    const doc = document([{ id, name: 'Grupo criado' }]);
    const result = await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      recorder.setSource(doc.resources[0], 'create', { eventGroupId: id });
      await recorder.tx.eventGroup.create({ data: { id, name: 'Grupo criado' } });
      const domainAudit = await recorder.tx.auditLogEntry.create({
        data: {
          entityType: 'EVENT_GROUP',
          entityId: id,
          operation: 'CREATE',
          actorName: 'Organizador',
          changes: [],
          changedFields: [],
          metadata: { dataTransferBatchId: recorder.batchId },
        },
      });
      const batch = await journal.record(recorder, tx, actor, undefined, doc, items(doc, 'create'));
      return { batch, domainAudit };
    });
    await new DataTransferJournalService(prisma, authorization, frozen).undo(result.batch.batchId, actor);
    const domainAudit = await client.auditLogEntry.findUnique({ where: { id: result.domainAudit.id } });
    expect(domainAudit?.['revertedAt']).toBeInstanceOf(Date);
    expect(domainAudit?.['revertedById']).toBe(actor.sub);
    expect(await client.eventGroup.findUnique({ where: { id } })).toBeNull();
  });

  it('recovers an exact committed request after journal restart without storing raw identity or allocation secrets', async () => {
    const id = 'stored-subscription-1';
    const allocationToken = 'a'.repeat(64);
    const planHash = 'b'.repeat(64);
    const rawDocument = {
      format: 'cacic-event-data',
      version: 1,
      resources: [
        {
          kind: 'event-subscription',
          key: 'PRIVATE-LOCAL-SUBSCRIPTION',
          data: {
            eventId: 'event-1',
            person: { name: 'Private Person Name', email: 'private@example.test' },
            imageLicenseAgreementAccepted: true,
          },
        },
      ],
    };
    const requestFingerprint = createHash('sha256')
      .update(
        canonicalTransferJson({
          actorId: actor.sub,
          rawDocument,
          scope: null,
          planHash,
          allowPartial: false,
          allocationToken,
        }),
      )
      .digest('hex');
    const safeDocument: ResolvedTransferDocument = {
      format: 'cacic-event-data',
      version: 1,
      resources: [
        {
          kind: 'event-subscription',
          id,
          data: {
            eventId: 'event-1',
            person: { id: 'person-1' },
            imageLicenseAgreementAccepted: true,
          },
        },
      ],
    };
    const inputItems = [
      {
        kind: 'event-subscription',
        id,
        key: 'PRIVATE-LOCAL-SUBSCRIPTION',
        action: 'create' as const,
        status: 'applied' as const,
        message: 'Criado.',
        changes: [{ field: 'person.email', before: null, after: 'private@example.test' }],
      },
    ];

    const committed = await prisma.$transaction(async (tx) => {
      const recorder = journal.begin(tx);
      const subscriptionResource = {
        kind: 'event-subscription',
        id,
        data: { eventId: 'event-1', person: { id: 'person-1' }, imageLicenseAgreementAccepted: true },
      } satisfies ResourceOfKind<'event-subscription'>;
      recorder.setSource(subscriptionResource, 'create', { eventId: 'event-1' });
      await recorder.tx.eventSubscription.create({ data: { id, eventId: 'event-1', personId: 'person-1' } });
      return journal.record(recorder, tx, actor, undefined, safeDocument, inputItems as TransferItem[], {
        fingerprint: requestFingerprint,
        planHash,
      });
    });

    const persistedBatch = await client.auditLogEntry.findUnique({ where: { id: committed.batchId } });
    const persistedMetadata = persistedBatch?.['metadata'] as Record<string, unknown>;
    const persistedText = JSON.stringify(persistedMetadata);
    expect(persistedMetadata['requestFingerprint']).toBe(requestFingerprint);
    expect(persistedMetadata['requestPlanHash']).toBe(planHash);
    expect(persistedText).not.toContain('PRIVATE-LOCAL-SUBSCRIPTION');
    expect(persistedText).not.toContain('Private Person Name');
    expect(persistedText).not.toContain('private@example.test');
    expect(persistedText).not.toContain(allocationToken);
    expect(persistedMetadata['document']).toEqual(safeDocument);
    expect(persistedMetadata['requestItems']).toEqual([
      {
        kind: 'event-subscription',
        id: 'stored-subscription-1',
        action: 'create',
        status: 'applied',
        message: 'Criado.',
      },
    ]);

    const freshJournal = new DataTransferJournalService(prisma, authorization, frozen);
    const replay = await freshJournal.findCommittedRequest(actor, requestFingerprint);

    expect(replay?.entry.id).toBe(committed.batchId);
    expect(replay?.metadata.document.resources[0]?.id).toBe(id);
    expect(await client.eventSubscription.findMany()).toHaveLength(1);
    await expect(
      freshJournal.findCommittedRequest({ ...actor, sub: 'another-organizer' }, requestFingerprint),
    ).resolves.toBeNull();

    jest.mocked(authorization.assertPermissions).mockRejectedValueOnce(new ForbiddenException());
    await expect(freshJournal.findCommittedRequest(actor, requestFingerprint)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
