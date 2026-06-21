import { Permission } from '@cacic-fct/shared-permissions';
import { EventsResolver } from './resolver';

describe('EventsResolver', () => {
  it('uses SQL search when event access is scoped before pagination', async () => {
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(true),
      searchEvents: jest.fn(),
    };
    const authorizationPolicy = {
      accessibleEventTargets: jest.fn().mockResolvedValue({
        eventIds: new Set(['event-1']),
        majorEventIds: new Set<string>(),
        eventGroupIds: new Set<string>(),
      }),
    };
    const resolver = new EventsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      {} as never,
      authorizationPolicy as never,
    );

    await expect(
      resolver.events(
        { req: { user: { sub: 'user-1' } } } as never,
        'aula',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        0,
        10,
      ),
    ).resolves.toEqual([]);

    expect(authorizationPolicy.accessibleEventTargets).toHaveBeenCalledWith({ sub: 'user-1' }, Permission.Event.Read);
    expect(typesenseSearch.searchEvents).not.toHaveBeenCalled();
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                {
                  id: {
                    in: ['event-1'],
                  },
                },
              ],
            },
          ],
          name: {
            contains: 'aula',
            mode: 'insensitive',
          },
        }),
        take: 10,
      }),
    );
  });
});
