import { Permission } from '@cacic-fct/shared-permissions';
import { SportsMatchActionType } from '@prisma/client';
import { verifySportsOfflineCollectorCredential } from './security/sports-offline-collector-credential';
import { SportsMutationsResolver } from './sports-mutations.resolver';

describe('SportsMutationsResolver security boundaries', () => {
  const actor = {
    sub: 'admin-1',
    token: 'token',
    permissionSet: new Set<string>(),
  };
  const policy = {
    assertPermissions: jest.fn().mockResolvedValue(undefined),
  };
  const frozen = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    sportsMatch: {
      findUnique: jest.fn().mockResolvedValue({ eventId: 'event-1' }),
    },
  };
  const currentUser = {
    getAuthenticatedUser: jest.fn().mockReturnValue(actor),
  };
  const operations = {
    commit: jest.fn().mockResolvedValue([{ id: 'action-1' }]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('enforces the frozen event boundary before admin match operations', async () => {
    const resolver = new SportsMutationsResolver(
      policy as never,
      frozen as never,
      prisma as never,
      currentUser as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      operations as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await resolver.commitAdminMatchActions(
      {
        actions: [
          {
            clientId: 'client-1',
            matchId: 'match-1',
            baseRevision: 1,
            type: SportsMatchActionType.START,
            payloadJson: '{}',
            authoredAt: new Date(),
          },
        ],
      },
      { req: { user: actor } } as never,
    );

    expect(policy.assertPermissions).toHaveBeenCalledWith(actor, [Permission.SportsMatch.Operate], {
      sportsMatchId: 'match-1',
    });
    expect(frozen.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'edit');
    expect(operations.commit).toHaveBeenCalled();
  });

  it('uses the admin actor when the public operation mutation is opened by an authorized admin', async () => {
    const access = {
      requireMatchOperator: jest.fn().mockResolvedValue({
        actor: { id: 'admin-person' },
        assignment: null,
        kind: 'ADMIN',
      }),
    };
    const resolver = new SportsMutationsResolver(
      policy as never,
      frozen as never,
      prisma as never,
      currentUser as never,
      {} as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
      operations as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await resolver.commitMatchActions(
      {
        actions: [
          {
            clientId: 'client-1',
            matchId: 'match-1',
            baseRevision: 1,
            type: SportsMatchActionType.START,
            payloadJson: '{}',
            authoredAt: new Date(),
          },
        ],
      },
      { req: { user: actor } } as never,
    );

    expect(access.requireMatchOperator).toHaveBeenCalledWith(expect.anything(), 'match-1');
    expect(operations.commit).toHaveBeenCalledWith(
      [expect.objectContaining({ matchId: 'match-1', payload: {} })],
      expect.objectContaining({
        personId: undefined,
        userId: 'admin-1',
        role: 'ADMIN',
        kind: 'ADMIN',
        auditActor: actor,
      }),
    );
  });

  it('issues collector proof only after resolving the current match operator', async () => {
    const access = {
      requireMatchOperator: jest.fn().mockResolvedValue({
        actor: { id: 'official-person-1', userId: 'official-user-1' },
        assignment: { role: 'REFEREE' },
        kind: 'OFFICIAL',
      }),
    };
    const resolver = new SportsMutationsResolver(
      policy as never,
      frozen as never,
      prisma as never,
      currentUser as never,
      {} as never,
      access as never,
      {} as never,
      {} as never,
      {} as never,
      operations as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await resolver.createOfflineCollectorCredential('match-1', {
      req: { user: actor },
    } as never);

    expect(access.requireMatchOperator).toHaveBeenCalledWith(expect.anything(), 'match-1');
    expect(result).toMatchObject({ collectorPersonId: 'official-person-1' });
    expect(verifySportsOfflineCollectorCredential(result.credential)).toMatchObject({
      matchId: 'match-1',
      collectorPersonId: 'official-person-1',
      collectorUserId: 'official-user-1',
      collectorRole: 'REFEREE',
      collectorKind: 'OFFICIAL',
    });
  });
});
