import { Permission } from '@cacic-fct/shared-permissions';
import { EventsResolver } from './resolver';

describe('EventsResolver', () => {
  it('records event creation inside the event transaction', async () => {
    const event = {
      id: 'event-1',
      name: 'Evento de teste',
      emoji: 'calendar',
      type: 'OTHER',
      description: null,
      shortDescription: null,
      locationDescription: null,
      majorEventId: null,
      eventGroupId: null,
      startDate: new Date('2026-06-22T12:00:00.000Z'),
      endDate: new Date('2026-06-22T13:00:00.000Z'),
    };
    const tx = {
      event: {
        create: jest.fn().mockResolvedValue(event),
      },
      eventGroup: {
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const typesenseSearch = {
      upsertEvent: jest.fn(),
    };
    const frozenResources = {
      assertEventCreateTargetsMutable: jest.fn(),
    };
    const auditLog = {
      record: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    };
    const resolver = new EventsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      frozenResources as never,
      {} as never,
      auditLog as never,
    );

    await expect(
      resolver.createEvent(
        {
          name: event.name,
          emoji: event.emoji,
          startDate: event.startDate,
          endDate: event.endDate,
        },
        { req: { user: { sub: 'user-1' } } } as never,
      ),
    ).rejects.toThrow('audit unavailable');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ entityId: event.id }), tx);
    expect(typesenseSearch.upsertEvent).not.toHaveBeenCalled();
  });

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
