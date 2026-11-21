import { UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../../current-user/context.service';
import { adminMcpExecution } from './execution-context';
const { jest } = import.meta;

function fixture(people: { id: string }[]) {
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({ id: 'operator', name: 'Stored name' })),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    people: { findMany: jest.fn(async () => people), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    accountUserMerge: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const sync = { syncAuthenticatedUser: jest.fn(), getInferredProfile: jest.fn() };
  const merge = { resolveFinalUserId: jest.fn(async (id: string) => id) };
  const service = new CurrentUserContextService(prisma as never, {} as never, merge as never, sync as never);
  const user: AuthenticatedUser = {
    sub: 'operator',
    claims: { is_onboarded: true },
    realm_access: { roles: [] },
    token: '',
    roles: [],
    roleSet: new Set(),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
  };
  const run = () =>
    adminMcpExecution.run(
      { request: {}, user, phase: 'read', clientId: 'client', delegationId: 'delegation', operation: 'event' },
      () => service.resolveCurrentUserContext(user),
    );
  return { prisma, sync, run };
}

describe('administrative MCP current-user resolution', () => {
  it('reads the existing identity without profile sync, identity creation or ticket reconciliation', async () => {
    const { prisma, sync, run } = fixture([{ id: 'person-1' }]);
    await expect(run()).resolves.toEqual({ user: { id: 'operator', name: 'Stored name' }, person: { id: 'person-1' } });
    expect(prisma.people.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'operator', deletedAt: null, mergedIntoId: null },
        take: 2,
      }),
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.people.create).not.toHaveBeenCalled();
    expect(prisma.people.update).not.toHaveBeenCalled();
    expect(prisma.people.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.accountUserMerge.findMany).not.toHaveBeenCalled();
    expect(sync.syncAuthenticatedUser).not.toHaveBeenCalled();
    expect(sync.getInferredProfile).not.toHaveBeenCalled();
  });

  it.each([{ people: [] }, { people: [{ id: 'person-1' }, { id: 'person-2' }] }])(
    'fails closed for missing or ambiguous linked people: %p',
    async ({ people }) => {
      const { run, prisma } = fixture(people);
      await expect(run()).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.people.create).not.toHaveBeenCalled();
      expect(prisma.people.upsert).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
