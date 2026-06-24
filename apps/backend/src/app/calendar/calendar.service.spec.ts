import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventManagerPermissionGrantScope } from '@prisma/client';
import { CalendarService } from './calendar.service';
import {
  ADMIN_CALENDAR_FEED_DISABLED_NO_CURRENT_TARGETS,
  ADMIN_CALENDAR_FEED_DISABLED_STALE_ACCESS,
  CALENDAR_FEED_DISABLED_BY_USER,
  CALENDAR_FEED_DISABLED_STALE_LOGIN,
  SUPER_ADMIN_CALENDAR_FEED_ID,
} from './calendar.models';

describe('CalendarService', () => {
  const now = new Date('2026-06-23T12:00:00.000Z');
  const publicEvent = {
    id: 'event-1',
    name: 'Oficina de TypeScript',
    startDate: new Date('2026-07-01T13:00:00.000Z'),
    endDate: new Date('2026-07-01T15:00:00.000Z'),
    description: 'Aprenda TypeScript com exemplos reais.',
    shortDescription: null,
    latitude: -22.121,
    longitude: -51.409,
    locationDescription: 'FCT Unesp',
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    updatedAt: new Date('2026-06-20T10:00:00.000Z'),
    majorEvent: null,
    eventGroup: null,
  };
  const adminMajorEvent = {
    id: 'major-1',
    name: 'Congresso CACiC',
    startDate: new Date('2026-08-01T12:00:00.000Z'),
    endDate: new Date('2026-08-05T21:00:00.000Z'),
    description: 'Grande evento interno.',
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    updatedAt: new Date('2026-06-20T10:00:00.000Z'),
  };
  const adminEventGroup = {
    id: 'group-1',
    name: 'Trilha de oficinas',
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    updatedAt: new Date('2026-06-20T10:00:00.000Z'),
    events: [
      {
        startDate: new Date('2026-09-01T13:00:00.000Z'),
        endDate: new Date('2026-09-01T15:00:00.000Z'),
      },
      {
        startDate: new Date('2026-09-02T13:00:00.000Z'),
        endDate: new Date('2026-09-02T15:00:00.000Z'),
      },
    ],
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not generate single-event calendars for hidden or missing events', async () => {
    const prisma = createPrismaMock({
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.buildPublicEventCalendar('hidden-event', 'https://eventos.cacic.dev.br')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'hidden-event',
          deletedAt: null,
          publiclyVisible: true,
        },
      }),
    );
  });

  it('includes description and coordinates in public single-event calendars', async () => {
    const prisma = createPrismaMock({
      event: {
        findFirst: jest.fn().mockResolvedValue(publicEvent),
      },
    });
    const service = new CalendarService(prisma as never);

    const download = await service.buildPublicEventCalendar('event-1', 'https://eventos.cacic.dev.br');

    expect(download.fileName).toBe('oficina-de-typescript.ics');
    expect(download.content).toContain('SUMMARY:Oficina de TypeScript');
    expect(download.content).toContain('DESCRIPTION:Aprenda TypeScript com exemplos reais.');
    expect(download.content).toContain('LOCATION:FCT Unesp');
    expect(download.content).toContain('GEO:-22.121;-51.409');
    expect(download.content).toContain('URL;VALUE=URI:https://eventos.cacic.dev.br/app/event/event-1');
  });

  it('disables private feeds when the user last login is older than two years', async () => {
    const prisma = createPrismaMock({
      userCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1',
          enabled: true,
          feedKeyHash: 'hashed-private-key',
          lastFetchedAt: null,
          user: {
            name: 'Student',
            lastLoginAt: new Date('2024-06-22T12:00:00.000Z'),
            people: [{ id: 'person-1' }],
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.buildPrivateUserCalendarFeed('private-key', 'https://eventos.cacic.dev.br')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.userCalendarFeedSettings.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        enabled: true,
      },
      data: {
        enabled: false,
        disabledAt: now,
        disabledReason: CALENDAR_FEED_DISABLED_STALE_LOGIN,
      },
    });
  });

  it('maps disabled private feed settings without exposing the feed path', async () => {
    const prisma = createPrismaMock({
      userCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          feedKeyHash: 'hashed-disabled-key',
          enabled: false,
          disabledAt: now,
          disabledReason: CALENDAR_FEED_DISABLED_BY_USER,
          lastFetchedAt: null,
          rotatedAt: null,
          updatedAt: now,
        }),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.getCurrentUserCalendarFeedSettings('user-1')).resolves.toEqual({
      enabled: false,
      feedPath: null,
      disabledAt: now,
      disabledReason: CALENDAR_FEED_DISABLED_BY_USER,
      lastFetchedAt: null,
      rotatedAt: null,
      updatedAt: now,
    });
  });

  it('rejects private feed key rotation inside the 24-hour cooldown', async () => {
    const prisma = createPrismaMock({
      userCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          rotatedAt: new Date('2026-06-23T00:00:00.000Z'),
        }),
        upsert: jest.fn(),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.rotateCurrentUserCalendarFeedKey('user-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.userCalendarFeedSettings.upsert).not.toHaveBeenCalled();
  });

  it('queries only public, non-deleted private-feed events and deduplicates the calendar output', async () => {
    const prisma = createPrismaMock({
      userCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1',
          enabled: true,
          feedKeyHash: 'hashed-private-key',
          lastFetchedAt: null,
          user: {
            name: 'Student',
            lastLoginAt: now,
            people: [{ id: 'person-1' }],
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([{ event: publicEvent }]),
      },
      majorEventSubscriptionEventSelection: {
        findMany: jest.fn().mockResolvedValue([{ event: publicEvent }]),
      },
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      certificate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });
    const service = new CalendarService(prisma as never);

    const download = await service.buildPrivateUserCalendarFeed('private-key', 'https://eventos.cacic.dev.br');

    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          personId: { in: ['person-1'] },
          deletedAt: null,
          event: expect.objectContaining({
            deletedAt: null,
            publiclyVisible: true,
          }),
        }),
      }),
    );
    expect(download.content.match(/BEGIN:VEVENT/g) ?? []).toHaveLength(1);
    expect(download.content).toContain('CLASS:PRIVATE');
  });

  it('maps missing current admin feed settings to a disabled state', async () => {
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.getCurrentUserAdminCalendarFeedSettings('admin-user')).resolves.toEqual({
      enabled: false,
      feedPath: null,
      disabledAt: null,
      disabledReason: null,
      lastFetchedAt: null,
      lastCheckedAt: null,
      rotatedAt: null,
      updatedAt: null,
    });

    expect(prisma.userAdminCalendarFeedSettings.findUnique).toHaveBeenCalledWith({
      where: {
        userId: 'admin-user',
      },
      select: expect.objectContaining({
        feedKeyHash: true,
        lastCheckedAt: true,
      }),
    });
  });

  it('refreshes current admin feed access checks when settings are read by an authenticated admin', async () => {
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          feedKeyHash: 'hashed-admin-key',
          enabled: true,
          disabledAt: null,
          disabledReason: null,
          lastFetchedAt: null,
          lastCheckedAt: new Date('2026-06-22T12:00:00.000Z'),
          rotatedAt: null,
          updatedAt: now,
        }),
        update: jest.fn().mockResolvedValue({
          feedKeyHash: 'hashed-admin-key',
          enabled: true,
          disabledAt: null,
          disabledReason: null,
          lastFetchedAt: null,
          lastCheckedAt: now,
          rotatedAt: null,
          updatedAt: now,
        }),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.getCurrentUserAdminCalendarFeedSettings('admin-user')).resolves.toEqual({
      enabled: true,
      feedPath: null,
      disabledAt: null,
      disabledReason: null,
      lastFetchedAt: null,
      lastCheckedAt: now,
      rotatedAt: null,
      updatedAt: now,
    });

    expect(prisma.userAdminCalendarFeedSettings.update).toHaveBeenCalledWith({
      where: {
        userId: 'admin-user',
      },
      data: {
        lastCheckedAt: now,
      },
      select: expect.objectContaining({
        lastCheckedAt: true,
      }),
    });
  });

  it('disables current admin feed settings with a user-triggered reason', async () => {
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        updateManyAndReturn: jest.fn().mockResolvedValue([
          {
            feedKeyHash: 'hashed-admin-key',
            enabled: false,
            disabledAt: now,
            disabledReason: CALENDAR_FEED_DISABLED_BY_USER,
            lastFetchedAt: null,
            lastCheckedAt: now,
            rotatedAt: null,
            updatedAt: now,
          },
        ]),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.setCurrentUserAdminCalendarFeedEnabled('admin-user', false)).resolves.toEqual({
      enabled: false,
      feedPath: null,
      disabledAt: now,
      disabledReason: CALENDAR_FEED_DISABLED_BY_USER,
      lastFetchedAt: null,
      lastCheckedAt: now,
      rotatedAt: null,
      updatedAt: now,
    });

    expect(prisma.userAdminCalendarFeedSettings.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        userId: 'admin-user',
      },
      data: {
        enabled: false,
        disabledAt: now,
        disabledReason: CALENDAR_FEED_DISABLED_BY_USER,
        lastCheckedAt: now,
      },
      select: expect.objectContaining({
        feedKeyHash: true,
        lastCheckedAt: true,
      }),
    });
  });

  it('rejects current admin feed key rotation inside the 24-hour cooldown', async () => {
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          rotatedAt: new Date('2026-06-23T00:00:00.000Z'),
        }),
        upsert: jest.fn(),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.rotateCurrentUserAdminCalendarFeedKey('admin-user')).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.userAdminCalendarFeedSettings.upsert).not.toHaveBeenCalled();
  });

  it('does not enable current admin feed settings without current targets', async () => {
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        upsert: jest.fn(),
      },
      eventManagerPermissionGrant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.setCurrentUserAdminCalendarFeedEnabled('admin-user', true)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.userAdminCalendarFeedSettings.upsert).not.toHaveBeenCalled();
  });

  it('enables current admin feed settings after confirming current targets', async () => {
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        upsert: jest.fn().mockResolvedValue({
          feedKeyHash: 'hashed-enabled-key',
          enabled: true,
          disabledAt: null,
          disabledReason: null,
          lastFetchedAt: null,
          lastCheckedAt: now,
          rotatedAt: now,
          updatedAt: now,
        }),
      },
      eventManagerPermissionGrant: {
        findMany: jest.fn().mockResolvedValue([
          {
            permission: Permission.Event.Read,
            scope: EventManagerPermissionGrantScope.GLOBAL,
            eventId: null,
            majorEventId: null,
            eventGroupId: null,
          },
        ]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([publicEvent]),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.setCurrentUserAdminCalendarFeedEnabled('admin-user', true)).resolves.toEqual({
      enabled: true,
      feedPath: expect.stringMatching(/^\/api\/calendar\/admin\/feeds\/[^/]+\.ics$/),
      disabledAt: null,
      disabledReason: null,
      lastFetchedAt: null,
      lastCheckedAt: now,
      rotatedAt: now,
      updatedAt: now,
    });

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          endDate: {
            gte: now,
          },
        },
        take: 1,
      }),
    );
    expect(prisma.userAdminCalendarFeedSettings.upsert).toHaveBeenCalledWith({
      where: {
        userId: 'admin-user',
      },
      create: expect.objectContaining({
        userId: 'admin-user',
        enabled: true,
        lastCheckedAt: now,
        rotatedAt: now,
        feedKeyHash: expect.any(String),
      }),
      update: {
        feedKeyHash: expect.any(String),
        enabled: true,
        disabledAt: null,
        disabledReason: null,
        lastFetchedAt: null,
        lastCheckedAt: now,
        rotatedAt: now,
      },
      select: expect.objectContaining({
        feedKeyHash: true,
        lastCheckedAt: true,
      }),
    });
  });

  it('generates private admin feeds from current scoped permission targets', async () => {
    const adminOnlyEvent = {
      ...publicEvent,
      id: 'admin-event-1',
      name: 'Reunião interna',
    };
    const adminEventGroupWithPastEvent = {
      ...adminEventGroup,
      events: [
        {
          startDate: new Date('2026-06-01T13:00:00.000Z'),
          endDate: new Date('2026-06-01T15:00:00.000Z'),
        },
        ...adminEventGroup.events,
      ],
    };
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'admin-user',
          enabled: true,
          feedKeyHash: 'hashed-admin-key',
          lastFetchedAt: null,
          lastCheckedAt: now,
          user: {
            name: 'Admin User',
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventManagerPermissionGrant: {
        findMany: jest.fn().mockResolvedValue([
          {
            permission: Permission.Event.Read,
            scope: EventManagerPermissionGrantScope.EVENT,
            eventId: 'admin-event-1',
            majorEventId: null,
            eventGroupId: null,
          },
          {
            permission: Permission.EventGroup.Read,
            scope: EventManagerPermissionGrantScope.EVENT_GROUP,
            eventId: null,
            majorEventId: null,
            eventGroupId: 'group-1',
          },
          {
            permission: Permission.MajorEvent.Read,
            scope: EventManagerPermissionGrantScope.MAJOR_EVENT,
            eventId: null,
            majorEventId: 'major-1',
            eventGroupId: null,
          },
        ]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([adminOnlyEvent]),
      },
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([adminEventGroupWithPastEvent]),
      },
      majorEvent: {
        findMany: jest.fn().mockResolvedValue([adminMajorEvent]),
      },
    });
    const service = new CalendarService(prisma as never);

    const download = await service.buildPrivateAdminCalendarFeed('admin-key', 'https://eventos.cacic.dev.br');

    expect(prisma.eventManagerPermissionGrant.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'admin-user',
        deletedAt: null,
        permission: {
          in: [Permission.Event.Read, Permission.EventGroup.Read, Permission.MajorEvent.Read],
        },
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
      },
      select: expect.objectContaining({
        permission: true,
        scope: true,
      }),
    });
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          endDate: { gte: now },
          OR: [{ id: { in: ['admin-event-1'] } }],
        }),
      }),
    );
    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: ['group-1'],
          },
        }),
      }),
    );
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: ['major-1'],
          },
        }),
      }),
    );
    expect(download.content).toContain('SUMMARY:Reunião interna');
    expect(download.content).toContain('SUMMARY:Trilha de oficinas');
    expect(download.content).toContain('SUMMARY:Congresso CACiC');
    expect(download.content).toContain('DTSTART:20260901T130000Z');
    expect(download.content).toContain('DTEND:20260902T150000Z');
    expect(download.content).not.toContain('DTSTART:20260601T130000Z');
    expect(download.content).toContain('URL;VALUE=URI:https://eventos.cacic.dev.br/admin/events/admin-event-1');
    expect(download.content).toContain('URL;VALUE=URI:https://eventos.cacic.dev.br/admin/groups/group-1');
    expect(download.content).toContain('URL;VALUE=URI:https://eventos.cacic.dev.br/admin/major-events/major-1');
    expect(download.content).toContain('CLASS:PRIVATE');
  });

  it('keeps event-only scoped grants from leaking event group calendar entries', async () => {
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'admin-user',
          enabled: true,
          feedKeyHash: 'hashed-admin-key',
          lastFetchedAt: now,
          lastCheckedAt: now,
          user: {
            name: 'Admin User',
          },
        }),
      },
      eventManagerPermissionGrant: {
        findMany: jest.fn().mockResolvedValue([
          {
            permission: Permission.Event.Read,
            scope: EventManagerPermissionGrantScope.EVENT_GROUP,
            eventId: null,
            majorEventId: null,
            eventGroupId: 'group-1',
          },
        ]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([{ ...publicEvent, eventGroup: { name: 'Trilha de oficinas' } }]),
      },
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([adminEventGroup]),
      },
    });
    const service = new CalendarService(prisma as never);

    const download = await service.buildPrivateAdminCalendarFeed('admin-key', 'https://eventos.cacic.dev.br');

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            {
              eventGroupId: {
                in: ['group-1'],
              },
            },
          ],
        }),
      }),
    );
    expect(prisma.eventGroup.findMany).not.toHaveBeenCalled();
    expect(download.content).toContain('SUMMARY:Oficina de TypeScript');
    expect(download.content).not.toContain('SUMMARY:Trilha de oficinas');
  });

  it('disables private admin feeds when authenticated admin access was not checked recently', async () => {
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'admin-user',
          enabled: true,
          feedKeyHash: 'hashed-admin-key',
          lastFetchedAt: null,
          lastCheckedAt: new Date('2026-06-22T11:59:59.000Z'),
          user: {
            name: 'Admin User',
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventManagerPermissionGrant: {
        findMany: jest.fn(),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.buildPrivateAdminCalendarFeed('admin-key', 'https://eventos.cacic.dev.br')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.eventManagerPermissionGrant.findMany).not.toHaveBeenCalled();
    expect(prisma.userAdminCalendarFeedSettings.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'admin-user',
        enabled: true,
      },
      data: {
        enabled: false,
        disabledAt: now,
        disabledReason: ADMIN_CALENDAR_FEED_DISABLED_STALE_ACCESS,
        lastCheckedAt: now,
      },
    });
  });

  it('disables private admin feeds when no current permission target remains', async () => {
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'admin-user',
          enabled: true,
          feedKeyHash: 'hashed-admin-key',
          lastFetchedAt: null,
          lastCheckedAt: now,
          user: {
            name: 'Admin User',
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventManagerPermissionGrant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.buildPrivateAdminCalendarFeed('admin-key', 'https://eventos.cacic.dev.br')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.userAdminCalendarFeedSettings.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'admin-user',
        enabled: true,
      },
      data: {
        enabled: false,
        disabledAt: now,
        disabledReason: ADMIN_CALENDAR_FEED_DISABLED_NO_CURRENT_TARGETS,
        lastCheckedAt: now,
      },
    });
  });

  it('weekly maintenance disables enabled admin feeds without current targets', async () => {
    const prisma = createPrismaMock({
      userAdminCalendarFeedSettings: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'past-admin' }, { userId: 'current-admin' }]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventManagerPermissionGrant: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              permission: Permission.MajorEvent.Read,
              scope: EventManagerPermissionGrantScope.GLOBAL,
              eventId: null,
              majorEventId: null,
              eventGroupId: null,
            },
          ]),
      },
      majorEvent: {
        findMany: jest.fn().mockResolvedValue([adminMajorEvent]),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.runAdminCalendarFeedMaintenance()).resolves.toBe(1);

    expect(prisma.userAdminCalendarFeedSettings.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'past-admin',
          enabled: true,
        },
        data: expect.objectContaining({
          enabled: false,
          disabledReason: ADMIN_CALENDAR_FEED_DISABLED_NO_CURRENT_TARGETS,
        }),
      }),
    );
    expect(prisma.userAdminCalendarFeedSettings.update).not.toHaveBeenCalled();
  });

  it('gets or creates shared super-admin feed settings without exposing stored keys', async () => {
    const prisma = createPrismaMock({
      superAdminCalendarFeedSettings: {
        upsert: jest.fn().mockResolvedValue({
          feedKeyHash: 'hashed-super-key',
          enabled: true,
          lastFetchedAt: null,
          rotatedAt: null,
          updatedAt: now,
        }),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.getSuperAdminCalendarFeedSettings()).resolves.toEqual({
      enabled: true,
      feedPath: null,
      lastFetchedAt: null,
      rotatedAt: null,
      updatedAt: now,
    });

    expect(prisma.superAdminCalendarFeedSettings.upsert).toHaveBeenCalledWith({
      where: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
      },
      create: expect.objectContaining({
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
        enabled: true,
        feedKeyHash: expect.any(String),
      }),
      update: {
        enabled: true,
      },
      select: expect.objectContaining({
        feedKeyHash: true,
      }),
    });
  });

  it('rotates shared super-admin feed settings and clears the sampled fetch timestamp', async () => {
    const prisma = createPrismaMock({
      superAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          rotatedAt: new Date('2026-06-21T12:00:00.000Z'),
        }),
        upsert: jest.fn().mockResolvedValue({
          feedKeyHash: 'hashed-rotated-super-key',
          enabled: true,
          lastFetchedAt: null,
          rotatedAt: now,
          updatedAt: now,
        }),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.rotateSuperAdminCalendarFeedKey()).resolves.toEqual({
      enabled: true,
      feedPath: expect.stringMatching(/^\/api\/calendar\/admin\/super-admin\/[^/]+\.ics$/),
      lastFetchedAt: null,
      rotatedAt: now,
      updatedAt: now,
    });

    expect(prisma.superAdminCalendarFeedSettings.upsert).toHaveBeenCalledWith({
      where: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
      },
      create: expect.objectContaining({
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
        enabled: true,
        rotatedAt: now,
        feedKeyHash: expect.any(String),
      }),
      update: expect.objectContaining({
        enabled: true,
        lastFetchedAt: null,
        rotatedAt: now,
        feedKeyHash: expect.any(String),
      }),
      select: expect.objectContaining({
        feedKeyHash: true,
      }),
    });
  });

  it('rejects shared super-admin feed key rotation inside the 24-hour cooldown', async () => {
    const prisma = createPrismaMock({
      superAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          rotatedAt: new Date('2026-06-23T00:00:00.000Z'),
        }),
        upsert: jest.fn(),
      },
    });
    const service = new CalendarService(prisma as never);

    await expect(service.rotateSuperAdminCalendarFeedKey()).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.superAdminCalendarFeedSettings.upsert).not.toHaveBeenCalled();
  });

  it('generates shared super-admin feeds from every current administrative target', async () => {
    const prisma = createPrismaMock({
      superAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          id: SUPER_ADMIN_CALENDAR_FEED_ID,
          enabled: true,
          feedKeyHash: 'hashed-super-key',
          lastFetchedAt: new Date('2026-06-23T10:00:00.000Z'),
        }),
        updateMany: jest.fn(),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([publicEvent]),
      },
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([adminEventGroup]),
      },
      majorEvent: {
        findMany: jest.fn().mockResolvedValue([adminMajorEvent]),
      },
    });
    const service = new CalendarService(prisma as never);

    const download = await service.buildSuperAdminCalendarFeed('super-key', 'https://eventos.cacic.dev.br');

    expect(download.fileName).toBe('calendario-super-admin-cacic-eventos.ics');
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          endDate: {
            gte: now,
          },
        },
      }),
    );
    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          events: {
            some: {
              deletedAt: null,
              endDate: {
                gte: now,
              },
            },
          },
        }),
      }),
    );
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          endDate: {
            gte: now,
          },
        },
      }),
    );
    expect(download.content).toContain('SUMMARY:Oficina de TypeScript');
    expect(download.content).toContain('SUMMARY:Trilha de oficinas');
    expect(download.content).toContain('SUMMARY:Congresso CACiC');
    expect(download.content).toContain('URL;VALUE=URI:https://eventos.cacic.dev.br/admin/events/event-1');
    expect(download.content).toContain('URL;VALUE=URI:https://eventos.cacic.dev.br/admin/groups/group-1');
    expect(download.content).toContain('URL;VALUE=URI:https://eventos.cacic.dev.br/admin/major-events/major-1');
    expect(prisma.superAdminCalendarFeedSettings.updateMany).not.toHaveBeenCalled();
  });

  it('samples shared super-admin feed fetches when the previous fetch is stale', async () => {
    const prisma = createPrismaMock({
      superAdminCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          id: SUPER_ADMIN_CALENDAR_FEED_ID,
          enabled: true,
          feedKeyHash: 'hashed-super-key',
          lastFetchedAt: new Date('2026-06-22T10:00:00.000Z'),
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([publicEvent]),
      },
    });
    const service = new CalendarService(prisma as never);

    await service.buildSuperAdminCalendarFeed('super-key', 'https://eventos.cacic.dev.br');

    expect(prisma.superAdminCalendarFeedSettings.updateMany).toHaveBeenCalledWith({
      where: {
        id: SUPER_ADMIN_CALENDAR_FEED_ID,
        feedKeyHash: 'hashed-super-key',
        enabled: true,
      },
      data: {
        lastFetchedAt: now,
      },
    });
  });
});

function createPrismaMock(overrides: Record<string, unknown>) {
  return {
    event: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userCalendarFeedSettings: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      updateManyAndReturn: jest.fn(),
    },
    userAdminCalendarFeedSettings: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      updateManyAndReturn: jest.fn(),
    },
    superAdminCalendarFeedSettings: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    eventManagerPermissionGrant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    majorEventSubscriptionEventSelection: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventLecturer: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventAttendance: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    certificate: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      update: jest.fn(),
    },
    eventGroup: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    majorEvent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
    ...overrides,
  };
}
