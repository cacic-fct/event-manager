import { Permission } from '@cacic-fct/shared-permissions';
import { EventGroupsResolver } from './resolver';

describe('EventGroupsResolver authorization', () => {
  it('filters event group collections to scoped event group grants', async () => {
    const prisma = {
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'group-1', name: 'Allowed group' }]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(false),
      searchEventGroups: jest.fn(),
    };
    const authorizationPolicy = {
      accessibleEventGroupIds: jest.fn().mockResolvedValue(new Set(['group-1'])),
    };
    const resolver = new EventGroupsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      authorizationPolicy as never,
    );
    const user = { sub: 'user-1' };

    await expect(resolver.eventGroups({ req: { user: user as never } }, undefined, 0, 20)).resolves.toEqual([
      { id: 'group-1', name: 'Allowed group' },
    ]);

    expect(authorizationPolicy.accessibleEventGroupIds).toHaveBeenCalledWith(user, Permission.EventGroup.Read);
    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          id: { in: ['group-1'] },
        },
      }),
    );
  });
});
