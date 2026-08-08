import { Permission } from '@cacic-fct/shared-permissions';
import { SportsMatchActionType } from '@prisma/client';
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

    expect(policy.assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.SportsMatch.Operate],
      { sportsMatchId: 'match-1' },
    );
    expect(frozen.assertEventMutable).toHaveBeenCalledWith(
      'event-1',
      actor,
      'edit',
    );
    expect(operations.commit).toHaveBeenCalled();
  });
});
