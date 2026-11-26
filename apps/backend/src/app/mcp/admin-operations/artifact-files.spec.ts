import { Permission } from '@cacic-fct/shared-permissions';
import type { AdminMcpScope } from '@cacic-fct/event-manager-mcp-contracts';
import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { McpAdminConfig } from '../mcp-admin.config';
import { McpAdminFileArtifactService, MCP_FILE_CHUNK_BYTES, type ArtifactInput } from './artifact-files';
import { AdminMcpScopePolicy } from './scope-policy';
import { adminMcpExecution, type AdminMcpExecution } from './execution-context';
const { jest } = import.meta;

function fixture() {
  const now = new Date();
  const owner = { userId: 'user', clientId: 'client', delegationId: 'delegation', operation: 'uploadSportsTeamLogo' };
  const bytes = Buffer.from('private-image');
  const input: ArtifactInput & { bytes: Buffer } = {
    ...owner,
    purpose: 'team-logo',
    target: { sportsTeamId: 'team' },
    fileName: 'logo.png',
    contentType: 'image/png',
    expectedSizeBytes: bytes.length,
    expectedSha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
  };
  const row = {
    id: randomUUID(),
    delegationId: owner.delegationId,
    operation: owner.operation,
    purpose: input.purpose,
    target: input.target,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: bytes.length,
    sha256: input.expectedSha256,
    uploadedBytes: 0,
    ready: false,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
  };
  const grant = {
    ...owner,
    id: owner.delegationId,
    resource: 'https://events.example.test/api/mcp/admin',
    operations: [owner.operation, 'exportDataTransfer'],
    personalData: true,
    scope: { mode: 'ALL_AUTHORIZED' } as AdminMcpScope,
    revokedAt: null,
    expiresAt: row.expiresAt,
  };
  const chunks = new Map<number, { artifactId: string; offset: number; bytes: Uint8Array }>();
  const config = {
    enabled: true,
    proposalsEnabled: true,
    allowedClients: [owner.clientId],
    resourceUrl: grant.resource,
  } as McpAdminConfig;
  const authorization = {
    buildResourceContext: jest.fn((context) => context),
    resolveOperationTargets: jest.fn(async () => ({
      eventIds: new Set(['event']),
      eventGroupIds: new Set<string>(),
      majorEventIds: new Set<string>(),
    })),
    assertPermissions: jest.fn(async () => undefined),
  } as unknown as AuthorizationPolicyService;
  const user = { sub: owner.userId } as AuthenticatedUser;
  const prisma = {
    eventGroup: { findFirst: jest.fn(async () => ({ majorEventId: null })) },
    event: { count: jest.fn(async () => 1) },
    mcpAdminOperationDelegation: {
      findFirst: jest.fn(async ({ where }) => {
        if (
          where.userId !== owner.userId ||
          where.clientId !== owner.clientId ||
          where.resource !== config.resourceUrl ||
          (where.operations?.has && !grant.operations.includes(where.operations.has)) ||
          (where.revokedAt === null && grant.revokedAt) ||
          (where.expiresAt?.gt && grant.expiresAt <= where.expiresAt.gt)
        )
          return null;
        return grant;
      }),
    },
    mcpAdminFileArtifact: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      aggregate: jest.fn(async () => ({ _count: 0, _sum: { sizeBytes: 0 } })),
      create: jest.fn(async ({ data }) => Object.assign(row, data)),
      findFirst: jest.fn(async ({ where }) => {
        const operationMatches = where.operation
          ? where.operation === row.operation
          : !where.OR || where.OR.some((condition) => condition.operation === row.operation);
        return where.id === row.id &&
          where.delegationId === owner.delegationId &&
          row.expiresAt > new Date() &&
          operationMatches
          ? row
          : null;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        if (row.uploadedBytes !== where.uploadedBytes || row.ready) return { count: 0 };
        if (data.uploadedBytes && typeof data.uploadedBytes === 'object') {
          row.uploadedBytes += data.uploadedBytes.increment;
        }
        if (data.ready === true) row.ready = true;
        return { count: 1 };
      }),
    },
    mcpAdminFileArtifactChunk: {
      create: jest.fn(async ({ data }) => {
        const chunk = { ...data };
        chunks.set(data.offset, chunk);
        return chunk;
      }),
      findUnique: jest.fn(async ({ where }) => chunks.get(where.artifactId_offset.offset) ?? null),
      findMany: jest.fn(async ({ where }) =>
        [...chunks.values()]
          .filter((chunk) => chunk.artifactId === where.artifactId)
          .sort((left, right) => left.offset - right.offset),
      ),
    },
    mcpAdminCommand: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (work) => work(prisma));
  const scopes = new AdminMcpScopePolicy(authorization, prisma as never);
  const formImages = {
    authorizeDownload: jest.fn(async () => undefined),
    authorizeDownloadById: jest.fn(async () => undefined),
  };
  const service = new McpAdminFileArtifactService(prisma as never, authorization, config, scopes, formImages as never);
  return { input, owner, bytes, row, grant, chunks, config, authorization, user, prisma, service, scopes, formImages };
}

describe('private MCP file artifacts', () => {
  it('requires complete verified chunks before a file can be loaded by a proposal', async () => {
    const f = fixture();
    const ref = await f.service.begin(f.input);
    await expect(f.service.loadUpload({ ...f.owner, artifactId: ref.artifactId })).rejects.toThrow();
    await expect(f.service.finalize(f.owner, ref.artifactId)).rejects.toThrow('incompleto');
    await f.service.append(f.owner, ref.artifactId, 0, f.bytes.toString('base64'));
    expect(await f.service.finalize(f.owner, ref.artifactId)).toMatchObject({ sha256: f.input.expectedSha256 });
    expect(
      await f.service.loadUpload({
        ...f.owner,
        artifactId: ref.artifactId,
        expectedSha256: f.input.expectedSha256,
        target: f.input.target,
      }),
    ).toEqual(f.bytes);
    await expect(
      f.service.loadUpload({ ...f.owner, artifactId: ref.artifactId, target: { sportsTeamId: 'other' } }),
    ).rejects.toThrow('proposta');
    await expect(
      f.service.loadUpload({ ...f.owner, artifactId: ref.artifactId, expectedSha256: '0'.repeat(64) }),
    ).rejects.toThrow('proposta');
  });

  it('stores bounded chunks separately and reads one exact chunk at a time', async () => {
    const f = fixture();
    const bytes = Buffer.alloc(MCP_FILE_CHUNK_BYTES + 7, 0x42);
    const input = {
      ...f.input,
      bytes,
      expectedSizeBytes: bytes.length,
      expectedSha256: createHash('sha256').update(bytes).digest('hex'),
    };
    const ref = await f.service.createUpload(input);
    expect(f.chunks.size).toBe(2);
    expect([...f.chunks.values()].map((chunk) => chunk.bytes.byteLength)).toEqual([MCP_FILE_CHUNK_BYTES, 7]);

    f.prisma.mcpAdminFileArtifactChunk.findMany.mockClear();
    f.prisma.mcpAdminFileArtifactChunk.findUnique.mockClear();
    const chunk = await f.service.readChunk({ ...f.owner, artifactId: ref.artifactId, offset: 0 }, f.user);
    expect(Buffer.from(chunk.base64, 'base64')).toEqual(bytes.subarray(0, MCP_FILE_CHUNK_BYTES));
    expect(chunk.nextOffset).toBe(MCP_FILE_CHUNK_BYTES);
    expect(f.prisma.mcpAdminFileArtifactChunk.findUnique).toHaveBeenCalledWith({
      where: { artifactId_offset: { artifactId: ref.artifactId, offset: 0 } },
      select: { bytes: true },
    });
    expect(f.prisma.mcpAdminFileArtifactChunk.findMany).not.toHaveBeenCalled();
    const last = await f.service.readChunk(
      { ...f.owner, artifactId: ref.artifactId, offset: MCP_FILE_CHUNK_BYTES },
      f.user,
    );
    expect(Buffer.from(last.base64, 'base64')).toEqual(bytes.subarray(MCP_FILE_CHUNK_BYTES));
    expect(last.nextOffset).toBeNull();
    const eof = await f.service.readChunk({ ...f.owner, artifactId: ref.artifactId, offset: bytes.length }, f.user);
    expect(eof).toEqual({ base64: '', offset: bytes.length, nextOffset: null });
  });

  it('supports a zero-byte file without a chunk row', async () => {
    const f = fixture();
    const empty = Buffer.alloc(0);
    const ref = await f.service.createUpload({
      ...f.input,
      bytes: empty,
      expectedSizeBytes: 0,
      expectedSha256: createHash('sha256').update(empty).digest('hex'),
    });
    expect(f.chunks.size).toBe(0);
    expect(await f.service.readChunk({ ...f.owner, artifactId: ref.artifactId, offset: 0 }, f.user)).toEqual({
      base64: '',
      offset: 0,
      nextOffset: null,
    });
  });

  it('keeps the maximum chunk envelope below the MCP transport request limit', () => {
    const input = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'append_admin_file',
        arguments: {
          delegationId: randomUUID(),
          operation: 'uploadSportsTeamLogo',
          artifactId: randomUUID(),
          offset: 0,
          base64: Buffer.alloc(MCP_FILE_CHUNK_BYTES).toString('base64'),
        },
      },
    };
    expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThan(100 * 1024);
  });

  it('supports exact chunk retries but rejects wrong lengths, offsets, and corrupt hashes', async () => {
    const f = fixture();
    const bytes = Buffer.alloc(MCP_FILE_CHUNK_BYTES + 1, 0x41);
    const input = {
      ...f.input,
      bytes,
      expectedSizeBytes: bytes.length,
      expectedSha256: '0'.repeat(64),
    };
    const ref = await f.service.begin(input);
    await expect(f.service.append(f.owner, ref.artifactId, 0, Buffer.from('x').toString('base64'))).rejects.toThrow(
      'bloco',
    );
    const chunk = bytes.subarray(0, MCP_FILE_CHUNK_BYTES).toString('base64');
    await f.service.append(f.owner, ref.artifactId, 0, chunk);
    expect(await f.service.append(f.owner, ref.artifactId, 0, chunk)).toEqual({ uploadedBytes: MCP_FILE_CHUNK_BYTES });
    await expect(f.service.append(f.owner, ref.artifactId, 1, 'YQ==')).rejects.toThrow();
    await f.service.append(
      f.owner,
      ref.artifactId,
      MCP_FILE_CHUNK_BYTES,
      bytes.subarray(MCP_FILE_CHUNK_BYTES).toString('base64'),
    );
    await expect(f.service.finalize(f.owner, ref.artifactId)).rejects.toThrow('hash');
  });

  it('denies revoked or expired delegations and cleans revoked artifact bytes', async () => {
    const f = fixture();
    f.grant.expiresAt = new Date(Date.now() - 1);
    await expect(f.service.begin(f.input)).rejects.toThrow('Delegação');
    f.grant.expiresAt = new Date(Date.now() + 60_000);

    const ref = await f.service.createUpload(f.input);
    f.grant.revokedAt = new Date();
    await expect(f.service.readChunk({ ...f.owner, artifactId: ref.artifactId, offset: 0 }, f.user)).rejects.toThrow(
      'Delegação',
    );
    f.prisma.mcpAdminFileArtifact.findMany.mockResolvedValue([{ id: ref.artifactId }]);
    await f.service.cleanup();
    expect(f.prisma.mcpAdminFileArtifact.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { OR: [{ expiresAt: expect.any(Object) }, { delegation: { revokedAt: { not: null } } }] },
        take: 50,
      }),
    );
    expect(f.prisma.mcpAdminFileArtifact.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [ref.artifactId] } }),
      }),
    );
  });

  it('denies files beyond per-delegation quotas', async () => {
    const f = fixture();
    f.prisma.mcpAdminFileArtifact.aggregate.mockResolvedValueOnce({ _count: 20, _sum: { sizeBytes: 0 } });
    await expect(f.service.begin(f.input)).rejects.toThrow('Limite');
    f.prisma.mcpAdminFileArtifact.aggregate.mockResolvedValueOnce({
      _count: 0,
      _sum: { sizeBytes: 128 * 1024 * 1024 },
    });
    await expect(f.service.begin(f.input)).rejects.toThrow('Limite');
  });

  it.each(['upload', 'export'])('releases an incomplete %s reservation after a chunk fails', async (kind) => {
    const f = fixture();
    const error = new Error('chunk failed');
    f.prisma.mcpAdminFileArtifactChunk.create.mockRejectedValueOnce(error);
    const operation =
      kind === 'upload'
        ? f.service.createUpload(f.input)
        : f.service.createExport({
            ...f.input,
            operation: 'exportDataTransfer',
          });
    await expect(operation).rejects.toBe(error);
    expect(f.prisma.mcpAdminFileArtifact.deleteMany).toHaveBeenCalledWith({ where: { id: f.row.id } });
  });

  it('requires an own pending proposal with the exact artifact and hash for human inspection', async () => {
    const f = fixture();
    const ref = await f.service.createUpload(f.input);
    f.prisma.mcpAdminCommand.findFirst.mockResolvedValue({
      delegation: f.grant,
      delegationId: f.owner.delegationId,
      operation: f.owner.operation,
      arguments: { artifactId: ref.artifactId, sha256: ref.sha256 },
    });
    expect((await f.service.reviewFile(f.owner.userId, ref.artifactId, 'proposal')).bytes).toEqual(f.bytes);
    f.prisma.mcpAdminCommand.findFirst.mockResolvedValue({
      delegation: f.grant,
      delegationId: f.owner.delegationId,
      operation: f.owner.operation,
      arguments: { artifactId: ref.artifactId, sha256: 'wrong' },
    });
    await expect(f.service.reviewFile(f.owner.userId, ref.artifactId, 'proposal')).rejects.toThrow('vinculado');
  });

  it('confines export staging outside the domain read context and rechecks current native permission on read', async () => {
    const f = fixture();
    const owner = { ...f.owner, operation: 'exportDataTransfer' };
    f.prisma.mcpAdminFileArtifact.create.mockImplementation(async ({ data }) => {
      expect(adminMcpExecution.getStore()).toBeUndefined();
      return Object.assign(f.row, {
        ...data,
        operation: owner.operation,
        purpose: 'export',
        target: {
          eventId: 'event',
          accessRequirements: JSON.stringify([
            { permissions: [Permission.Subscription.Read], context: { eventId: 'event' } },
          ]),
        },
      });
    });
    await adminMcpExecution.run({ phase: 'read' } as AdminMcpExecution, async () => {
      const ref = await f.service.createExport({
        ...owner,
        target: {
          eventId: 'event',
          accessRequirements: JSON.stringify([
            { permissions: [Permission.Subscription.Read], context: { eventId: 'event' } },
          ]),
        },
        fileName: 'data.json',
        contentType: 'application/json',
        bytes: f.bytes,
      });
      expect(adminMcpExecution.getStore()?.phase).toBe('read');
      const chunk = await f.service.readChunk({ ...owner, artifactId: ref.artifactId, offset: 0 }, f.user);
      expect(Buffer.from(chunk.base64, 'base64')).toEqual(f.bytes);
    });
    expect(f.authorization.assertPermissions).toHaveBeenCalledWith(
      f.user,
      [expect.stringContaining('data-transfer#export')],
      { eventId: 'event' },
    );
    const denied = fixture();
    const deniedOwner = { ...denied.owner, operation: 'exportDataTransfer' };
    const ref = await denied.service.createExport({
      ...deniedOwner,
      target: {
        eventId: 'event',
        accessRequirements: JSON.stringify([
          { permissions: [Permission.Subscription.Read], context: { eventId: 'event' } },
        ]),
      },
      fileName: 'data.json',
      contentType: 'application/json',
      bytes: denied.bytes,
    });
    denied.authorization.assertPermissions.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      denied.service.readChunk({ ...deniedOwner, artifactId: ref.artifactId, offset: 0 }, denied.user),
    ).rejects.toThrow();
  });

  it.each([
    {
      operation: 'downloadSportsTeamLogo',
      target: { sportsTeamId: 'team' },
      context: { sportsTeamId: 'team' },
      permission: Permission.SportsTeam.Read,
    },
    {
      operation: 'downloadEventFormImage',
      target: { formId: 'form', imageId: 'image' },
      context: { eventFormId: 'form' },
      permission: Permission.EventForm.Read,
    },
    {
      operation: 'exportEventFormResultsCsv',
      target: { formId: 'form' },
      context: { eventFormId: 'form' },
      permission: Permission.EventForm.Export,
    },
  ])('reads $operation against the owning target', async ({ operation, target, context, permission }) => {
    const f = fixture();
    f.grant.operations.push(operation);
    const owner = { ...f.owner, operation };
    const file = await f.service.createExport({
      ...owner,
      target: target as Record<string, string>,
      fileName: 'export.bin',
      contentType: 'application/octet-stream',
      bytes: f.bytes,
    });

    await expect(
      f.service.readChunk({ ...owner, artifactId: file.artifactId, offset: 0 }, f.user),
    ).resolves.toMatchObject({
      base64: f.bytes.toString('base64'),
    });
    expect(f.authorization.assertPermissions).toHaveBeenCalledWith(
      f.user,
      [permission],
      expect.objectContaining(context),
    );
    if (operation === 'downloadEventFormImage') {
      expect(f.formImages.authorizeDownload).toHaveBeenCalledWith('form', 'image', f.user);
    }
  });

  it('uses the native image check on image-by-ID chunks', async () => {
    const f = fixture();
    const owner = { ...f.owner, operation: 'downloadEventFormImageById' };
    f.grant.operations.push(owner.operation);
    const file = await f.service.createExport({
      ...owner,
      target: { imageId: 'image' },
      fileName: 'image.avif',
      contentType: 'image/avif',
      bytes: f.bytes,
    });
    const read = () => f.service.readChunk({ ...owner, artifactId: file.artifactId, offset: 0 }, f.user);

    await expect(read()).resolves.toMatchObject({ base64: f.bytes.toString('base64') });
    expect(f.formImages.authorizeDownloadById).toHaveBeenCalledWith('image', f.user);
    f.formImages.authorizeDownloadById.mockRejectedValueOnce(new ForbiddenException());
    await expect(read()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies further chunks when the target event leaves the delegated group', async () => {
    const f = fixture();
    const owner = { ...f.owner, operation: 'exportEventSubscriptionBadgesZip' };
    f.grant.operations.push(owner.operation);
    f.grant.scope = { mode: 'RESOURCE', kind: 'EVENT_GROUP', id: randomUUID() };
    const file = await f.service.createExport({
      ...owner,
      target: {
        eventId: 'event',
        accessRequirements: JSON.stringify([
          { permissions: [Permission.Subscription.Read], context: { eventId: 'event' } },
        ]),
      },
      fileName: 'badges.zip',
      contentType: 'application/zip',
      bytes: f.bytes,
    });
    const read = () => f.service.readChunk({ ...owner, artifactId: file.artifactId, offset: 0 }, f.user);

    await expect(read()).resolves.toMatchObject({ base64: f.bytes.toString('base64') });
    f.prisma.event.count.mockResolvedValue(0);
    await expect(read()).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prisma.mcpAdminFileArtifactChunk.findUnique).toHaveBeenCalledTimes(1);
  });
});
