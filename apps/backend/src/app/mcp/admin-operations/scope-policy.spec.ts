import { ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { ADMIN_MCP_OPERATIONS } from './catalog';
import { AdminMcpScopePolicy, argumentValues, operationContexts } from './scope-policy';
const { jest } = import.meta;

function fixture(events: string[] = ['event-a'], groups: string[] = ['group-a'], majors: string[] = ['major-a']) {
  const policy = {
    buildResourceContext: jest.fn(() => ({ primaryResource: 'sports-match' })),
    resolveOperationTargets: jest.fn(async (permissions: unknown, context: { sportsMatchId?: string }) => {
      void permissions;
      void context;
      return {
        eventIds: new Set(events),
        eventGroupIds: new Set(groups),
        majorEventIds: new Set(majors),
        folderIds: new Set<string>(),
      };
    }),
  };
  const prisma = {
    event: {
      findFirst: jest.fn(async () => ({ eventGroupId: 'group-a', majorEventId: 'major-a' })),
      count: jest.fn(async () => events.length),
    },
    eventGroup: {
      findFirst: jest.fn(async () => ({ majorEventId: 'major-a' })),
      count: jest.fn(async () => groups.length),
    },
    majorEvent: { findFirst: jest.fn(async () => ({ id: 'major-a' })) },
  };
  return { policy, prisma, service: new AdminMcpScopePolicy(policy as never, prisma as never) };
}

describe('administrative MCP local delegation scope', () => {
  it('extracts every nested bulk target rather than taking the first item', () => {
    const args = { input: { actions: [{ matchId: 'match-a' }, { matchId: 'match-b' }, { matchId: 12 }] } };
    expect(argumentValues(args, 'input.actions[].matchId')).toEqual(['match-a', 'match-b']);
    expect(argumentValues(args, 'input.missing[].id')).toEqual([]);
    const operation = ADMIN_MCP_OPERATIONS.find((entry) => entry.field === 'commitAdminSportsMatchActions');
    if (!operation) throw new Error('Missing sports operation');
    const { policy } = fixture();
    expect(operationContexts(operation, args, policy as never)).toEqual([
      { primaryResource: 'sports-match', sportsMatchId: 'match-a' },
      { primaryResource: 'sports-match', sportsMatchId: 'match-b' },
    ]);
  });

  it('rejects global/service/collection operations or missing IDs for resource-only delegation', async () => {
    const { service } = fixture();
    for (const field of ['people', 'majorEvents', 'setSportsParticipantTeam', 'event']) {
      const operation = ADMIN_MCP_OPERATIONS.find((entry) => entry.field === field);
      if (!operation) throw new Error('Missing operation');
      await expect(
        service.operation({ mode: 'RESOURCE', kind: 'EVENT', id: 'event-a' }, operation, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('checks all bulk contexts and denies an out-of-scope later target', async () => {
    const { service, policy } = fixture();
    const operation = ADMIN_MCP_OPERATIONS.find((entry) => entry.field === 'commitAdminSportsMatchActions');
    if (!operation) throw new Error('Missing sports operation');
    policy.resolveOperationTargets.mockImplementation(
      async (_permissions: unknown, context: { sportsMatchId?: string }) => ({
        eventIds: new Set([context.sportsMatchId === 'match-a' ? 'event-a' : 'event-b']),
        eventGroupIds: new Set(['group-a']),
        majorEventIds: new Set(['major-a']),
        folderIds: new Set<string>(),
      }),
    );
    await expect(
      service.operation({ mode: 'RESOURCE', kind: 'EVENT', id: 'event-a' }, operation, {
        input: { actions: [{ matchId: 'match-a' }, { matchId: 'match-b' }] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(policy.resolveOperationTargets).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['EVENT', ['event-b'], ['group-a'], ['major-a']],
    ['EVENT', ['event-a'], ['other-group'], ['major-a']],
    ['EVENT', ['event-a'], ['group-a'], ['other-major']],
    ['EVENT_GROUP', [], [], ['major-a']],
    ['EVENT_GROUP', ['event-a'], ['other-group'], ['major-a']],
    ['MAJOR_EVENT', ['event-a'], ['group-a'], ['other-major']],
  ] as const)('rejects relationship escape from %s', async (kind, events, groups, majors) => {
    const { service } = fixture([...events], [...groups], [...majors]);
    const id = kind === 'EVENT' ? 'event-a' : kind === 'EVENT_GROUP' ? 'group-a' : 'major-a';
    await expect(service.assert({ mode: 'RESOURCE', kind, id }, [Permission.Event.Read], {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('uses actual persisted hierarchy membership for groups and major events', async () => {
    const { service, prisma } = fixture();
    await expect(
      service.assert({ mode: 'RESOURCE', kind: 'EVENT_GROUP', id: 'group-a' }, [Permission.Event.Read], {}),
    ).resolves.toBeUndefined();
    prisma.event.count.mockResolvedValue(0);
    await expect(
      service.assert({ mode: 'RESOURCE', kind: 'EVENT_GROUP', id: 'group-a' }, [Permission.Event.Read], {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.assert({ mode: 'RESOURCE', kind: 'MAJOR_EVENT', id: 'major-a' }, [Permission.Event.Read], {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('treats ALL_AUTHORIZED as local scope admission without minting domain permissions', async () => {
    const { service, policy } = fixture([], [], []);
    await expect(service.assert({ mode: 'ALL_AUTHORIZED' }, [Permission.Event.Update], {})).resolves.toBeUndefined();
    expect(policy.resolveOperationTargets).not.toHaveBeenCalled();
    await expect(
      service.assert({ mode: 'RESOURCE', kind: 'EVENT', id: 'event-a' }, [Permission.Event.Read], {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
