import { Logger } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { DefaultRedirectRoute } from '../models';
import { CurrentUserDefaultRedirectService } from './service';

describe('CurrentUserDefaultRedirectService', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');
  let prisma: {
    event: { findFirst: jest.Mock };
    majorEvent: { findFirst: jest.Mock };
  };
  let redis: { get: jest.Mock; set: jest.Mock };
  let service: CurrentUserDefaultRedirectService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    prisma = {
      event: { findFirst: jest.fn().mockResolvedValue(null) },
      majorEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };
    service = new CurrentUserDefaultRedirectService(prisma as never, redis as never);
  });

  afterEach(() => jest.useRealTimers());

  it('prioritizes an uncollected ongoing in-person attendance over every other route', async () => {
    prisma.event.findFirst.mockResolvedValueOnce({ id: 'ongoing-event' });

    await expect(service.resolve('person-1')).resolves.toBe(DefaultRedirectRoute.WALLET);
    expect(prisma.majorEvent.findFirst).not.toHaveBeenCalled();
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              shouldCollectAttendance: true,
              isOnlineAttendanceAllowed: false,
              startDate: { lte: now },
              endDate: { gte: now },
              subscriptions: { some: { personId: 'person-1', deletedAt: null } },
              attendances: { none: { personId: 'person-1' } },
            }),
          ]),
        }),
        select: { id: true },
      }),
    );
  });

  it('prioritizes an open unsubscribed major event when there is no attendance action', async () => {
    prisma.majorEvent.findFirst.mockResolvedValueOnce({ id: 'major-event-1' });

    await expect(service.resolve('person-1')).resolves.toBe(DefaultRedirectRoute.MAJOR_EVENT);
    expect(prisma.majorEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { OR: [{ subscriptionStartDate: null }, { subscriptionStartDate: { lte: now } }] },
            { OR: [{ subscriptionEndDate: null }, { subscriptionEndDate: { gte: now } }] },
            {
              subscriptions: {
                none: {
                  personId: 'person-1',
                  deletedAt: null,
                  subscriptionStatus: { not: SubscriptionStatus.CANCELED },
                },
              },
            },
          ]),
        }),
        select: { id: true },
      }),
    );
  });

  it('uses calendar only when a current or future public event exists', async () => {
    prisma.event.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'future-event' });

    await expect(service.resolve('person-1')).resolves.toBe(DefaultRedirectRoute.CALENDAR);
    expect(prisma.event.findFirst).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        AND: expect.arrayContaining([expect.objectContaining({ endDate: { gte: now } })]),
      }),
      select: { id: true },
    });
  });

  it('uses menu when no current or future public event exists', async () => {
    await expect(service.resolve('person-1')).resolves.toBe(DefaultRedirectRoute.MENU);
  });

  it('uses a route cached for the current person without querying event data', async () => {
    redis.get.mockResolvedValue(DefaultRedirectRoute.MAJOR_EVENT);

    await expect(service.resolve('person-1')).resolves.toBe(DefaultRedirectRoute.MAJOR_EVENT);
    expect(redis.get).toHaveBeenCalledWith('current-user:default-redirect:v1:person-1');
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
    expect(prisma.majorEvent.findFirst).not.toHaveBeenCalled();
  });

  it('caches an uncached route for fifteen minutes under the current person key', async () => {
    await service.resolve('person-1');

    expect(redis.set).toHaveBeenCalledWith(
      'current-user:default-redirect:v1:person-1',
      DefaultRedirectRoute.MENU,
      'EX',
      15 * 60,
    );
  });

  it('continues resolving and caches the route when Redis reads fail', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    redis.get.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.resolve('person-1')).resolves.toBe(DefaultRedirectRoute.MENU);

    expect(prisma.event.findFirst).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not read the current-user default redirect cache'));
  });

  it('continues resolving when Redis writes fail', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    redis.set.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.resolve('person-1')).resolves.toBe(DefaultRedirectRoute.MENU);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not cache the current-user default redirect'));
  });

  it('ignores corrupted cached routes and replaces them with the resolved route', async () => {
    redis.get.mockResolvedValue('CORRUPTED_ROUTE');

    await expect(service.resolve('person-1')).resolves.toBe(DefaultRedirectRoute.MENU);

    expect(prisma.event.findFirst).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenCalledWith(
      'current-user:default-redirect:v1:person-1',
      DefaultRedirectRoute.MENU,
      'EX',
      15 * 60,
    );
  });
});
