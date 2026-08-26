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
                  presentationAcknowledgedAt: { not: null },
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

  it('hides an unpresented result from the public query while keeping earlier released results', async () => {
    const context = createContext({
      adminTargets: null,
      records: [drawRecord()],
    });

    const [draw] = await context.service.listPublic({ eventId: 'event-1' }, undefined);

    expect(draw.spins.map((spin) => spin.id)).toEqual(['spin-presented']);
    expect(draw.spins[0]?.weightBreakdown).toEqual([{ weight: 1, peopleCount: 1 }]);
    expect(context.prisma.prizeDrawSpinEntry.groupBy).toHaveBeenCalledWith({
      by: ['spinId', 'weight'],
      where: { spin: { drawId: { in: ['draw-1'] } } },
      _count: { _all: true },
      orderBy: [{ spinId: 'asc' }, { weight: 'asc' }],
    });
    expect(context.prisma.prizeDraw.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          spins: { some: { undoneAt: null, presentationAcknowledgedAt: { not: null } } },
        }),
      }),
    );
  });

});

function createContext(input: {
  people?: Array<{ id: string; mergedIntoId: string | null }>;
  adminTargets?: {
    eventIds: Set<string>;
    eventGroupIds: Set<string>;
    majorEventIds: Set<string>;
  } | null;
  records?: unknown[];
}) {
  const prisma = {
    event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    people: { findMany: jest.fn().mockResolvedValue(input.people ?? []) },
    prizeDraw: { findMany: jest.fn().mockResolvedValue(input.records ?? []) },
    prizeDrawSpinEntry: {
      groupBy: jest.fn().mockResolvedValue([
        { spinId: 'spin-presented', weight: 1, _count: { _all: 1 } },
        { spinId: 'spin-not-yet-presented', weight: 1, _count: { _all: 1 } },
      ]),
    },
  };
  const policy = {
    accessibleEventTargets: jest.fn().mockResolvedValue(
      input.adminTargets === undefined ? {
        eventIds: new Set<string>(),
        eventGroupIds: new Set<string>(),
        majorEventIds: new Set<string>(),
      } : input.adminTargets,
    ),
  };
  const realtime = { publishDraw: jest.fn() };
  const notifications = { enqueueWinner: jest.fn() };
  const service = new PrizeDrawService(
    prisma as never,
    {} as never,
    policy as never,
    realtime as never,
    notifications as never,
  );
  return { policy, prisma, realtime, service };
}

function drawRecord() {
  const now = new Date();
  return {
    id: 'draw-1',
    title: 'Sorteio',
    description: null,
    event: { id: 'event-1', name: 'Evento' },
    majorEvent: null,
    includePresent: true,
    includeSubscribers: false,
    includeManualEntries: false,
    chanceMode: 'EQUAL',
    spinLimit: null,
    removeWinnerAfterDraw: false,
    defaultSpeed: 'INSTANT',
    dramaticCountdownSeconds: 3,
    notifyWinner: false,
    frozenAt: null,
    unfrozenAt: null,
    revision: 2,
    plannedSpins: [],
    manualEntries: [],
    weightOverrides: [],
    excludedPeople: [],
    spins: [
      spinRecord('spin-presented', now, now),
      spinRecord('spin-not-yet-presented', new Date(now.getTime() + 60_000), null),
    ],
    createdAt: now,
    updatedAt: now,
  } as never;
}

function spinRecord(id: string, drawnAt: Date, presentationAcknowledgedAt: Date | null) {
  return {
    id,
    sequence: id === 'spin-presented' ? 1 : 2,
    plannedSpinId: null,
    description: null,
    speed: 'INSTANT',
    countdownSeconds: null,
    chanceMode: 'EQUAL',
    removeWinnerAfterDraw: false,
    winnerDisplayName: id === 'spin-presented' ? 'Ana Maria' : 'Bruno Silva',
    winnerPersonId: null,
    winnerWeight: 1,
    entrantCount: 2,
    totalWeight: 2,
    duplicateEntryCount: 0,
    eligibilityFrozenAt: null,
    drawnAt,
    undoneAt: null,
    notificationStatus: 'NOT_REQUESTED',
    presentationAcknowledgedAt,
    winnerPerson: null,
  };
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
