import { NotFoundException } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CALENDAR_FEED_DISABLED_STALE_LOGIN } from './calendar.models';

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
          feedKey: 'private-key',
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

  it('queries only public, non-deleted private-feed events and deduplicates the calendar output', async () => {
    const prisma = createPrismaMock({
      userCalendarFeedSettings: {
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1',
          enabled: true,
          feedKey: 'private-key',
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
});

function createPrismaMock(overrides: Record<string, unknown>) {
  return {
    event: {
      findFirst: jest.fn(),
    },
    userCalendarFeedSettings: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      updateManyAndReturn: jest.fn(),
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
    $transaction: jest.fn(),
    ...overrides,
  };
}
