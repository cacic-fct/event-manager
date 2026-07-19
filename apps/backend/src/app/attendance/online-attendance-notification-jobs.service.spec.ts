import { SubscriptionStatus } from '@prisma/client';
import {
  ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB,
  OnlineAttendanceNotificationJobsService,
} from './online-attendance-notification-jobs.service';

describe('OnlineAttendanceNotificationJobsService', () => {
  const now = new Date('2026-06-25T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('queues one idempotent notification for the start of a valid online attendance window', async () => {
    const { queue, service } = createService();
    const startDate = new Date('2026-06-25T13:00:00.000Z');

    await service.scheduleEvent(onlineAttendanceEvent({ onlineAttendanceStartDate: startDate }));

    expect(queue.add).toHaveBeenCalledWith(
      ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB,
      {
        eventId: 'event-1',
        onlineAttendanceStartDate: startDate.toISOString(),
      },
      expect.objectContaining({
        delay: 3_600_000,
        jobId: `online-attendance-available:event-1:${startDate.getTime()}`,
        removeOnComplete: false,
      }),
    );
  });

  it('does not queue a notification for an expired or incomplete window', async () => {
    const { queue, service } = createService();

    await service.scheduleEvent(
      onlineAttendanceEvent({
        onlineAttendanceEndDate: new Date('2026-06-25T11:00:00.000Z'),
      }),
    );
    await service.scheduleEvent(onlineAttendanceEvent({ onlineAttendanceCode: null }));
    await service.scheduleEvent(
      onlineAttendanceEvent({
        endDate: new Date('2026-06-25T12:30:00.000Z'),
      }),
    );

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not schedule or deliver notifications when the global kill switch is disabled', async () => {
    const { featureFlags, queue, service } = createService();
    featureFlags.isEnabled.mockReturnValue(false);

    await service.scheduleEvent(onlineAttendanceEvent());
    await service.deliver({ eventId: 'event-1', onlineAttendanceStartDate: now.toISOString() });

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('queues an active window immediately so a missed scheduling attempt can be reconciled', async () => {
    const { queue, service } = createService();
    const startDate = new Date('2026-06-25T11:00:00.000Z');

    await service.scheduleEvent(onlineAttendanceEvent({ onlineAttendanceStartDate: startDate }));

    expect(queue.add).toHaveBeenCalledWith(
      ONLINE_ATTENDANCE_AVAILABLE_NOTIFICATION_JOB,
      expect.objectContaining({ onlineAttendanceStartDate: startDate.toISOString() }),
      expect.objectContaining({ delay: 0, removeOnComplete: false, removeOnFail: true }),
    );
  });

  it('does not let notification scheduling failures block admin event changes', async () => {
    const { queue, service } = createService();
    const logError = jest.spyOn(service['logger'], 'error').mockImplementation();
    queue.add.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.scheduleEvent(onlineAttendanceEvent())).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(
      'Could not schedule the online attendance notification for event event-1.',
      expect.stringContaining('Redis unavailable'),
    );
  });

  it('notifies each direct, group, or major-event subscriber once when the window starts', async () => {
    const { notifications, prisma, service } = createService();
    prisma.event.findFirst.mockResolvedValue({
      id: 'event-1',
      name: 'Aula de TypeScript',
      endDate: new Date('2026-06-25T14:00:00.000Z'),
      onlineAttendanceStartDate: now,
      onlineAttendanceCode: 'ABCD',
      onlineAttendanceEndDate: new Date('2026-06-25T14:00:00.000Z'),
      subscriptions: [{ person: person('person-1', 'user-1') }, { person: person('person-2', 'user-2') }],
      majorEvent: {
        subscriptions: [{ person: person('person-2', 'user-2') }, { person: person('person-3', 'user-3') }],
      },
    });
    notifications.mapPersonToRecipient.mockImplementation((value) => ({
      subscriberId: value.userId,
      email: value.email,
    }));

    await service.deliver({
      eventId: 'event-1',
      onlineAttendanceStartDate: now.toISOString(),
    });

    expect(notifications.notifyOnlineAttendanceAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'event-1',
        recipients: [
          { subscriberId: 'user-1', email: 'user-1@example.com' },
          { subscriberId: 'user-2', email: 'user-2@example.com' },
          { subscriberId: 'user-3', email: 'user-3@example.com' },
        ],
      }),
    );
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          onlineAttendanceStartDate: now,
          onlineAttendanceEndDate: { gte: now },
        }),
        select: expect.objectContaining({
          majorEvent: expect.objectContaining({
            select: expect.objectContaining({
              subscriptions: expect.objectContaining({
                where: { deletedAt: null, subscriptionStatus: SubscriptionStatus.CONFIRMED },
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('retries delivery when Novu does not acknowledge the notification', async () => {
    const { notifications, prisma, service } = createService();
    prisma.event.findFirst.mockResolvedValue({
      id: 'event-1',
      name: 'Aula de TypeScript',
      endDate: new Date('2026-06-25T14:00:00.000Z'),
      onlineAttendanceStartDate: now,
      onlineAttendanceCode: 'ABCD',
      onlineAttendanceEndDate: new Date('2026-06-25T14:00:00.000Z'),
      subscriptions: [{ person: person('person-1', 'user-1') }],
      majorEvent: null,
    });
    notifications.mapPersonToRecipient.mockReturnValue({ subscriberId: 'user-1', email: 'user-1@example.com' });
    notifications.notifyOnlineAttendanceAvailable.mockResolvedValue(false);

    await expect(
      service.deliver({ eventId: 'event-1', onlineAttendanceStartDate: now.toISOString() }),
    ).rejects.toThrow('was not acknowledged');
  });

  it('finishes delivery without notifying when there are no recipients', async () => {
    const { notifications, prisma, service } = createService();
    prisma.event.findFirst.mockResolvedValue({
      id: 'event-1',
      name: 'Aula de TypeScript',
      endDate: new Date('2026-06-25T14:00:00.000Z'),
      onlineAttendanceStartDate: now,
      onlineAttendanceCode: 'ABCD',
      onlineAttendanceEndDate: new Date('2026-06-25T14:00:00.000Z'),
      subscriptions: [],
      majorEvent: null,
    });

    await expect(
      service.deliver({ eventId: 'event-1', onlineAttendanceStartDate: now.toISOString() }),
    ).resolves.toBeUndefined();

    expect(notifications.notifyOnlineAttendanceAvailable).not.toHaveBeenCalled();
  });
});

function createService() {
  const prisma = {
    event: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const notifications = {
    mapPersonToRecipient: jest.fn(),
    notifyOnlineAttendanceAvailable: jest.fn().mockResolvedValue(true),
  };
  const queue = {
    add: jest.fn(),
  };
  const featureFlags = {
    isEnabled: jest.fn().mockReturnValue(true),
  };

  return {
    prisma,
    notifications,
    queue,
    featureFlags,
    service: new OnlineAttendanceNotificationJobsService(
      prisma as never,
      notifications as never,
      queue as never,
      featureFlags as never,
    ),
  };
}

function onlineAttendanceEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'event-1',
    endDate: new Date('2026-06-25T14:00:00.000Z'),
    shouldCollectAttendance: true,
    isOnlineAttendanceAllowed: true,
    onlineAttendanceCode: 'ABCD',
    onlineAttendanceStartDate: new Date('2026-06-25T13:00:00.000Z'),
    onlineAttendanceEndDate: new Date('2026-06-25T14:00:00.000Z'),
    ...overrides,
  } as never;
}

function person(id: string, userId: string) {
  return {
    id,
    name: `Pessoa ${id}`,
    email: `${userId}@example.com`,
    phone: null,
    userId,
    user: null,
  };
}
