import { EventPostCommitEffectsService, EventPostCommitRecord } from './event-post-commit-effects.service';

const eventRecord = (overrides: Partial<EventPostCommitRecord> = {}): EventPostCommitRecord => ({
  id: 'event-1',
  name: 'Final de futsal',
  emoji: '⚽',
  type: 'OTHER',
  description: null,
  shortDescription: null,
  locationDescription: 'Ginásio',
  majorEventId: 'major-1',
  eventGroupId: 'group-1',
  shouldIssueCertificate: false,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: false,
  onlineAttendanceCode: null,
  onlineAttendanceStartDate: null,
  onlineAttendanceEndDate: null,
  isPubliclyListed: true,
  publicationState: 'PUBLISHED',
  startDate: new Date('2026-08-12T12:00:00.000Z'),
  endDate: new Date('2026-08-12T13:00:00.000Z'),
  ...overrides,
});

describe('EventPostCommitEffectsService', () => {
  it('runs the shared event sitemap, search, and notification effects', async () => {
    const typesense = { upsertEvent: jest.fn(), deleteEvent: jest.fn() };
    const sitemap = { refresh: jest.fn().mockResolvedValue([]) };
    const notifications = { scheduleEvent: jest.fn() };
    const realtime = {
      scope: jest.fn((channel: string) => `scope:${channel}`),
      publish: jest.fn().mockResolvedValue({}),
    };
    const service = new EventPostCommitEffectsService(
      {} as never,
      typesense as never,
      sitemap as never,
      notifications as never,
      realtime as never,
    );
    const event = eventRecord();

    await service.upsertEvent(event);

    expect(sitemap.refresh).toHaveBeenCalledTimes(1);
    expect(typesense.upsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: event.id,
        name: event.name,
        majorEventId: event.majorEventId,
        eventGroupId: event.eventGroupId,
        publicationState: event.publicationState,
      }),
    );
    expect(notifications.scheduleEvent).toHaveBeenCalledWith(event);
    expect(realtime.publish).toHaveBeenCalledWith(
      'scope:admin-workspace',
      expect.objectContaining({ type: 'CATALOG_INVALIDATED', domain: 'event' }),
    );
    expect(realtime.publish).toHaveBeenCalledWith(
      'scope:public-catalog-v2',
      expect.objectContaining({ type: 'PUBLIC_CATALOG_INVALIDATED', revision: expect.any(String) }),
    );
    expect(realtime.publish.mock.calls[1]?.[1]).not.toHaveProperty('domain');
  });

  it('still publishes an invalidation when a committed event side effect fails', async () => {
    const failure = new Error('Typesense indisponível.');
    const realtime = {
      scope: jest.fn((channel: string) => channel),
      publish: jest.fn().mockResolvedValue({}),
    };
    const service = new EventPostCommitEffectsService(
      {} as never,
      { upsertEvent: jest.fn().mockRejectedValue(failure) } as never,
      { refresh: jest.fn().mockResolvedValue([]) } as never,
      { scheduleEvent: jest.fn() } as never,
      realtime as never,
    );

    await expect(service.upsertEvent(eventRecord())).rejects.toBe(failure);

    expect(realtime.publish).toHaveBeenCalledTimes(2);
  });

  it('reconciles active and deleted backing events after a committed sports mutation', async () => {
    const active = { ...eventRecord(), deletedAt: null };
    const deleted = { ...eventRecord({ id: 'event-2' }), deletedAt: new Date('2026-08-12T14:00:00.000Z') };
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([active, deleted]),
      },
    };
    const typesense = { upsertEvent: jest.fn(), deleteEvent: jest.fn() };
    const sitemap = { refresh: jest.fn().mockResolvedValue([]) };
    const notifications = { scheduleEvent: jest.fn() };
    const realtime = {
      scope: jest.fn((channel: string) => channel),
      publish: jest.fn().mockResolvedValue({}),
    };
    const service = new EventPostCommitEffectsService(
      prisma as never,
      typesense as never,
      sitemap as never,
      notifications as never,
      realtime as never,
    );

    await service.syncEvents(['event-1', 'event-2', 'missing-event', 'event-1']);

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['event-1', 'event-2', 'missing-event'] } } }),
    );
    expect(sitemap.refresh).toHaveBeenCalledTimes(1);
    expect(typesense.upsertEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'event-1' }));
    expect(typesense.deleteEvent).toHaveBeenCalledWith('event-2');
    expect(typesense.deleteEvent).toHaveBeenCalledWith('missing-event');
    expect(notifications.scheduleEvent).toHaveBeenCalledTimes(1);
    expect(realtime.publish).toHaveBeenCalledTimes(2);
    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-workspace',
      expect.objectContaining({ type: 'CATALOG_INVALIDATED', domain: 'event' }),
    );
  });

  it('reconciles active and deleted event groups for sports categories', async () => {
    const prisma = {
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'group-1', name: 'Futsal', deletedAt: null },
          { id: 'group-2', name: 'Vôlei', deletedAt: new Date('2026-08-12T14:00:00.000Z') },
        ]),
      },
    };
    const typesense = { upsertEventGroup: jest.fn(), deleteEventGroup: jest.fn() };
    const service = new EventPostCommitEffectsService(
      prisma as never,
      typesense as never,
      { refresh: jest.fn() } as never,
      { scheduleEvent: jest.fn() } as never,
    );

    await service.syncEventGroups(['group-1', 'group-2', 'missing-group']);

    expect(typesense.upsertEventGroup).toHaveBeenCalledWith({ id: 'group-1', name: 'Futsal' });
    expect(typesense.deleteEventGroup).toHaveBeenCalledWith('group-2');
    expect(typesense.deleteEventGroup).toHaveBeenCalledWith('missing-group');
  });

  it('invalidates the catalog for event deletion and event-group reconciliation', async () => {
    const realtime = {
      scope: jest.fn((channel: string) => `scope:${channel}`),
      publish: jest.fn().mockResolvedValue({}),
    };
    const prisma = {
      eventGroup: {
        findMany: jest.fn().mockResolvedValue([{ id: 'group-1', name: 'Futsal', deletedAt: null }]),
      },
    };
    const typesense = {
      deleteEvent: jest.fn(),
      upsertEventGroup: jest.fn(),
    };
    const service = new EventPostCommitEffectsService(
      prisma as never,
      typesense as never,
      { refresh: jest.fn().mockResolvedValue([]) } as never,
      { scheduleEvent: jest.fn() } as never,
      realtime as never,
    );

    await service.deleteEvent('event-deleted');
    await service.syncEventGroups(['group-1']);

    expect(typesense.deleteEvent).toHaveBeenCalledWith('event-deleted');
    expect(realtime.publish).toHaveBeenCalledTimes(4);
    expect(realtime.publish).toHaveBeenCalledWith(
      'scope:admin-workspace',
      expect.objectContaining({ type: 'CATALOG_INVALIDATED', domain: 'event' }),
    );
    expect(realtime.publish).toHaveBeenCalledWith(
      'scope:admin-workspace',
      expect.objectContaining({ type: 'CATALOG_INVALIDATED', domain: 'event-group' }),
    );
  });

  it('does not publish when an empty event reconciliation has no committed target', async () => {
    const realtime = {
      scope: jest.fn(),
      publish: jest.fn(),
    };
    const service = new EventPostCommitEffectsService(
      { event: { findMany: jest.fn() } } as never,
      {} as never,
      {} as never,
      {} as never,
      realtime as never,
    );

    await service.syncEvents([]);
    await service.syncEventGroups(['', '']);

    expect(realtime.publish).not.toHaveBeenCalled();
  });
});
