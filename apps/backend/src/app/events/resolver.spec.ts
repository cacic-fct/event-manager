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

  it('uses Typesense rank for unscoped event searches before applying pagination', async () => {
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event-b' }, { id: 'event-a' }]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(true),
      searchEvents: jest.fn().mockResolvedValue({
        available: true,
        ids: ['event-a', 'event-b'],
      }),
    };
    const authorizationPolicy = {
      accessibleEventTargets: jest.fn().mockResolvedValue(null),
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
        ' aula ',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        1,
      ),
    ).resolves.toEqual([{ id: 'event-b' }]);

    expect(typesenseSearch.searchEvents).toHaveBeenCalledWith('aula', 2);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          id: {
            in: ['event-a', 'event-b'],
          },
        },
        skip: 0,
        take: 2,
      }),
    );
  });

  it('uses scalar event snapshots for update audit records', async () => {
    const previousAudit = {
      id: 'event-1',
      name: 'Evento antigo',
      majorEventId: 'major-old',
      eventGroupId: null,
    };
    const updatedDetail = {
      id: 'event-1',
      name: 'Evento novo',
      emoji: 'calendar',
      type: 'OTHER',
      description: null,
      shortDescription: null,
      locationDescription: null,
      majorEventId: 'major-new',
      majorEvent: {
        id: 'major-new',
        name: 'Grande evento',
      },
      eventGroupId: null,
      eventGroup: null,
      startDate: new Date('2026-06-22T12:00:00.000Z'),
      endDate: new Date('2026-06-22T13:00:00.000Z'),
    };
    const updatedAudit = {
      id: 'event-1',
      name: 'Evento novo',
      majorEventId: 'major-new',
      eventGroupId: null,
    };
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(previousAudit),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValueOnce(updatedDetail).mockResolvedValueOnce(updatedAudit),
      },
      eventGroup: {
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue({ eventGroupId: null }),
      },
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const typesenseSearch = {
      upsertEvent: jest.fn(),
    };
    const frozenResources = {
      assertEventUpdateMutable: jest.fn(),
    };
    const auditLog = {
      record: jest.fn(),
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
      resolver.updateEvent(
        'event-1',
        {
          name: 'Evento novo',
          majorEventId: 'major-new',
          eventGroupId: null,
        } as never,
        { req: { user: { sub: 'user-1' } } } as never,
      ),
    ).resolves.toBe(updatedDetail);

    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        before: previousAudit,
        after: updatedAudit,
        scope: expect.objectContaining({
          majorEventId: 'major-new',
          eventGroupId: null,
        }),
      }),
      tx,
    );
    expect(auditLog.record.mock.calls[0][0].after).not.toHaveProperty('majorEvent');
    expect(auditLog.record.mock.calls[0][0].after).not.toHaveProperty('eventGroup');
  });
});
