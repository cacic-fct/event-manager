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
  publiclyVisible: true,
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
    const service = new EventPostCommitEffectsService(
      {} as never,
      typesense as never,
      sitemap as never,
      notifications as never,
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
    const service = new EventPostCommitEffectsService(
      prisma as never,
      typesense as never,
      sitemap as never,
      notifications as never,
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
});
