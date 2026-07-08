import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PUBLIC_EVENT_WHERE } from '../../public-events/models';
import { CurrentUserEventAttendanceResolver } from './attendance.resolver';

describe('CurrentUserEventAttendanceResolver', () => {
  it('returns no current-user attendances when the account is not linked to a person', async () => {
    const prisma = {
      eventAttendance: {
        findMany: jest.fn(),
      },
    };
    const { resolver, currentUserContext } = createResolverWithDependencies(prisma, {
      currentUserContext: {
        resolveCurrentUserContext: jest.fn().mockResolvedValue({ person: null }),
      },
    });

    await expect(resolver.currentUserEventAttendances({} as never)).resolves.toEqual([]);

    expect(currentUserContext.getAuthenticatedUser).toHaveBeenCalledWith({});
    expect(prisma.eventAttendance.findMany).not.toHaveBeenCalled();
  });

  it('loads and maps current-user attendances ordered from newest to oldest', async () => {
    const attendance = { personId: 'person-1', eventId: 'event-1' };
    const mappedAttendance = { eventId: 'event-1', attendedAt: new Date('2026-01-01T00:00:00.000Z') };
    const prisma = {
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([attendance]),
      },
    };
    const { resolver, mapper } = createResolverWithDependencies(prisma, {
      mapper: {
        mapCurrentUserEventAttendance: jest.fn().mockReturnValue(mappedAttendance),
      },
    });

    await expect(resolver.currentUserEventAttendances({} as never)).resolves.toEqual([mappedAttendance]);

    expect(prisma.eventAttendance.findMany).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        event: {
          deletedAt: null,
        },
      },
      select: expect.any(Object),
      orderBy: {
        attendedAt: 'desc',
      },
    });
    expect(mapper.mapCurrentUserEventAttendance).toHaveBeenCalledWith(attendance);
  });

  it('returns null for a single current-user attendance when the account is not linked to a person', async () => {
    const prisma = {
      eventAttendance: {
        findFirst: jest.fn(),
      },
    };
    const { resolver } = createResolverWithDependencies(prisma, {
      currentUserContext: {
        resolveCurrentUserContext: jest.fn().mockResolvedValue({ person: null }),
      },
    });

    await expect(resolver.currentUserEventAttendance('event-1', {} as never)).resolves.toBeNull();

    expect(prisma.eventAttendance.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when the current person has no attendance for an event', async () => {
    const prisma = {
      eventAttendance: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const { resolver } = createResolverWithDependencies(prisma);

    await expect(resolver.currentUserEventAttendance('event-1', {} as never)).resolves.toBeNull();

    expect(prisma.eventAttendance.findFirst).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        eventId: 'event-1',
        event: {
          deletedAt: null,
        },
      },
      select: expect.any(Object),
    });
  });

  it('maps a single current-user attendance when it exists', async () => {
    const attendance = { personId: 'person-1', eventId: 'event-1' };
    const mappedAttendance = { eventId: 'event-1', attendedAt: new Date('2026-01-01T00:00:00.000Z') };
    const prisma = {
      eventAttendance: {
        findFirst: jest.fn().mockResolvedValue(attendance),
      },
    };
    const { resolver, mapper } = createResolverWithDependencies(prisma, {
      mapper: {
        mapCurrentUserEventAttendance: jest.fn().mockReturnValue(mappedAttendance),
      },
    });

    await expect(resolver.currentUserEventAttendance('event-1', {} as never)).resolves.toBe(mappedAttendance);

    expect(mapper.mapCurrentUserEventAttendance).toHaveBeenCalledWith(attendance);
  });

  it('rejects empty online attendance codes before querying events', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn(),
      },
    };
    const { resolver } = createResolverWithDependencies(prisma);

    await expect(
      resolver.confirmCurrentUserOnlineAttendance({ eventId: 'event-1', code: '   ' }, {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.event.findFirst).not.toHaveBeenCalled();
  });

  it('requires online attendance confirmation to target a publicly visible event', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const { resolver, frozenResources } = createResolverWithDependencies(prisma);

    await expect(
      resolver.confirmCurrentUserOnlineAttendance(
        { eventId: 'hidden-event', code: '123456' },
        { req: { user: { sub: 'user-1' } } } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [PUBLIC_EVENT_WHERE, { id: 'hidden-event' }],
      },
      select: expect.any(Object),
    });
    expect(frozenResources.assertEventMutable).not.toHaveBeenCalled();
  });

  it.each([
    [
      'does not collect attendance',
      { shouldCollectAttendance: false },
      'does not allow online attendance confirmation.',
    ],
    [
      'does not allow online attendance',
      { isOnlineAttendanceAllowed: false },
      'does not allow online attendance confirmation.',
    ],
    ['has no configured code', { onlineAttendanceCode: null }, 'does not have an online attendance code configured.'],
    ['receives an invalid code', { onlineAttendanceCode: '654321' }, 'Invalid attendance code.'],
    [
      'has not opened yet',
      { onlineAttendanceStartDate: new Date('2099-01-01T00:00:00.000Z') },
      'is not open yet.',
    ],
    [
      'is already closed',
      { onlineAttendanceEndDate: new Date('2000-01-01T00:00:00.000Z') },
      'is already closed.',
    ],
  ])('rejects online attendance confirmation when the event %s', async (_caseName, overrides, message) => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(createOnlineAttendanceEvent(overrides)),
      },
    };
    const { resolver } = createResolverWithDependencies(prisma);

    await expect(
      resolver.confirmCurrentUserOnlineAttendance({ eventId: 'event-1', code: '123456' }, {} as never),
    ).rejects.toThrow(message);
  });

  it('requires an active event subscription before confirming online attendance for subscription events', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(createOnlineAttendanceEvent({ allowSubscription: true })),
      },
      eventSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      eventAttendance: {
        findUnique: jest.fn(),
      },
    };
    const resolver = createResolver(prisma);

    await expect(
      resolver.confirmCurrentUserOnlineAttendance(
        { eventId: 'event-1', code: '123456' },
        { req: { user: { sub: 'user-1' } } } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.eventSubscription.findFirst).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        eventId: 'event-1',
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    expect(prisma.eventAttendance.findUnique).not.toHaveBeenCalled();
  });

  it('requires a confirmed major-event subscription before confirming online attendance for paid major events', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(
          createOnlineAttendanceEvent({
            allowSubscription: false,
            majorEventId: 'major-event-1',
            majorEvent: {
              id: 'major-event-1',
              isPaymentRequired: true,
            },
          }),
        ),
      },
      majorEventSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      eventAttendance: {
        findUnique: jest.fn(),
      },
    };
    const resolver = createResolver(prisma);

    await expect(
      resolver.confirmCurrentUserOnlineAttendance(
        { eventId: 'event-1', code: '123456' },
        { req: { user: { sub: 'user-1' } } } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.majorEventSubscription.findFirst).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        majorEventId: 'major-event-1',
        deletedAt: null,
        subscriptionStatus: 'CONFIRMED',
      },
      select: {
        id: true,
      },
    });
    expect(prisma.eventAttendance.findUnique).not.toHaveBeenCalled();
  });

  it('rejects duplicate online attendance confirmation before creating attendance', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(createOnlineAttendanceEvent()),
      },
      eventAttendance: {
        findUnique: jest.fn().mockResolvedValue({ personId: 'person-1' }),
      },
    };
    const { resolver } = createResolverWithDependencies(prisma);

    await expect(
      resolver.confirmCurrentUserOnlineAttendance({ eventId: 'event-1', code: '123456' }, {} as never),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.eventAttendance.findUnique).toHaveBeenCalledWith({
      where: {
        personId_eventId: {
          personId: 'person-1',
          eventId: 'event-1',
        },
      },
      select: {
        personId: true,
      },
    });
  });

  it('creates online attendance inside a transaction and notifies realtime listeners', async () => {
    const createdAttendance = { personId: 'person-1', eventId: 'event-1' };
    const mappedAttendance = { eventId: 'event-1', attendedAt: new Date('2026-01-01T00:00:00.000Z') };
    const tx = {
      eventAttendance: {
        create: jest.fn().mockResolvedValue(undefined),
        findUniqueOrThrow: jest.fn().mockResolvedValue(createdAttendance),
      },
    };
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(
          createOnlineAttendanceEvent({
            allowSubscription: true,
            majorEventId: 'major-event-1',
            majorEvent: {
              id: 'major-event-1',
              isPaymentRequired: true,
            },
          }),
        ),
      },
      eventSubscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
      },
      majorEventSubscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'major-subscription-1' }),
      },
      eventAttendance: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const { resolver, attendanceCategories, attendanceRealtime, mapper } = createResolverWithDependencies(prisma, {
      mapper: {
        mapCurrentUserEventAttendance: jest.fn().mockReturnValue(mappedAttendance),
      },
    });

    await expect(
      resolver.confirmCurrentUserOnlineAttendance({ eventId: 'event-1', code: ' 123456 ' }, {} as never),
    ).resolves.toBe(mappedAttendance);

    expect(tx.eventAttendance.create).toHaveBeenCalledWith({
      data: {
        personId: 'person-1',
        eventId: 'event-1',
        createdByMethod: 'ONLINE_CODE',
        createdById: 'user-1',
        committedById: 'user-1',
      },
    });
    expect(attendanceCategories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', tx);
    expect(tx.eventAttendance.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        personId_eventId: {
          personId: 'person-1',
          eventId: 'event-1',
        },
      },
      select: expect.any(Object),
    });
    expect(attendanceRealtime.notifyPerson).toHaveBeenCalledWith('person-1');
    expect(mapper.mapCurrentUserEventAttendance).toHaveBeenCalledWith(createdAttendance);
  });

  it('returns pending online attendance events for the current person', async () => {
    const pendingEvents = [{ eventId: 'event-1' }];
    const { resolver, attendanceRealtime } = createResolverWithDependencies(
      {},
      {
        attendanceRealtime: {
          listPendingOnlineAttendanceEvents: jest.fn().mockResolvedValue(pendingEvents),
        },
      },
    );

    await expect(resolver.currentUserPendingOnlineAttendanceEvents({} as never)).resolves.toBe(pendingEvents);

    expect(attendanceRealtime.listPendingOnlineAttendanceEvents).toHaveBeenCalledWith('person-1');
  });

  it('returns null organizer info when the account is not linked to a person', async () => {
    const prisma = {
      event: {
        findMany: jest.fn(),
      },
    };
    const { resolver } = createResolverWithDependencies(prisma, {
      currentUserContext: {
        resolveCurrentUserContext: jest.fn().mockResolvedValue({ person: null }),
      },
    });

    await expect(resolver.currentUserOrganizerInfo('event', 'event-1', {} as never)).resolves.toBeNull();

    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('returns null organizer info when the current lecturer has no events for the target', async () => {
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const { resolver } = createResolverWithDependencies(prisma);

    await expect(resolver.currentUserOrganizerInfo('event', 'event-1', {} as never)).resolves.toBeNull();

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: {
        id: 'event-1',
        deletedAt: null,
        lecturers: {
          some: {
            personId: 'person-1',
          },
        },
      },
      select: expect.any(Object),
      orderBy: {
        startDate: 'asc',
      },
    });
  });

  it('rejects unsupported organizer info target types', async () => {
    const prisma = {
      event: {
        findMany: jest.fn(),
      },
    };
    const { resolver } = createResolverWithDependencies(prisma);

    await expect(resolver.currentUserOrganizerInfo('other', 'target-1', {} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['event', 'event-1', { id: 'event-1' }, 'Aula inaugural'],
    ['event-group', 'group-1', { eventGroupId: 'group-1' }, 'Grupo principal'],
    ['major-event', 'major-1', { majorEventId: 'major-1' }, 'Grande evento'],
  ])(
    'loads organizer info for %s targets with subscriber and attendance counts',
    async (targetType, targetId, targetWhere, expectedTitle) => {
      const events = [
        createOrganizerEvent({
          id: 'event-1',
          name: 'Aula inaugural',
          eventGroup: { id: 'group-1', name: 'Grupo principal' },
          majorEvent: { id: 'major-1', name: 'Grande evento' },
          onlineAttendanceCode: '123456',
        }),
        createOrganizerEvent({
          id: 'event-2',
          name: 'Oficina',
          eventGroup: null,
          majorEvent: null,
          onlineAttendanceCode: null,
        }),
      ];
      const prisma = {
        event: {
          findMany: jest.fn().mockResolvedValue(events),
        },
        eventSubscription: {
          groupBy: jest.fn().mockResolvedValue([{ eventId: 'event-1', _count: { _all: 2 } }]),
        },
        majorEventSubscriptionEventSelection: {
          groupBy: jest
            .fn()
            .mockResolvedValue([
              { eventId: 'event-1', _count: { _all: 3 } },
              { eventId: 'event-2', _count: { _all: 4 } },
            ]),
        },
        eventAttendance: {
          groupBy: jest.fn().mockResolvedValue([{ eventId: 'event-2', _count: { _all: 5 } }]),
        },
      };
      const { resolver, mapper, authorizationPolicy } = createResolverWithDependencies(prisma, {
        mapper: {
          mapPublicEvent: jest.fn((event: { id: string; name: string }) => ({ id: event.id, name: event.name })),
        },
        authorizationPolicy: {
          canLecturerViewSubscriberList: jest.fn((event: { id: string }) => event.id === 'event-1'),
        },
      });

      await expect(resolver.currentUserOrganizerInfo(targetType, targetId, {} as never)).resolves.toEqual({
        targetType,
        targetId,
        title: expectedTitle,
        events: [
          {
            event: { id: 'event-1', name: 'Aula inaugural' },
            subscriberCount: 5,
            attendanceCount: 0,
            onlineAttendanceCode: '123456',
            canDownloadSubscriberList: true,
          },
          {
            event: { id: 'event-2', name: 'Oficina' },
            subscriberCount: 4,
            attendanceCount: 5,
            onlineAttendanceCode: undefined,
            canDownloadSubscriberList: false,
          },
        ],
      });

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {
          ...targetWhere,
          deletedAt: null,
          lecturers: {
            some: {
              personId: 'person-1',
            },
          },
        },
        select: expect.any(Object),
        orderBy: {
          startDate: 'asc',
        },
      });
      expect(mapper.mapPublicEvent).toHaveBeenCalledTimes(2);
      expect(authorizationPolicy.canLecturerViewSubscriberList).toHaveBeenCalledTimes(2);
    },
  );

  it('throws not found when downloading a subscriber list for a missing event', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const { resolver, authorizationPolicy } = createResolverWithDependencies(prisma);

    await expect(resolver.downloadCurrentUserEventSubscriberList('event-1', {} as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(authorizationPolicy.assertLecturerCanViewSubscriberList).not.toHaveBeenCalled();
  });

  it('builds a merged subscriber CSV with sorted names, masked CPFs and fallback file slug', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'event-1',
          name: '!!!',
          endDate: new Date('2099-01-01T00:00:00.000Z'),
          shouldProvideSubscriberListToLecturer: true,
          lecturers: [{ personId: 'person-1' }],
        }),
      },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            person: {
              id: 'person-2',
              name: 'Zoé',
              identityDocument: '529.982.247-25',
            },
          },
          {
            person: {
              id: 'person-3',
              name: 'Ana',
              identityDocument: null,
            },
          },
        ]),
      },
      majorEventSubscriptionEventSelection: {
        findMany: jest.fn().mockResolvedValue([
          {
            subscription: {
              person: {
                id: 'person-2',
                name: 'Zoé',
                identityDocument: '52998224725',
              },
            },
          },
          {
            subscription: {
              person: {
                id: 'person-4',
                name: 'Bruno, Teste',
                identityDocument: 'documento externo',
              },
            },
          },
        ]),
      },
    };
    const { resolver, authorizationPolicy } = createResolverWithDependencies(prisma);

    const result = await resolver.downloadCurrentUserEventSubscriberList('event-1', {} as never);
    const csv = Buffer.from(result.contentBase64, 'base64').toString('utf8');

    expect(result).toMatchObject({
      fileName: 'inscritos-evento.csv',
      mimeType: 'text/csv;charset=utf-8',
    });
    expect(csv).toBe(
      '\uFEFFNome,CPF\nAna,\n"Bruno, Teste",documento externo\nZoé,•••.982.247-••\n',
    );
    expect(authorizationPolicy.assertLecturerCanViewSubscriberList).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1' }),
      'person-1',
    );
  });

  it.each(['=', '+', '-', '@', '\t', '\r'])(
    'prefixes subscriber CSV values starting with %s to prevent spreadsheet formula execution',
    async (prefix) => {
      const prisma = {
        event: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'event-1',
            name: 'Evento de teste',
            endDate: new Date('2099-01-01T00:00:00.000Z'),
            shouldProvideSubscriberListToLecturer: true,
            lecturers: [{ personId: 'lecturer-1' }],
          }),
        },
        eventSubscription: {
          findMany: jest.fn().mockResolvedValue([
            {
              person: {
                id: 'person-1',
                name: `${prefix}HYPERLINK("https://example.com")`,
                identityDocument: `${prefix}SUM(1,2)`,
              },
            },
          ]),
        },
        majorEventSubscriptionEventSelection: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const currentUserContext = {
        requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'lecturer-1' }),
      };
      const authorizationPolicy = {
        assertLecturerCanViewSubscriberList: jest.fn(),
      };
      const resolver = new CurrentUserEventAttendanceResolver(
        prisma as never,
        currentUserContext as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        authorizationPolicy as never,
      );

      const result = await resolver.downloadCurrentUserEventSubscriberList('event-1', {} as never);
      const csv = Buffer.from(result.contentBase64, 'base64').toString('utf8');

      expect(csv).toBe(
        `\uFEFFNome,CPF\n${escapeExpectedCsvCell(`'${prefix}HYPERLINK("https://example.com")`)},${escapeExpectedCsvCell(`'${prefix}SUM(1,2)`)}\n`,
      );
    },
  );
});

function createResolver(prisma: unknown): CurrentUserEventAttendanceResolver {
  return createResolverWithDependencies(prisma).resolver;
}

function createResolverWithDependencies(
  prisma: unknown,
  overrides: {
    currentUserContext?: Record<string, unknown>;
    mapper?: Record<string, unknown>;
    attendanceCategories?: Record<string, unknown>;
    attendanceRealtime?: Record<string, unknown>;
    frozenResources?: Record<string, unknown>;
    authorizationPolicy?: Record<string, unknown>;
  } = {},
) {
  const currentUserContext = {
    getAuthenticatedUser: jest.fn().mockReturnValue({ sub: 'user-1' }),
    requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }),
    resolveCurrentUserContext: jest.fn().mockResolvedValue({ person: { id: 'person-1' } }),
    ...overrides.currentUserContext,
  };
  const mapper = {
    mapCurrentUserEventAttendance: jest.fn((attendance: unknown) => attendance),
    mapPublicEvent: jest.fn((event: unknown) => event),
    ...overrides.mapper,
  };
  const attendanceCategories = {
    refreshForAttendance: jest.fn().mockResolvedValue(undefined),
    ...overrides.attendanceCategories,
  };
  const attendanceRealtime = {
    notifyPerson: jest.fn().mockResolvedValue(undefined),
    listPendingOnlineAttendanceEvents: jest.fn().mockResolvedValue([]),
    ...overrides.attendanceRealtime,
  };
  const frozenResources = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    ...overrides.frozenResources,
  };
  const authorizationPolicy = {
    assertLecturerCanViewSubscriberList: jest.fn(),
    canLecturerViewSubscriberList: jest.fn().mockReturnValue(false),
    ...overrides.authorizationPolicy,
  };

  const resolver = new CurrentUserEventAttendanceResolver(
    prisma as never,
    currentUserContext as never,
    mapper as never,
    attendanceCategories as never,
    attendanceRealtime as never,
    frozenResources as never,
    authorizationPolicy as never,
  );

  return {
    resolver,
    currentUserContext,
    mapper,
    attendanceCategories,
    attendanceRealtime,
    frozenResources,
    authorizationPolicy,
  };
}

function createOnlineAttendanceEvent(
  overrides: Partial<{
    allowSubscription: boolean;
    shouldCollectAttendance: boolean;
    isOnlineAttendanceAllowed: boolean;
    onlineAttendanceCode: string | null;
    onlineAttendanceStartDate: Date | null;
    onlineAttendanceEndDate: Date | null;
    majorEventId: string | null;
    majorEvent: { id: string; isPaymentRequired: boolean } | null;
  }> = {},
) {
  return {
    id: 'event-1',
    name: 'Evento de teste',
    allowSubscription: false,
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: true,
    onlineAttendanceCode: '123456',
    onlineAttendanceStartDate: new Date('2000-01-01T00:00:00.000Z'),
    onlineAttendanceEndDate: new Date('2099-01-01T00:00:00.000Z'),
    majorEventId: null,
    majorEvent: null,
    ...overrides,
  };
}

function createOrganizerEvent(
  overrides: Partial<{
    id: string;
    name: string;
    eventGroup: { id: string; name: string } | null;
    majorEvent: { id: string; name: string } | null;
    onlineAttendanceCode: string | null;
  }> = {},
) {
  return {
    id: 'event-1',
    name: 'Evento',
    eventGroup: null,
    majorEvent: null,
    onlineAttendanceCode: null,
    shouldProvideSubscriberListToLecturer: false,
    ...overrides,
  };
}

function escapeExpectedCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
