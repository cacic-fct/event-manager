import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Client } from 'pg';
import { AuditLogService } from '../audit-log/audit-log.service';
import { type AuditRecordOptions } from '../audit-log/audit-log.types';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { audienceContext } from '../audiences/audience-context';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import { SportsBackingResourceLifecycleService } from '../sports/sports-backing-resource-lifecycle.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminConfig, MCP_ADMIN_PROPOSE_SCOPE, MCP_ADMIN_READ_SCOPE } from './mcp-admin.config';
import { EventPostCommitEffectsService } from '../events/event-post-commit-effects.service';
import { SportsMutationEventsService } from '../sports/realtime/sports-mutation-events.service';
import { McpAdminMaintenanceService } from './mcp-admin-maintenance.service';
import { McpAdminAdvisoryLockService } from './mcp-admin-advisory-lock.service';
import { McpAdminProposalsService } from './mcp-admin-proposals.service';
import type { McpEventReviewInput, McpProposalOperation } from '@cacic-fct/event-manager-mcp-contracts';

const { jest } = import.meta;
const RESOURCE = 'http://localhost:3000/api/mcp/admin';
const CLIENT_ID = 'synthetic-mcp-client';
const USER_ID = 'synthetic-mcp-user';

// This suite provisions no production schema. Policy/frozen/sports are explicit
// no-network fakes; real PostgreSQL/Prisma transactions, CAS, locks and SQL audit
// evidence establish durability and rollback, rather than live permission policy.
const fixtureSql = `
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE people (
    id TEXT PRIMARY KEY, "userId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3), "lgpdDeletionRequestId" TEXT
  );
  CREATE TABLE major_events (id TEXT PRIMARY KEY, "deletedAt" TIMESTAMP(3));
  CREATE TABLE event_groups (id TEXT PRIMARY KEY, "majorEventId" TEXT, "deletedAt" TIMESTAMP(3));
  CREATE TABLE events (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL, "updatedById" TEXT, "deletedAt" TIMESTAMP(3),
    "majorEventId" TEXT, "eventGroupId" TEXT, "publicationState" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "shortDescription" TEXT, "locationDescription" TEXT,
    latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
    "lecturerInformation" TEXT, "collectorInformation" TEXT, "preparationUpdatedAt" TIMESTAMP(3),
    "youtubeCode" TEXT, "twitchChannel" TEXT,
    "locationName" TEXT, "isVirtual" BOOLEAN NOT NULL DEFAULT false
  );
  CREATE TABLE mcp_test_audit (
    id TEXT PRIMARY KEY, operation TEXT NOT NULL, "entityId" TEXT NOT NULL, metadata JSONB NOT NULL,
    "beforeValues" JSONB, "afterValues" JSONB
  );
  CREATE TABLE mcp_test_event_updates ("eventId" TEXT NOT NULL, description TEXT);
  CREATE FUNCTION mcp_test_capture_event_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO mcp_test_event_updates ("eventId", description) VALUES (NEW.id, NEW.description);
      RETURN NEW;
    END;
  $$;
  CREATE TRIGGER mcp_test_event_update AFTER UPDATE OF description ON events
    FOR EACH ROW EXECUTE FUNCTION mcp_test_capture_event_update();
`;

function isolatedDatabaseUrl(): string {
  const value = process.env.MCP_POSTGRES_TEST_DATABASE_URL;
  if (process.env.MCP_POSTGRES_ISOLATED_CLUSTER !== '1' || !value) {
    throw new Error('Use the disposable-cluster MCP PostgreSQL runner.');
  }
  const url = new URL(value);
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.pathname !== '/fct_mcp_test' ||
    url.username !== 'fct_mcp_admin' ||
    url.password ||
    url.search ||
    process.env.DATABASE_URL !== value
  ) {
    throw new Error('The MCP PostgreSQL suite requires its dedicated temporary loopback database.');
  }
  return value;
}

function user(): AuthenticatedUser {
  const scopes = [MCP_ADMIN_READ_SCOPE, MCP_ADMIN_PROPOSE_SCOPE];
  return {
    sub: USER_ID,
    token: 'synthetic-unused-token',
    realm_access: { roles: [] },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    scopes,
    scopeSet: new Set(scopes),
    oidcScopes: scopes,
    oidcScopeSet: new Set(scopes),
    claims: { azp: CLIENT_ID },
  };
}

function asTransactionWork<T>(operation: () => Promise<T>): Promise<T> {
  // Audience policy itself has separate tests. Bypass avoids reproducing all
  // invitation tables in this deliberately minimal transaction fixture.
  return audienceContext.run({ bypass: true, personIds: [], isUnesp: false, verifiedCourseCode: null }, operation);
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function twoPartyBarrier() {
  let arrivals = 0;
  let release: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const gate = new Promise<void>((resolveGate, rejectGate) => {
    release = resolveGate;
    reject = rejectGate;
  });
  const timeout = setTimeout(() => reject(new Error('Both approval transactions must overlap before the CAS.')), 5000);
  return async () => {
    arrivals += 1;
    if (arrivals === 2) {
      clearTimeout(timeout);
      release();
    }
    if (arrivals <= 2) await gate;
  };
}

describe('MCP real PostgreSQL transactions', () => {
  let sql: Client;
  let prisma: PrismaService;
  let access: McpAdminAccessService;
  let proposals: McpAdminProposalsService;
  let eventId: string;
  let updatedAt: Date;
  let failAudit: boolean;
  let denyPermission: boolean;
  let mutableHook: ((tx: Prisma.TransactionClient) => Promise<void>) | undefined;

  beforeAll(async () => {
    const databaseUrl = isolatedDatabaseUrl();
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(fixtureSql);
    const migration = await readFile(
      resolve(import.meta.dirname, '../../../prisma/migrations/20261119000000_admin_mcp/migration.sql'),
      'utf8',
    );
    await sql.query(migration);
    await sql.query(
      await readFile(
        resolve(import.meta.dirname, '../../../prisma/migrations/20261119220000_expand_admin_mcp/migration.sql'),
        'utf8',
      ),
    );
    prisma = new PrismaService();
    await prisma.$connect();
    const authorization = {
      assertPermissions: jest.fn(async () => {
        if (denyPermission) throw new ForbiddenException('Synthetic current permission denied');
      }),
      accessibleEventTargets: jest.fn(async () => null),
      forTransaction: jest.fn(),
    };
    authorization.forTransaction.mockReturnValue(authorization);
    const audit = {
      record: jest.fn(async (options: AuditRecordOptions, tx?: Prisma.TransactionClient) => {
        if (!tx) throw new Error('Audit evidence must use the provided business transaction.');
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO mcp_test_audit (id, operation, "entityId", metadata, "beforeValues", "afterValues")
          VALUES (${randomUUID()}, ${options.operation}, ${options.entityId}, ${JSON.stringify(options.metadata ?? {})}::jsonb,
            ${JSON.stringify(options.before ?? null)}::jsonb, ${JSON.stringify(options.after ?? null)}::jsonb)
        `);
        if (failAudit) throw new Error('Synthetic audit failure after INSERT');
      }),
    };
    const config = {
      enabled: true,
      proposalsEnabled: true,
      allowedClients: [CLIENT_ID],
      resourceUrl: RESOURCE,
      applicationOrigin: 'http://localhost:4200',
    } as McpAdminConfig;
    access = new McpAdminAccessService(
      prisma,
      authorization as unknown as AuthorizationPolicyService,
      audit as unknown as AuditLogService,
      config,
    );
    const frozen = {
      assertLoadedEventMutable: async () => undefined,
      forTransaction: (tx: Prisma.TransactionClient) => ({
        assertEventUpdateMutable: async () => {
          await mutableHook?.(tx);
        },
      }),
    };
    const sports = { assertEventUpdateAllowed: async () => undefined };
    proposals = new McpAdminProposalsService(
      prisma,
      access,
      frozen as unknown as FrozenResourceService,
      sports as unknown as SportsBackingResourceLifecycleService,
      audit as unknown as AuditLogService,
      config,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
  });

  beforeEach(async () => {
    failAudit = false;
    denyPermission = false;
    mutableHook = undefined;
    await sql.query(`TRUNCATE mcp_test_audit, mcp_test_event_updates, mcp_admin_operation_logs,
      mcp_admin_proposals, mcp_event_content_sync, mcp_admin_delegations, events, people, users CASCADE`);
    eventId = randomUUID();
    updatedAt = new Date();
    await sql.query('INSERT INTO users (id, name) VALUES ($1, $2)', [USER_ID, 'Synthetic Approver']);
    await sql.query('INSERT INTO people (id, "userId") VALUES ($1, $2)', [randomUUID(), USER_ID]);
    await sql.query(
      `INSERT INTO events (id, name, description, "startDate", "endDate", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $4)`,
      // pg serializes Date parameters in the host timezone. Prisma's timestamp
      // contract uses UTC, so raw SQL fixtures must use explicit ISO values.
      [
        eventId,
        'Synthetic Event',
        'Before description',
        updatedAt.toISOString(),
        new Date(Date.now() + 60_000).toISOString(),
      ],
    );
  });

  async function queuedProposal() {
    return asTransactionWork(async () => {
      const delegation = await access.create(user(), {
        clientId: CLIENT_ID,
        eventIds: [eventId],
        capabilities: ['EVENT_READ', 'DESCRIPTION_PROPOSE'],
        maxProposals: 2,
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
      const input = {
        delegationId: delegation.id,
        eventId,
        idempotencyKey: randomUUID(),
        expectedUpdatedAt: updatedAt.toISOString(),
        description: 'After approved description',
      };
      const proposal = await proposals.propose(user(), input);
      await sql.query('DELETE FROM mcp_test_audit');
      return { delegationId: delegation.id, proposalId: proposal.proposalId, input };
    });
  }

  async function state(proposalId: string) {
    return asTransactionWork(async () => ({
      event: await prisma.event.findFirst({ where: { id: eventId }, select: { description: true } }),
      proposal: await prisma.mcpAdminProposal.findUnique({ where: { id: proposalId } }),
      outbox: await prisma.mcpEventContentSync.findUnique({ where: { eventId } }),
      audit: (await sql.query('SELECT * FROM mcp_test_audit')).rows as {
        operation: string;
        metadata: Record<string, unknown>;
      }[],
      updates: (await sql.query('SELECT * FROM mcp_test_event_updates')).rowCount,
    }));
  }

  async function queuedChange(operation: McpProposalOperation, changes: Record<string, unknown>) {
    return asTransactionWork(async () => {
      const delegation = await access.create(user(), {
        clientId: CLIENT_ID,
        eventIds: [eventId],
        capabilities: [
          'EVENT_READ',
          'EVENT_CONTENT_PROPOSE',
          'LOCATION_PROPOSE',
          'PREPARATION_PROPOSE',
          'LIVESTREAM_PROPOSE',
        ],
        maxProposals: 10,
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
      const input = {
        delegationId: delegation.id,
        eventId,
        changes,
        idempotencyKey: randomUUID(),
        expectedUpdatedAt: updatedAt.toISOString(),
      };
      const proposal = await proposals.proposeChange(user(), operation, input);
      await sql.query('DELETE FROM mcp_test_audit');
      return { delegationId: delegation.id, proposalId: proposal.proposalId, input };
    });
  }

  const expandedCases: {
    operation: McpProposalOperation;
    changes: Record<string, unknown>;
    expected: Record<string, unknown>;
  }[] = [
    {
      operation: 'EVENT_CONTENT',
      changes: { name: '  Novo nome  ', shortDescription: ' Resumo ' },
      expected: { name: 'Novo nome', shortDescription: 'Resumo' },
    },
    {
      operation: 'EVENT_LOCATION',
      changes: { isVirtual: true },
      expected: { isVirtual: true, locationName: null, locationDescription: null, latitude: null, longitude: null },
    },
    {
      operation: 'EVENT_PREPARATION',
      changes: { lecturerInformation: ' Orientações ', collectorInformation: ' Coleta ' },
      expected: { lecturerInformation: 'Orientações', collectorInformation: 'Coleta' },
    },
    {
      operation: 'EVENT_LIVESTREAM',
      changes: {
        youtubeCode: 'https://youtu.be/abc_123?tracking=gone',
        twitchChannel: 'https://twitch.tv/Test_Channel',
      },
      expected: { youtubeCode: 'abc_123', twitchChannel: 'test_channel' },
    },
  ];

  it.each([false, true])(
    'applies only the signed amended selection and rolls back on audit failure (%s)',
    async (rollback) => {
      const queued = await queuedChange('EVENT_CONTENT', {
        name: 'Nome que será descartado',
        description: 'Descrição sugerida',
      });
      const review: McpEventReviewInput = {
        expectedUpdatedAt: updatedAt.toISOString(),
        expectedOperation: 'EVENT_CONTENT',
        selections: [{ field: 'description', value: '  Revisão da autora  ' }],
      };
      const preview = await asTransactionWork(() => proposals.prepareReview(user(), queued.proposalId, review));
      expect(preview.changes).toEqual([
        { field: 'description', label: 'Descrição', before: 'Before description', after: 'Revisão da autora' },
      ]);
      failAudit = rollback;
      const request = asTransactionWork(() =>
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedOperation: review.expectedOperation,
          expectedUpdatedAt: review.expectedUpdatedAt,
          review: { token: preview.token, selections: review.selections },
        }),
      );
      if (rollback) await expect(request).rejects.toThrow('Synthetic audit failure after INSERT');
      else await expect(request).resolves.toBe(eventId);

      const result = await state(queued.proposalId);
      expect(result.proposal?.state).toBe(rollback ? 'PENDING' : 'APPLIED');
      expect(result.proposal?.afterValues).toEqual({
        name: 'Nome que será descartado',
        description: 'Descrição sugerida',
      });
      expect(result.event?.description).toBe(rollback ? 'Before description' : 'Revisão da autora');
      expect((await sql.query('SELECT name FROM events WHERE id = $1', [eventId])).rows[0].name).toBe(
        'Synthetic Event',
      );
      expect(result.updates).toBe(rollback ? 0 : 1);
      if (rollback) {
        expect(result.audit).toEqual([]);
        expect(result.outbox).toBeNull();
      } else {
        expect(result.audit).toEqual([
          expect.objectContaining({
            beforeValues: { description: 'Before description' },
            afterValues: { description: 'Revisão da autora' },
            metadata: expect.objectContaining({
              source: 'mcp',
              approvedById: USER_ID,
              proposedById: USER_ID,
              proposalId: queued.proposalId,
              delegationId: queued.delegationId,
              clientId: CLIENT_ID,
              review: { selectedFields: ['description'], discardedFields: ['name'], editedFields: ['description'] },
            }),
          }),
        ]);
        expect(result.outbox).not.toBeNull();
      }
    },
  );

  it.each(expandedCases)(
    'applies exactly the displayed normalized fields for $operation and records attribution',
    async ({ operation, changes, expected }) => {
      await sql.query(
        'UPDATE events SET "locationName" = $1, "locationDescription" = $2, latitude = $3, longitude = $4 WHERE id = $5',
        ['Sala', 'Prédio', -22, -51, eventId],
      );
      await sql.query('UPDATE events SET "preparationUpdatedAt" = $1 WHERE id = $2', [
        updatedAt.toISOString(),
        eventId,
      ]);
      const queued = await queuedChange(operation, changes);
      const pending = await asTransactionWork(() => proposals.list(user(), 0, queued.proposalId));
      expect(pending.items[0].operation).toBe(operation);
      expect((pending.items[0].changes ?? []).map((change) => change.field).sort()).toEqual(
        Object.keys(expected).sort(),
      );
      const beforeEvent = (await sql.query('SELECT * FROM events WHERE id = $1', [eventId])).rows[0];
      expect(beforeEvent.name).toBe('Synthetic Event');
      const stored = await prisma.mcpAdminProposal.findUniqueOrThrow({ where: { id: queued.proposalId } });
      expect(stored.afterValues).toEqual(expected);
      await asTransactionWork(() =>
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedOperation: operation,
          expectedUpdatedAt: updatedAt.toISOString(),
        }),
      );
      const afterEvent = (await sql.query('SELECT * FROM events WHERE id = $1', [eventId])).rows[0];
      for (const [key, value] of Object.entries(expected)) expect(afterEvent[key]).toEqual(value);
      for (const key of ['publicationState', 'majorEventId', 'eventGroupId', 'deletedAt', 'description']) {
        expect(afterEvent[key]).toEqual(beforeEvent[key]);
      }
      if (operation === 'EVENT_PREPARATION') {
        expect(afterEvent.preparationUpdatedAt.getTime()).toBeGreaterThan(beforeEvent.preparationUpdatedAt.getTime());
      }
      const evidence = (await sql.query('SELECT * FROM mcp_test_audit')).rows;
      expect(evidence).toHaveLength(1);
      expect(evidence[0].metadata).toMatchObject({
        operation,
        approvedById: USER_ID,
        proposedById: USER_ID,
        proposalId: queued.proposalId,
      });
      expect(evidence[0].afterValues).toEqual(expected);
      expect(evidence[0].beforeValues).toEqual(stored.beforeValues);
      await expect(
        asTransactionWork(() =>
          proposals.decide(user(), queued.proposalId, {
            decision: 'APPROVE',
            expectedOperation: operation,
            expectedUpdatedAt: updatedAt.toISOString(),
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await sql.query('SELECT * FROM mcp_test_audit')).rows).toHaveLength(1);
    },
  );

  it.each([undefined, 'EVENT_LOCATION'] as const)(
    'requires the displayed operation for expanded approval: %s',
    async (expectedOperation) => {
      const queued = await queuedChange('EVENT_CONTENT', { name: 'Novo nome' });
      await expect(
        asTransactionWork(() =>
          proposals.decide(user(), queued.proposalId, {
            decision: 'APPROVE',
            expectedOperation,
            expectedUpdatedAt: updatedAt.toISOString(),
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await state(queued.proposalId)).proposal?.state).toBe('PENDING');
      expect((await sql.query('SELECT name FROM events WHERE id = $1', [eventId])).rows[0].name).toBe(
        'Synthetic Event',
      );
    },
  );

  it('rejects a stale expanded field even when updatedAt was unchanged', async () => {
    const queued = await queuedChange('EVENT_CONTENT', { name: 'Novo nome' });
    await sql.query('UPDATE events SET name = $1 WHERE id = $2', ['Concurrent name', eventId]);
    await expect(
      asTransactionWork(() =>
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedOperation: 'EVENT_CONTENT',
          expectedUpdatedAt: updatedAt.toISOString(),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const result = await state(queued.proposalId);
    expect(result.proposal?.state).toBe('PENDING');
    expect(result.outbox).toBeNull();
    expect(result.audit).toEqual([]);
  });

  it('requires the exact operation capability again at approval', async () => {
    const queued = await queuedChange('EVENT_LIVESTREAM', { youtubeCode: 'abc' });
    await prisma.mcpAdminDelegation.update({
      where: { id: queued.delegationId },
      data: { capabilities: ['EVENT_READ', 'EVENT_CONTENT_PROPOSE'] },
    });
    await expect(
      asTransactionWork(() =>
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedOperation: 'EVENT_LIVESTREAM',
          expectedUpdatedAt: updatedAt.toISOString(),
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await state(queued.proposalId)).audit).toEqual([]);
  });

  it('refuses persisted filter objects masquerading as reviewed scalar before values', async () => {
    const queued = await queuedChange('EVENT_CONTENT', { name: 'Novo nome' });
    await sql.query('UPDATE mcp_admin_proposals SET "beforeValues" = $1::jsonb WHERE id = $2', [
      JSON.stringify({ name: { not: 'Novo nome' } }),
      queued.proposalId,
    ]);
    await expect(
      asTransactionWork(() =>
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedOperation: 'EVENT_CONTENT',
          expectedUpdatedAt: updatedAt.toISOString(),
        }),
      ),
    ).rejects.toThrow('Valores anteriores inválidos');
    const result = await state(queued.proposalId);
    expect(result.proposal?.state).toBe('PENDING');
    expect(result.audit).toEqual([]);
    expect(result.outbox).toBeNull();
  });

  it('binds idempotency to operation and normalized values, including after application', async () => {
    const queued = await queuedChange('EVENT_LIVESTREAM', { youtubeCode: 'https://youtu.be/abc' });
    const retry = await asTransactionWork(() =>
      proposals.proposeChange(user(), 'EVENT_LIVESTREAM', { ...queued.input, changes: { youtubeCode: 'abc' } }),
    );
    expect(retry.proposalId).toBe(queued.proposalId);
    await expect(
      asTransactionWork(() =>
        proposals.proposeChange(user(), 'EVENT_CONTENT', { ...queued.input, changes: { name: 'Novo nome' } }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      asTransactionWork(() =>
        proposals.proposeChange(user(), 'EVENT_LIVESTREAM', { ...queued.input, changes: { youtubeCode: 'different' } }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await asTransactionWork(() =>
      proposals.decide(user(), queued.proposalId, {
        decision: 'APPROVE',
        expectedOperation: 'EVENT_LIVESTREAM',
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    );
    const replay = await asTransactionWork(() =>
      proposals.proposeChange(user(), 'EVENT_LIVESTREAM', { ...queued.input, changes: { youtubeCode: 'abc' } }),
    );
    expect(replay.state).toBe('APPLIED');
    expect((await state(queued.proposalId)).audit).toHaveLength(1);
  });

  it.each(expandedCases)(
    'rolls back every $operation field when transactional audit insertion fails',
    async ({ operation, changes }) => {
      const queued = await queuedChange(operation, changes);
      const before = (await sql.query('SELECT * FROM events WHERE id = $1', [eventId])).rows[0];
      failAudit = true;
      await expect(
        asTransactionWork(() =>
          proposals.decide(user(), queued.proposalId, {
            decision: 'APPROVE',
            expectedOperation: operation,
            expectedUpdatedAt: updatedAt.toISOString(),
          }),
        ),
      ).rejects.toThrow('Synthetic audit failure after INSERT');
      expect((await sql.query('SELECT * FROM events WHERE id = $1', [eventId])).rows[0]).toEqual(before);
      const result = await state(queued.proposalId);
      expect(result.proposal?.state).toBe('PENDING');
      expect(result.outbox).toBeNull();
      expect(result.audit).toEqual([]);
    },
  );

  it('commits only one overlapping approval across independent PostgreSQL sessions', async () => {
    const queued = await queuedProposal();
    const entered = deferred();
    const release = deferred();
    let first = true;
    mutableHook = async () => {
      if (!first) return;
      first = false;
      entered.resolve();
      await release.promise;
    };
    const approve = () =>
      asTransactionWork(() =>
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedUpdatedAt: updatedAt.toISOString(),
        }),
      );
    const initial = approve();
    await entered.promise;
    const competing = approve();
    try {
      await waitForBlockedSession();
    } finally {
      release.resolve();
    }
    const result = await Promise.allSettled([initial, competing]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = result.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    const committed = await state(queued.proposalId);
    expect(committed.event?.description).toBe(queued.input.description);
    expect(committed.proposal?.state).toBe('APPLIED');
    expect(committed.proposal?.approvedById).toBe(USER_ID);
    expect(committed.outbox?.revision).toBe(1);
    expect(committed.audit).toHaveLength(1);
    expect(committed.audit[0].metadata).toEqual(
      expect.objectContaining({ source: 'mcp', proposalId: queued.proposalId }),
    );
    expect(committed.updates).toBe(1);
  });

  async function waitForBlockedSession(): Promise<void> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const result = await sql.query<{ waiting: boolean }>(`SELECT EXISTS(
        SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
      ) AS waiting`);
      if (result.rows[0].waiting) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Expected an independently blocked PostgreSQL session.');
  }

  it('refuses approval when its proposal expires while waiting for a rolled-back row lock', async () => {
    const queued = await queuedProposal();
    const expiresAt = new Date(Date.now() + 500);
    await prisma.mcpAdminProposal.update({ where: { id: queued.proposalId }, data: { expiresAt } });
    const blocker = new Client({ connectionString: isolatedDatabaseUrl() });
    await blocker.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM mcp_admin_proposals WHERE id = $1 FOR UPDATE', [queued.proposalId]);
    const approval = asTransactionWork(() =>
      proposals.decide(user(), queued.proposalId, {
        decision: 'APPROVE',
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    );
    const result = Promise.allSettled([approval]);
    try {
      await waitForBlockedSession();
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, expiresAt.getTime() - Date.now() + 25)));
    } finally {
      await blocker.query('ROLLBACK');
      await blocker.end();
    }
    expect((await result)[0]).toEqual(
      expect.objectContaining({ status: 'rejected', reason: expect.any(ConflictException) }),
    );
    expect((await state(queued.proposalId)).updates).toBe(0);
  });

  it('keeps external writes ordered after lease expiry and retains the newer revision until synchronized', async () => {
    await prisma.mcpEventContentSync.create({ data: { eventId } });
    const entered = deferred();
    const release = deferred();
    let projection = '';
    let calls = 0;
    const effects = {
      syncEventContent: async () => {
        const event = await asTransactionWork(() =>
          prisma.event.findUnique({ where: { id: eventId }, select: { description: true } }),
        );
        calls += 1;
        if (calls === 1) {
          entered.resolve();
          await release.promise;
        }
        projection = event?.description ?? '';
      },
    };
    const service = new McpAdminMaintenanceService(
      prisma,
      effects as unknown as EventPostCommitEffectsService,
      { publishForBackingEvent: async () => undefined } as unknown as SportsMutationEventsService,
      new McpAdminAdvisoryLockService(),
    );
    const first = service.flush();
    await entered.promise;
    try {
      await sql.query('UPDATE events SET description = $1 WHERE id = $2', ['New revision', eventId]);
      await prisma.mcpEventContentSync.update({
        where: { eventId },
        data: { revision: { increment: 1 }, leaseUntil: new Date(Date.now() - 1) },
      });
      await service.flush();
      expect(calls).toBe(1);
      expect(await prisma.mcpEventContentSync.findUnique({ where: { eventId } })).not.toBeNull();
    } finally {
      release.resolve();
      await first;
    }
    expect(projection).toBe('Before description');
    await service.flush();
    expect(projection).toBe('New revision');
    expect(await prisma.mcpEventContentSync.findUnique({ where: { eventId } })).toBeNull();
  });

  it('processes later untouched recovery work after a full batch of persistent failures', async () => {
    const ids = Array.from({ length: 21 }, (_, index) => `recovery-${String(index).padStart(2, '0')}`);
    await sql.query(
      `INSERT INTO events (id, name, "startDate", "endDate", "updatedAt")
      SELECT id, 'Synthetic Recovery', $2, $2, $2 FROM unnest($1::text[]) AS id`,
      [ids, updatedAt.toISOString()],
    );
    await prisma.mcpEventContentSync.createMany({ data: ids.map((id) => ({ eventId: id })) });
    const attempted: string[] = [];
    const effects = {
      syncEventContent: async (id: string) => {
        attempted.push(id);
        if (id !== ids[20]) throw new Error('Synthetic persistent projection failure');
      },
    };
    const service = new McpAdminMaintenanceService(
      prisma,
      effects as unknown as EventPostCommitEffectsService,
      { publishForBackingEvent: async () => undefined } as unknown as SportsMutationEventsService,
      new McpAdminAdvisoryLockService(),
    );
    await service.flush();
    expect(attempted).toHaveLength(20);
    expect(attempted).not.toContain(ids[20]);
    // Even when the failed leases are eligible again, untouched work comes first.
    await prisma.mcpEventContentSync.updateMany({
      where: { leaseUntil: { not: null } },
      data: { leaseUntil: new Date(Date.now() - 1) },
    });
    await service.flush();
    expect(attempted[20]).toBe(ids[20]);
    expect(await prisma.mcpEventContentSync.count()).toBe(20);
    expect(await prisma.mcpEventContentSync.findUnique({ where: { eventId: ids[20] } })).toBeNull();
  });

  it('enforces the proposal quota across overlapping transactions rather than just sequential checks', async () => {
    const queued = await queuedProposal();
    const waitForPeer = twoPartyBarrier();
    mutableHook = async () => waitForPeer();

    const result = await asTransactionWork(() =>
      Promise.allSettled([
        proposals.propose(user(), {
          ...queued.input,
          idempotencyKey: randomUUID(),
          description: 'Concurrent proposal A',
        }),
        proposals.propose(user(), {
          ...queued.input,
          idempotencyKey: randomUUID(),
          description: 'Concurrent proposal B',
        }),
      ]),
    );

    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = result.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ForbiddenException);
    expect(
      await asTransactionWork(() => prisma.mcpAdminProposal.count({ where: { delegationId: queued.delegationId } })),
    ).toBe(2);
    const committed = await state(queued.proposalId);
    expect(committed.updates).toBe(0);
    expect(committed.outbox).toBeNull();
    expect(committed.audit).toHaveLength(1);
  });

  it('rolls back event, proposal, outbox and already-inserted evidence when auditing fails', async () => {
    const queued = await queuedProposal();
    failAudit = true;

    await expect(
      asTransactionWork(() =>
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedUpdatedAt: updatedAt.toISOString(),
        }),
      ),
    ).rejects.toThrow('Synthetic audit failure after INSERT');

    const rolledBack = await state(queued.proposalId);
    expect(rolledBack.event?.description).toBe('Before description');
    expect(rolledBack.proposal?.state).toBe('PENDING');
    expect(rolledBack.outbox).toBeNull();
    expect(rolledBack.audit).toEqual([]);
    expect(rolledBack.updates).toBe(0);
  });

  it('reuses an identical proposal and refuses replay after approval without another write or audit', async () => {
    const queued = await queuedProposal();
    const retry = await asTransactionWork(() => proposals.propose(user(), queued.input));
    expect(retry.proposalId).toBe(queued.proposalId);
    await expect(
      asTransactionWork(() => proposals.propose(user(), { ...queued.input, description: 'Different request' })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await asTransactionWork(() => prisma.mcpAdminProposal.count())).toBe(1);
    await asTransactionWork(() =>
      proposals.decide(user(), queued.proposalId, {
        decision: 'APPROVE',
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    );
    await expect(
      asTransactionWork(() =>
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedUpdatedAt: updatedAt.toISOString(),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const committed = await state(queued.proposalId);
    expect(committed.updates).toBe(1);
    expect(committed.audit).toHaveLength(1);
    expect(committed.outbox?.revision).toBe(1);
  });

  it.each([
    'revoked',
    'expired delegation',
    'expired proposal',
    'stale description',
    'permission revoked',
    'pending deletion',
  ])('refuses approval after %s without committing event or audit changes', async (condition) => {
    const queued = await queuedProposal();
    if (condition === 'revoked')
      await prisma.mcpAdminDelegation.update({ where: { id: queued.delegationId }, data: { revokedAt: new Date() } });
    if (condition === 'expired delegation')
      await sql.query('UPDATE mcp_admin_delegations SET "createdAt" = $1, "expiresAt" = $2 WHERE id = $3', [
        new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
        new Date(Date.now() - 60 * 60_000).toISOString(),
        queued.delegationId,
      ]);
    if (condition === 'expired proposal')
      await asTransactionWork(() =>
        prisma.mcpAdminProposal.update({
          where: { id: queued.proposalId },
          data: { expiresAt: new Date(Date.now() - 1000) },
        }),
      );
    if (condition === 'stale description') {
      await sql.query('UPDATE events SET description = $1 WHERE id = $2', ['Changed without revision bump', eventId]);
      await sql.query('DELETE FROM mcp_test_event_updates');
    }
    if (condition === 'permission revoked') denyPermission = true;
    if (condition === 'pending deletion')
      await sql.query('UPDATE people SET "lgpdDeletionRequestId" = $1 WHERE "userId" = $2', [
        'synthetic-deletion-request',
        USER_ID,
      ]);

    await expect(
      asTransactionWork(() =>
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedUpdatedAt: updatedAt.toISOString(),
        }),
      ),
    ).rejects.toBeInstanceOf(
      ['revoked', 'expired delegation', 'permission revoked', 'pending deletion'].includes(condition)
        ? ForbiddenException
        : ConflictException,
    );
    const unchanged = await state(queued.proposalId);
    expect(unchanged.proposal?.state).toBe('PENDING');
    expect(unchanged.outbox).toBeNull();
    expect(unchanged.audit).toEqual([]);
    expect(unchanged.updates).toBe(0);
  });

  it('cascades personal proposals on delegation erasure while retaining independent event recovery', async () => {
    const queued = await queuedProposal();
    await asTransactionWork(() =>
      proposals.decide(user(), queued.proposalId, {
        decision: 'APPROVE',
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    );

    await prisma.mcpAdminDelegation.delete({ where: { id: queued.delegationId } });

    expect(
      await asTransactionWork(() => prisma.mcpAdminProposal.findUnique({ where: { id: queued.proposalId } })),
    ).toBeNull();
    expect(await asTransactionWork(() => prisma.mcpEventContentSync.findUnique({ where: { eventId } }))).not.toBeNull();
  });

  it.each([
    ['quota', '"maxProposals" = 0'],
    ['event list', '"eventIds" = ARRAY[]::text[]'],
    ['capability list', '"capabilities" = ARRAY[]::"McpAdminCapability"[]'],
    ['expiry', '"expiresAt" = "createdAt" + interval \'25 hours\''],
  ])('enforces the migration %s CHECK constraint independently of request validation', async (_name, invalidUpdate) => {
    const queued = await queuedProposal();
    await expect(
      sql.query(`UPDATE mcp_admin_delegations SET ${invalidUpdate} WHERE id = $1`, [queued.delegationId]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces description size and delegation/idempotency uniqueness at the database boundary', async () => {
    const queued = await queuedProposal();
    await expect(
      sql.query('UPDATE mcp_admin_proposals SET "descriptionAfter" = $1 WHERE id = $2', ['', queued.proposalId]),
    ).rejects.toMatchObject({ code: '23514' });
    const existing = await asTransactionWork(() =>
      prisma.mcpAdminProposal.findUniqueOrThrow({ where: { id: queued.proposalId } }),
    );
    await expect(
      sql.query(
        `INSERT INTO mcp_admin_proposals
      (id, "delegationId", "eventId", "idempotencyKey", "descriptionAfter", "baseUpdatedAt", "expiresAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          existing.delegationId,
          eventId,
          existing.idempotencyKey,
          'Second description',
          existing.baseUpdatedAt.toISOString(),
          existing.expiresAt.toISOString(),
        ],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
