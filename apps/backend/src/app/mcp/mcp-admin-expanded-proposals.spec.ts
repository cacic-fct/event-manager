import { ForbiddenException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import { SportsBackingResourceLifecycleService } from '../sports/sports-backing-resource-lifecycle.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminConfig } from './mcp-admin.config';
import { McpAdminProposalsService } from './mcp-admin-proposals.service';

const { jest } = import.meta;

function setup() {
  const now = new Date();
  const user: AuthenticatedUser = {
    sub: 'user-1',
    token: 'unused',
    realm_access: { roles: [] },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    claims: { azp: 'mcp-client' },
  };
  const proposal = {
    id: 'proposal-1',
    eventId: 'event-1',
    delegationId: 'delegation-1',
    operation: 'EVENT_LIVESTREAM',
    beforeValues: { youtubeCode: null },
    afterValues: { youtubeCode: 'abc' },
    baseUpdatedAt: now,
    state: 'PENDING',
    expiresAt: new Date(Date.now() + 60000),
    event: { updatedAt: now, youtubeCode: null },
    delegation: { revokedAt: null, expiresAt: new Date(Date.now() + 60000) },
  };
  const tx = {
    event: { findFirst: jest.fn() },
    mcpAdminProposal: { findFirst: jest.fn().mockResolvedValue(proposal), findUnique: jest.fn() },
  };
  const prisma = {
    mcpAdminProposal: tx.mcpAdminProposal,
    $transaction: jest.fn(async (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(tx as unknown as Prisma.TransactionClient),
    ),
  };
  const access = { assertToolAccess: jest.fn().mockResolvedValue({ id: 'delegation-1' }) };
  const service = new McpAdminProposalsService(
    prisma as unknown as PrismaService,
    access as unknown as McpAdminAccessService,
    {} as FrozenResourceService,
    {} as SportsBackingResourceLifecycleService,
    {} as AuditLogService,
    { applicationOrigin: 'https://events.example' } as McpAdminConfig,
  );
  return { service, user, tx, access };
}

describe('expanded MCP proposal access', () => {
  it.each([
    ['EVENT_CONTENT', 'EVENT_CONTENT_PROPOSE'],
    ['EVENT_LOCATION', 'LOCATION_PROPOSE'],
    ['EVENT_PREPARATION', 'PREPARATION_PROPOSE'],
    ['EVENT_LIVESTREAM', 'LIVESTREAM_PROPOSE'],
  ] as const)('denies %s before loading event content when its capability is absent', async (operation, capability) => {
    const { service, user, tx, access } = setup();
    access.assertToolAccess.mockRejectedValue(new ForbiddenException());
    await expect(
      service.proposeChange(user, operation, {
        delegationId: 'delegation-1',
        eventId: 'event-1',
        changes: {},
        expectedUpdatedAt: new Date().toISOString(),
        idempotencyKey: 'unused',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.assertToolAccess).toHaveBeenCalledWith(
      user,
      'delegation-1',
      capability,
      'event-1',
      expect.anything(),
    );
    expect(tx.event.findFirst).not.toHaveBeenCalled();
    expect(tx.mcpAdminProposal.findUnique).not.toHaveBeenCalled();
  });

  it('uses the proposal operation capability when querying status', async () => {
    const { service, user, access } = setup();
    await expect(service.status(user, 'delegation-1', 'proposal-1')).resolves.toMatchObject({ state: 'PENDING' });
    expect(access.assertToolAccess).toHaveBeenCalledWith(user, 'delegation-1', 'LIVESTREAM_PROPOSE', 'event-1');
  });
});
