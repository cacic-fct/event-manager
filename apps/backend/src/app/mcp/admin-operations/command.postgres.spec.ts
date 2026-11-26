import { lockMcpJobAttribution } from '../../audit-log/mcp-job-attribution';
import { McpAdminAdvisoryLockService } from '../mcp-admin-advisory-lock.service';
import { AdminMcpScopePolicy } from './scope-policy';
import { McpAdminFileArtifactService } from './artifact-files';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AdminMcpCommandDecision, AdminMcpCommandPreview } from '@cacic-fct/event-manager-mcp-contracts';
import { Client } from 'pg';
import { z } from 'zod';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditRecordOptions } from '../../audit-log/audit-log.types';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { audienceContext } from '../../audiences/audience-context';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { McpAdminConfig, MCP_ADMIN_PROPOSE_SCOPE, MCP_ADMIN_READ_SCOPE } from '../mcp-admin.config';
import { commandDecisionSchema } from './schemas';
import { ADMIN_MCP_OPERATIONS } from './catalog';
import { AdminMcpCommandService } from './command-service';
import { adminMcpExecution, type AdminMcpExecution } from './execution-context';
import type { AdminMcpGraphqlBridge } from './graphql-bridge';

const RESOURCE = 'http://localhost:3000/api/mcp/admin';
const CLIENT_ID = 'synthetic-command-client';
const USER_ID = 'synthetic-command-user';
const COMMAND_DATABASE = 'fct_mcp_command_test';
const fixtureSql = `
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT);
  CREATE TABLE people (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "deletedAt" TIMESTAMP(3), "lgpdDeletionRequestId" TEXT);
  CREATE TABLE major_events (id TEXT PRIMARY KEY, "deletedAt" TIMESTAMP(3));
  CREATE TABLE event_groups (id TEXT PRIMARY KEY, "majorEventId" TEXT, "deletedAt" TIMESTAMP(3));
  CREATE TABLE events (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, "deletedAt" TIMESTAMP(3),
    "publicationState" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majorEventId" TEXT, "eventGroupId" TEXT
  );
`;

function isolatedClusterUrl(): string {
  const value = process.env.MCP_POSTGRES_TEST_DATABASE_URL;
  if (process.env.MCP_POSTGRES_ISOLATED_CLUSTER !== '1' || !value)
    throw new Error('Use the disposable MCP PostgreSQL runner.');
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
    throw new Error('The command suite requires the runner-owned temporary loopback cluster.');
  }
  return value;
}
function actor(): AuthenticatedUser {
  const scopes = [MCP_ADMIN_PROPOSE_SCOPE, MCP_ADMIN_READ_SCOPE];
  return {
    sub: USER_ID,
    token: '',
    realm_access: { roles: [] },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    scopes,
    scopeSet: new Set(scopes),
    oidcScopes: scopes,
    oidcScopeSet: new Set(scopes),
    claims: { azp: CLIENT_ID, is_onboarded: true },
  };
}
function withoutAudience<T>(work: () => Promise<T>): Promise<T> {
  return audienceContext.run({ bypass: true, personIds: [], isUnesp: false, verifiedCourseCode: null }, work);
}
function twoPartyBarrier() {
  let arrivals = 0;
  let release: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const gate = new Promise<void>((resolveGate, rejectGate) => {
    release = resolveGate;
    reject = rejectGate;
  });
  const timeout = setTimeout(() => reject(new Error('Concurrent approvals did not overlap before claiming.')), 5000);
  return async () => {
    arrivals += 1;
    if (arrivals === 2) {
      clearTimeout(timeout);
      release();
    }
    if (arrivals <= 2) await gate;
  };
}

describe('administrative commands on disposable PostgreSQL', () => {
  let admin: Client;
  let sql: Client;
  let prisma: PrismaService;
  let service: AdminMcpCommandService;
  let audit: AuditLogService;
  let originalDatabaseUrl: string | undefined;
  let databaseCreated = false;
  let eventId: string;
  let delegationId: string;
  let mode:
    | 'NORMAL'
    | 'AUDIT_FAIL'
    | 'UNAUDITED'
    | 'RAW_UNAUDITED'
    | 'RAW_QUERY_UNAUDITED'
    | 'COMMENT_UNAUDITED'
    | 'POST_COMMIT_FAIL'
    | 'STALE_BEFORE_TX';
  let invocations: number;
  let businessWrites: number;
  let observedAudit: { businessWrites: boolean; recorded: boolean }[];
  let insertedAuditBeforeFailure: boolean;
  let permissionBarrier: (() => Promise<void>) | undefined;
  let domainGate: (() => Promise<void>) | undefined;
  const inputSchema = z.strictObject({
    id: z.string().uuid(),
    input: z.strictObject({ description: z.string(), name: z.string().optional() }),
  });
  const user = actor();

  function domainAudit(id: string, before: string, after: string): AuditRecordOptions {
    return {
      entityType: AuditLogEntityType.EVENT,
      entityId: id,
      operation: AuditLogOperation.UPDATE,
      actor: user,
      scope: { permission: Permission.Event.Update, eventId: id },
      before: { description: before },
      after: { description: after },
      squashWindowMs: 0,
    };
  }
  async function currentDescription(): Promise<string> {
    const row = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { description: true } });
    return row.description ?? '';
  }
  async function businessAuditCount(proposalId?: string): Promise<number> {
    return prisma.auditLogEntry.count({
      where: {
        entityType: AuditLogEntityType.EVENT,
        entityId: eventId,
        ...(proposalId ? { metadata: { path: ['proposalId'], equals: proposalId } } : {}),
      },
    });
  }
  async function stage() {
    return service.propose(
      user,
      delegationId,
      'updateEvent',
      { id: eventId, input: { description: 'Proposed description' } },
      randomUUID(),
    );
  }
  async function review(
    proposalId: string,
    description = 'Human reviewed description',
  ): Promise<AdminMcpCommandPreview> {
    const row = await prisma.mcpAdminCommand.findUniqueOrThrow({
      where: { id: proposalId },
      select: { fingerprint: true },
    });
    return service.review(user, proposalId, {
      expectedFingerprint: row.fingerprint,
      arguments: { id: eventId, input: { description } },
    });
  }
  function decision(preview: AdminMcpCommandPreview): AdminMcpCommandDecision {
    return commandDecisionSchema.parse({
      decision: 'APPROVE',
      expectedFingerprint: preview.expectedFingerprint,
      review: preview,
    });
  }
  async function commandState(id: string) {
    return (await prisma.mcpAdminCommand.findUniqueOrThrow({ where: { id }, select: { state: true } })).state;
  }
  async function competingHumanChange() {
    await prisma.$transaction(async (tx) => {
      const previous = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { description: true } });
      await tx.event.update({
        where: { id: eventId },
        data: { description: 'Concurrent human description' },
        select: { id: true },
      });
      await audit.record(domainAudit(eventId, previous.description ?? '', 'Concurrent human description'), tx);
    });
  }

  beforeAll(async () => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    const clusterUrl = isolatedClusterUrl();
    admin = new Client({ connectionString: clusterUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${COMMAND_DATABASE}`);
    databaseCreated = true;
    const url = new URL(clusterUrl);
    url.pathname = '/' + COMMAND_DATABASE;
    process.env.DATABASE_URL = url.href;
    sql = new Client({ connectionString: url.href });
    await sql.connect();
    await sql.query(fixtureSql);
    for (const migration of [
      '20260621170000_audit_log_entries',
      '20261119000000_admin_mcp',
      '20261119220000_expand_admin_mcp',
      '20261120090000_admin_mcp_operations',
      '20261122120000_admin_mcp_artifacts',
    ]) {
      await sql.query(
        await readFile(
          resolve(import.meta.dirname, '../../../../prisma/migrations', migration, 'migration.sql'),
          'utf8',
        ),
      );
    }
    await sql.query('INSERT INTO users (id, name, email) VALUES ($1, $2, $3)', [
      USER_ID,
      'Synthetic Command Approver',
      'synthetic-command@example.test',
    ]);
    await sql.query('INSERT INTO people (id, "userId") VALUES ($1, $2)', [randomUUID(), USER_ID]);
    prisma = new PrismaService();
    await prisma.$connect();
    const policy = {
      assertPermissions: async () => {
        await permissionBarrier?.();
      },
      isSuperAdmin: () => false,
      buildResourceContext: () => ({ eventId, primaryResource: 'event' }),
    };
    const search = { upsertAuditLogEntry: async () => undefined };
    audit = new AuditLogService(prisma, policy as never, {} as never, search as never, {} as never);
    const checkedAudit = {
      record: async (options: AuditRecordOptions, tx?: Prisma.TransactionClient) => {
        if (!tx) throw new Error('Audit must share the supplied owning transaction.');
        await audit.record(options, tx);
        if (mode === 'AUDIT_FAIL' && options.entityType === AuditLogEntityType.EVENT) {
          const inserted = await tx.auditLogEntry.findFirst({ where: { entityId: options.entityId } });
          expect(inserted?.metadata).toMatchObject({ source: 'mcp', operation: 'updateEvent' });
          insertedAuditBeforeFailure = Boolean(inserted);
          throw new Error('Synthetic failure after actual audit insertion');
        }
      },
    };
    const bridge: Pick<AdminMcpGraphqlBridge, 'operation' | 'arguments' | 'execute' | 'preflight'> = {
      preflight: async () => undefined,
      operation: (field) => {
        const definition = ADMIN_MCP_OPERATIONS.find((entry) => entry.field === field);
        if (!definition) throw new BadRequestException('Unknown named administrative operation.');
        return {
          definition,
          schema: inputSchema,
          document: {} as never,
          info: {
            field,
            kind: definition.kind,
            domain: definition.domain,
            personalData: definition.personalData,
            tool: 'propose_admin_updateEvent',
            label: 'Editar evento',
            description: definition.description,
            inputSchema: {},
          },
        };
      },
      arguments: (_field, input) => inputSchema.parse(input),
      execute: async (_field, values, principal, execution) => {
        invocations += 1;
        if (mode === 'STALE_BEFORE_TX') await competingHumanChange();
        const args = inputSchema.parse(values);
        const request = {};
        const result = await adminMcpExecution.run({ ...execution, request, user: principal }, () =>
          withoutAudience(() =>
            prisma.$transaction(async (tx) => {
              await domainGate?.();
              const current = adminMcpExecution.getStore();
              expect(current?.inTransaction).toBe(true);
              expect(current?.transactionAudit).toEqual({ businessWrites: false, recorded: false });
              await execution.assertScope?.([Permission.Event.Update], { eventId: args.id });
              if (mode === 'COMMENT_UNAUDITED') await tx.$executeRaw(Prisma.raw('/* domain transaction */ COMMIT'));
              const before = await tx.event.findUniqueOrThrow({
                where: { id: args.id },
                select: { description: true, name: true },
              });
              if (mode === 'RAW_QUERY_UNAUDITED') {
                await tx.$queryRaw`WITH changed AS (UPDATE events SET description = ${args.input.description} WHERE id = ${args.id} RETURNING id) SELECT * FROM changed`;
              } else if (mode === 'RAW_UNAUDITED') {
                await tx.$executeRaw`UPDATE events SET description = ${args.input.description} WHERE id = ${args.id}`;
              } else {
                await tx.event.update({
                  where: { id: args.id },
                  data: { description: args.input.description, name: args.input.name },
                  select: { id: true },
                });
              }
              businessWrites += 1;
              if (current?.transactionAudit) observedAudit.push({ ...current.transactionAudit });
              if (
                mode !== 'UNAUDITED' &&
                mode !== 'RAW_UNAUDITED' &&
                mode !== 'RAW_QUERY_UNAUDITED' &&
                mode !== 'COMMENT_UNAUDITED'
              ) {
                await checkedAudit.record(
                  {
                    ...domainAudit(args.id, before.description ?? '', args.input.description),
                    before: { description: before.description, name: before.name },
                    after: { description: args.input.description, name: args.input.name ?? before.name },
                  },
                  tx,
                );
                if (current?.transactionAudit) observedAudit.push({ ...current.transactionAudit });
              }
              return { id: args.id };
            }),
          ),
        );
        if (mode === 'POST_COMMIT_FAIL') throw new Error('Synthetic response failure after actual business commit');
        return result;
      },
    };
    const config = {
      enabled: true,
      proposalsEnabled: true,
      allowedClients: [CLIENT_ID],
      resourceUrl: RESOURCE,
      applicationOrigin: 'http://localhost:4200',
    } as McpAdminConfig;
    service = new AdminMcpCommandService(
      prisma,
      { assertEligible: async () => undefined } as never,
      config,
      bridge as AdminMcpGraphqlBridge,
      { operation: async () => undefined, assert: async () => undefined } as never,
      policy as never,
      checkedAudit as unknown as AuditLogService,
      { publish: async () => undefined } as never,
      new McpAdminAdvisoryLockService(),
    );
  });

  afterAll(async () => {
    // The real audit synchronizer retries rolled-back records for a bounded
    // 25 + 100 + 500 + 1000 + 2500 ms window. Drain it before closing its pool.
    await new Promise((complete) => setTimeout(complete, 4500));
    await prisma?.$disconnect();
    await sql?.end();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (databaseCreated) await admin.query(`DROP DATABASE ${COMMAND_DATABASE} WITH (FORCE)`);
    await admin?.end();
  });

  beforeEach(async () => {
    mode = 'NORMAL';
    invocations = 0;
    businessWrites = 0;
    observedAudit = [];
    insertedAuditBeforeFailure = false;
    permissionBarrier = undefined;
    domainGate = undefined;
    // Keep earlier rows for delayed audit synchronization while isolating the
    // current test from the actor's ten-active-delegation limit.
    await prisma.mcpAdminOperationDelegation.updateMany({
      where: { userId: USER_ID, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    eventId = randomUUID();
    await sql.query('INSERT INTO events (id, name, description) VALUES ($1, $2, $3)', [
      eventId,
      'Synthetic command event',
      'Original description',
    ]);
    const delegation = await service.createDelegation(user, {
      clientId: CLIENT_ID,
      operations: ['updateEvent'],
      scope: { mode: 'ALL_AUTHORIZED' },
      personalData: false,
      maxProposals: 10,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    delegationId = delegation.id;
  });

  it('excludes privacy cleanup from concurrent job attribution reads and audit writes', async () => {
    await prisma.$transaction(async (tx) => {
      await lockMcpJobAttribution(tx, true);
      const result = await sql.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock_shared(hashtext('mcp-job-attribution-privacy')) AS acquired",
      );
      expect(result.rows[0].acquired).toBe(false);
    });
    await prisma.$transaction(async (tx) => {
      await lockMcpJobAttribution(tx);
      const result = await sql.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtext('mcp-job-attribution-privacy')) AS acquired",
      );
      expect(result.rows[0].acquired).toBe(false);
    });
    const result = await sql.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtext('mcp-job-attribution-privacy')) AS acquired",
    );
    expect(result.rows[0].acquired).toBe(true);
  });

  it('reconciles an interrupted claim only after its PostgreSQL owner releases the lock', async () => {
    const proposal = await stage();
    const locks = new McpAdminAdvisoryLockService();
    const oldClaim = new Date(Date.now() - 120_000);
    await locks.runForCommand(proposal.proposalId, async () => {
      await prisma.mcpAdminCommand.update({
        where: { id: proposal.proposalId },
        data: { state: 'APPLYING', decidedAt: oldClaim },
      });
      await service.recoverInterrupted();
      expect(await commandState(proposal.proposalId)).toBe('APPLYING');
    });

    await service.recoverInterrupted();
    await service.recoverInterrupted();
    expect(await commandState(proposal.proposalId)).toBe('UNCERTAIN');
    expect(invocations).toBe(0);
    expect(
      await prisma.auditLogEntry.count({
        where: {
          entityId: proposal.proposalId,
          metadata: { path: ['result'], equals: 'UNCERTAIN' },
        },
      }),
    ).toBe(1);
  });

  it('persists verified private files and erases bytes through the delegation cascade', async () => {
    await prisma.mcpAdminOperationDelegation.update({
      where: { id: delegationId },
      data: { operations: ['uploadSportsTeamLogo'] },
    });
    const authorization = new AuthorizationPolicyService(prisma);
    const artifacts = new McpAdminFileArtifactService(
      prisma,
      authorization,
      { enabled: true, proposalsEnabled: true, allowedClients: [CLIENT_ID], resourceUrl: RESOURCE } as McpAdminConfig,
      new AdminMcpScopePolicy(authorization, prisma),
      {} as never,
    );
    const bytes = Buffer.from('synthetic-private-file');
    const owner = { userId: USER_ID, clientId: CLIENT_ID, delegationId, operation: 'uploadSportsTeamLogo' };
    const file = await artifacts.createUpload({
      ...owner,
      purpose: 'team-logo',
      target: { teamId: 'synthetic-team' },
      fileName: 'synthetic.png',
      contentType: 'image/png',
      bytes,
      expectedSizeBytes: bytes.length,
      expectedSha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(await artifacts.loadUpload({ ...owner, artifactId: file.artifactId })).toEqual(bytes);
    await expect(
      artifacts.loadUpload({ ...owner, clientId: 'other-client', artifactId: file.artifactId }),
    ).rejects.toThrow();
    await expect(
      sql.query('UPDATE mcp_admin_file_artifacts SET "uploadedBytes" = 0 WHERE id = $1', [file.artifactId]),
    ).rejects.toThrow();
    await prisma.mcpAdminOperationDelegation.delete({ where: { id: delegationId } });
    expect(await prisma.mcpAdminFileArtifact.count({ where: { id: file.artifactId } })).toBe(0);
  });

  it('stages only immutable JSON arguments and applies only the signed human-adjusted values', async () => {
    const proposal = await stage();
    expect(await currentDescription()).toBe('Original description');
    expect(invocations).toBe(0);
    const preview = await review(proposal.proposalId);
    const parsedDecision = decision(preview);
    expect(Object.keys(parsedDecision.review ?? {})).not.toEqual(Object.keys(preview));
    await expect(service.decide(user, proposal.proposalId, parsedDecision)).resolves.toBe('APPLIED');
    await expect(service.status(user, proposal.proposalId)).resolves.toMatchObject({ result: { id: eventId } });
    expect(await currentDescription()).toBe('Human reviewed description');
    expect(await commandState(proposal.proposalId)).toBe('APPLIED');
    expect(observedAudit).toEqual([
      { businessWrites: true, recorded: false },
      { businessWrites: true, recorded: true },
    ]);
    const row = await prisma.mcpAdminCommand.findUniqueOrThrow({
      where: { id: proposal.proposalId },
      select: { arguments: true, reviewedArguments: true },
    });
    expect(row.arguments).toEqual({ id: eventId, input: { description: 'Proposed description' } });
    expect(row.reviewedArguments).toEqual(preview.arguments);
    const evidence = await prisma.auditLogEntry.findFirstOrThrow({
      where: { entityId: eventId, entityType: AuditLogEntityType.EVENT },
      select: { actorId: true, metadata: true, groupedCount: true },
    });
    expect(evidence).toEqual(
      expect.objectContaining({
        actorId: USER_ID,
        groupedCount: 1,
        metadata: expect.objectContaining({
          source: 'mcp',
          proposalId: proposal.proposalId,
          clientId: CLIENT_ID,
          approvedById: USER_ID,
          approvedByName: 'Synthetic Command Approver',
          manuallyEdited: true,
        }),
      }),
    );
  });

  it('keeps multi-field arguments fresh across the PostgreSQL JSONB round trip', async () => {
    const args = { id: eventId, input: { description: 'Two fields', name: 'Renamed event' } };
    const proposal = await service.propose(user, delegationId, 'updateEvent', args, randomUUID());
    const stored = await prisma.mcpAdminCommand.findUniqueOrThrow({ where: { id: proposal.proposalId } });
    expect(Object.keys((stored.arguments as { input: object }).input)).not.toEqual(Object.keys(args.input));
    const preview = await service.review(user, proposal.proposalId, {
      arguments: args,
      expectedFingerprint: stored.fingerprint,
    });
    await expect(service.decide(user, proposal.proposalId, decision(preview))).resolves.toBe('APPLIED');
    expect(
      await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true, description: true } }),
    ).toEqual({ name: 'Renamed event', description: 'Two fields' });
  });

  it('returns one proposal for simultaneous identical keys even at the quota boundary', async () => {
    await prisma.mcpAdminOperationDelegation.update({ where: { id: delegationId }, data: { maxProposals: 1 } });
    const key = randomUUID();
    const args = { id: eventId, input: { description: 'Concurrent proposal' } };
    permissionBarrier = twoPartyBarrier();
    const proposals = await Promise.all([
      service.propose(user, delegationId, 'updateEvent', args, key),
      service.propose(user, delegationId, 'updateEvent', args, key),
    ]);
    permissionBarrier = undefined;
    expect(proposals[0].proposalId).toBe(proposals[1].proposalId);
    expect(await prisma.mcpAdminCommand.count({ where: { delegationId } })).toBe(1);
  });

  it('accepts a validated no-op without creating an empty domain audit record', async () => {
    const proposal = await stage();
    const preview = await review(proposal.proposalId, 'Original description');
    await expect(service.decide(user, proposal.proposalId, decision(preview))).resolves.toBe('APPLIED');
    expect(businessWrites).toBe(1);
    expect(observedAudit).toEqual([
      { businessWrites: true, recorded: false },
      { businessWrites: true, recorded: false, validatedNoop: true },
    ]);
    expect(await businessAuditCount(proposal.proposalId)).toBe(0);
    expect(await currentDescription()).toBe('Original description');
  });

  it('uses real PostgreSQL CAS so overlapping approvals invoke the business operation once', async () => {
    const proposal = await stage();
    const preview = await review(proposal.proposalId);
    permissionBarrier = twoPartyBarrier();
    const outcomes = await Promise.allSettled([
      service.decide(user, proposal.proposalId, decision(preview)),
      service.decide(user, proposal.proposalId, decision(preview)),
    ]);
    permissionBarrier = undefined;
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(invocations).toBe(1);
    expect(businessWrites).toBe(1);
    expect(await businessAuditCount(proposal.proposalId)).toBe(1);
    expect(await commandState(proposal.proposalId)).toBe('APPLIED');
  });

  it('holds the actual target row lock before running the owning business callback', async () => {
    const proposal = await stage();
    const preview = await review(proposal.proposalId);
    let entered: () => void = () => undefined;
    let release: () => void = () => undefined;
    const enteredDomain = new Promise<void>((complete) => {
      entered = complete;
    });
    const releaseDomain = new Promise<void>((complete) => {
      release = complete;
    });
    domainGate = async () => {
      entered();
      await releaseDomain;
    };
    const approving = service.decide(user, proposal.proposalId, decision(preview));
    try {
      await Promise.race([
        enteredDomain,
        approving.then(() => {
          throw new Error('Approval ended before entering the business transaction.');
        }),
      ]);
      await sql.query("SET lock_timeout = '100ms'");
      await expect(
        sql.query('UPDATE events SET description = $1 WHERE id = $2', ['Competing overwrite', eventId]),
      ).rejects.toMatchObject({ code: '55P03' });
    } finally {
      release();
      await sql.query("SET lock_timeout = '0'");
      await approving;
    }
    expect(await commandState(proposal.proposalId)).toBe('APPLIED');
    expect(await currentDescription()).toBe('Human reviewed description');
  });

  it('rolls back business and actual MCP domain audit rows when audit fails after insertion', async () => {
    const proposal = await stage();
    const preview = await review(proposal.proposalId);
    mode = 'AUDIT_FAIL';
    await service.decide(user, proposal.proposalId, decision(preview));
    expect(businessWrites).toBe(1);
    expect(observedAudit).toEqual([{ businessWrites: true, recorded: false }]);
    expect(insertedAuditBeforeFailure).toBe(true);
    expect(await currentDescription()).toBe('Original description');
    expect(await businessAuditCount(proposal.proposalId)).toBe(0);
    expect(await commandState(proposal.proposalId)).toBe('UNCERTAIN');
  });

  it.each(['UNAUDITED', 'RAW_UNAUDITED', 'RAW_QUERY_UNAUDITED', 'COMMENT_UNAUDITED'] as const)(
    'rolls back a %s business writer without its owning transaction audit',
    async (behavior) => {
      const proposal = await stage();
      const preview = await review(proposal.proposalId);
      mode = behavior;
      await service.decide(user, proposal.proposalId, decision(preview));
      if (behavior === 'COMMENT_UNAUDITED') {
        expect(businessWrites).toBe(0);
        expect(observedAudit).toEqual([]);
      } else {
        expect(businessWrites).toBe(1);
        expect(observedAudit).toEqual([{ businessWrites: true, recorded: false }]);
      }
      expect(await currentDescription()).toBe('Original description');
      expect(await businessAuditCount(proposal.proposalId)).toBe(0);
      expect(await commandState(proposal.proposalId)).toBe('UNCERTAIN');
    },
  );

  it('rejects audit outside the owning transaction before any audit row is inserted', async () => {
    const before = await businessAuditCount();
    const execution: AdminMcpExecution = {
      request: {},
      user,
      phase: 'apply',
      proposalId: randomUUID(),
      clientId: CLIENT_ID,
      delegationId,
      operation: 'updateEvent',
      beforeTransaction: async () => undefined,
    };
    await expect(
      adminMcpExecution.run(execution, () =>
        audit.record(domainAudit(eventId, 'Original description', 'Rejected outside write')),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      adminMcpExecution.run({ ...execution, inTransaction: true }, () =>
        audit.record(domainAudit(eventId, 'Original description', 'Rejected root client')),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await businessAuditCount()).toBe(before);
  });

  it('preserves a committed business write and its audit as UNCERTAIN after response failure, without retry', async () => {
    const proposal = await stage();
    const preview = await review(proposal.proposalId);
    mode = 'POST_COMMIT_FAIL';
    await expect(service.decide(user, proposal.proposalId, decision(preview))).resolves.toBe('UNCERTAIN');
    expect(await currentDescription()).toBe('Human reviewed description');
    expect(await commandState(proposal.proposalId)).toBe('UNCERTAIN');
    expect(await businessAuditCount(proposal.proposalId)).toBe(1);
    await expect(service.decide(user, proposal.proposalId, decision(preview))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(invocations).toBe(1);
  });

  it('rechecks the real audit fingerprint after claiming and before entering business code', async () => {
    const proposal = await stage();
    const preview = await review(proposal.proposalId);
    mode = 'STALE_BEFORE_TX';
    await service.decide(user, proposal.proposalId, decision(preview));
    expect(await currentDescription()).toBe('Concurrent human description');
    expect(businessWrites).toBe(0);
    expect(await businessAuditCount(proposal.proposalId)).toBe(0);
    expect(await commandState(proposal.proposalId)).toBe('UNCERTAIN');
  });

  it('blocks raw and model mutations in read phase through the actual Prisma extension', async () => {
    await adminMcpExecution.run(
      { request: {}, user, phase: 'read', clientId: CLIENT_ID, delegationId, operation: 'event' },
      async () => {
        await expect(
          prisma.event.update({ where: { id: eventId }, data: { description: 'Forbidden' }, select: { id: true } }),
        ).rejects.toThrow();
        await expect(
          prisma.$executeRaw`UPDATE events SET description = 'Forbidden' WHERE id = ${eventId}`,
        ).rejects.toThrow();
        await expect(
          prisma.$queryRaw`WITH changed AS (UPDATE events SET description = 'Forbidden' WHERE id = ${eventId} RETURNING id) SELECT * FROM changed`,
        ).rejects.toThrow();
        expect(await prisma.event.count({ where: { id: eventId } })).toBe(1);
      },
    );
    expect(await currentDescription()).toBe('Original description');
  });

  it('permits fixed raw SELECTs inside database read-only snapshots and blocks transaction-control escape', async () => {
    const execution: AdminMcpExecution = {
      request: {},
      user,
      phase: 'read',
      clientId: CLIENT_ID,
      delegationId,
      operation: 'event',
    };
    await adminMcpExecution.run(execution, async () => {
      await expect(prisma.$queryRaw<{ id: string }[]>`SELECT id FROM events WHERE id = ${eventId}`).resolves.toEqual([
        { id: eventId },
      ]);
      await expect(
        prisma.$queryRaw<{ value: string }[]>`SELECT ${'bound; COMMIT; value'}::text AS value`,
      ).resolves.toEqual([{ value: 'bound; COMMIT; value' }]);
      await expect(
        prisma.$transaction(async (tx) => {
          expect(adminMcpExecution.getStore()?.readOnlyDatabase).toBe(true);
          return tx.$queryRaw<{ id: string }[]>`SELECT id FROM events WHERE id = ${eventId}`;
        }),
      ).resolves.toEqual([{ id: eventId }]);
      await expect(prisma.$executeRawUnsafe('SET TRANSACTION READ WRITE')).rejects.toThrow();
      await expect(
        prisma.$transaction(async (tx) => tx.$executeRawUnsafe('SET TRANSACTION READ WRITE')),
      ).rejects.toThrow();
      const escape = `COMMIT; BEGIN READ WRITE; UPDATE events SET description = 'Escaped transaction' WHERE id = '${eventId}'; COMMIT;`;
      // Check persisted state even when a driver rejects its result only after executing SQL.
      const escapes: string[] = [];
      const attempts: [string, () => PromiseLike<unknown>][] = [
        ['$executeRawUnsafe', () => prisma.$executeRawUnsafe(escape)],
        ['$queryRawUnsafe', () => prisma.$queryRawUnsafe(escape)],
        ['$executeRaw', () => prisma.$executeRaw(Prisma.raw(escape))],
        ['$queryRaw', () => prisma.$queryRaw(Prisma.raw(escape))],
        ['SELECT-prefix stack', () => prisma.$queryRaw(Prisma.raw('SELECT 1; ' + escape))],
        [
          'callback COMMIT escape',
          () =>
            prisma.$transaction(async (tx) => {
              await tx.$executeRawUnsafe('COMMIT');
              await tx.$executeRaw`UPDATE events SET description = 'Escaped callback' WHERE id = ${eventId}`;
            }),
        ],
      ];
      for (const [name, attempt] of attempts) {
        await Promise.resolve()
          .then(attempt)
          .catch(() => undefined);
        const persisted = await sql.query<{ description: string }>('SELECT description FROM events WHERE id = $1', [
          eventId,
        ]);
        if (persisted.rows[0]?.description !== 'Original description') {
          escapes.push(name);
          await sql.query('UPDATE events SET description = $1 WHERE id = $2', ['Original description', eventId]);
        }
      }
      expect(escapes).toEqual([]);
    });
  });

  it('cascades queued and reviewed argument erasure when the owning delegation is deleted', async () => {
    const proposal = await stage();
    const preview = await review(proposal.proposalId);
    await service.decide(user, proposal.proposalId, decision(preview));
    expect(await prisma.mcpAdminCommand.count({ where: { delegationId } })).toBe(1);
    await prisma.mcpAdminOperationDelegation.delete({ where: { id: delegationId } });
    expect(await prisma.mcpAdminCommand.count({ where: { id: proposal.proposalId } })).toBe(0);
    expect(await businessAuditCount(proposal.proposalId)).toBe(1);
  });
});
