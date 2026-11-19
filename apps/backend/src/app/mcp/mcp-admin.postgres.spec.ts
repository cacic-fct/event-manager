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
import { McpAdminProposalsService } from './mcp-admin-proposals.service';

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
    "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL, "updatedById" TEXT, "deletedAt" TIMESTAMP(3),
    "majorEventId" TEXT, "eventGroupId" TEXT, "publicationState" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "locationName" TEXT, "isVirtual" BOOLEAN NOT NULL DEFAULT false
  );
  CREATE TABLE mcp_test_audit (
    id TEXT PRIMARY KEY, operation TEXT NOT NULL, "entityId" TEXT NOT NULL, metadata JSONB NOT NULL
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
          INSERT INTO mcp_test_audit (id, operation, "entityId", metadata)
          VALUES (${randomUUID()}, ${options.operation}, ${options.entityId}, ${JSON.stringify(options.metadata ?? {})}::jsonb)
        `);
        if (failAudit) throw new Error('Synthetic audit failure after INSERT');
      }),
    };
    const config = {
      enabled: true,
      proposalsEnabled: true,
      allowedClients: [CLIENT_ID],
      resourceUrl: RESOURCE,
    } as McpAdminConfig;
    access = new McpAdminAccessService(
      prisma,
      authorization as unknown as AuthorizationPolicyService,
      audit as unknown as AuditLogService,
      config,
    );
    const frozen = {
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
      [eventId, 'Synthetic Event', 'Before description', updatedAt, new Date(Date.now() + 60_000)],
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

  it('commits only one overlapping approval across independent PostgreSQL sessions', async () => {
    const queued = await queuedProposal();
    const waitForPeer = twoPartyBarrier();
    const sessions: number[] = [];
    mutableHook = async (tx) => {
      const [session] = await tx.$queryRaw<{ pid: number }[]>(Prisma.sql`SELECT pg_backend_pid() AS pid`);
      sessions.push(session.pid);
      await waitForPeer();
    };

    const result = await asTransactionWork(() =>
      Promise.allSettled([
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedUpdatedAt: updatedAt.toISOString(),
        }),
        proposals.decide(user(), queued.proposalId, {
          decision: 'APPROVE',
          expectedUpdatedAt: updatedAt.toISOString(),
        }),
      ]),
    );

    expect(new Set(sessions.slice(0, 2)).size).toBe(2);
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
        new Date(Date.now() - 2 * 60 * 60_000),
        new Date(Date.now() - 60 * 60_000),
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
          existing.baseUpdatedAt,
          existing.expiresAt,
        ],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
