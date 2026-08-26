import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrizeDrawService } from './prize-draw.service';

describe('PrizeDrawService public audience', () => {
  it('limits participant access to draws whose recorded entries contain their person', async () => {
    const context = createContext({ people: [{ id: 'person-1', mergedIntoId: null }] });

    await expect(context.service.listPublic({ eventId: 'event-1' }, user())).rejects.toThrow(
      'Você não participou deste sorteio',
    );

    expect(context.prisma.prizeDraw.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: 'event-1',
          OR: expect.arrayContaining([
            {
              spins: {
                some: {
                  undoneAt: null,
                  entries: { some: { personId: { in: ['person-1'] } } },
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('allows an administrator only through scoped prize draw read targets', async () => {
    const context = createContext({
      adminTargets: {
        eventIds: new Set(['event-1']),
        eventGroupIds: new Set<string>(),
        majorEventIds: new Set<string>(),
      },
    });

    await expect(context.service.listPublic({ eventId: 'event-1' }, user())).rejects.toThrow(
      'Você não participou deste sorteio',
    );

    const where = context.prisma.prizeDraw.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ eventId: { in: ['event-1'] } });
  });
});

function createContext(input: {
  people?: Array<{ id: string; mergedIntoId: string | null }>;
  adminTargets?: {
    eventIds: Set<string>;
    eventGroupIds: Set<string>;
    majorEventIds: Set<string>;
  };
}) {
  const prisma = {
    event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    people: { findMany: jest.fn().mockResolvedValue(input.people ?? []) },
    prizeDraw: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const policy = {
    accessibleEventTargets: jest.fn().mockResolvedValue(
      input.adminTargets ?? {
        eventIds: new Set<string>(),
        eventGroupIds: new Set<string>(),
        majorEventIds: new Set<string>(),
      },
    ),
  };
  const service = new PrizeDrawService(
    prisma as never,
    {} as never,
    policy as never,
    { publishDraw: jest.fn() } as never,
  );
  return { policy, prisma, service };
}

function user(): AuthenticatedUser {
  return {
    sub: 'user-1',
    token: '',
    realm_access: { roles: [] },
    roles: [],
    roleSet: new Set(),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    claims: {},
  };
}
