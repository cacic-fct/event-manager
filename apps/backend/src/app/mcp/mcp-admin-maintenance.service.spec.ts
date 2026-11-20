import { EventPostCommitEffectsService } from '../events/event-post-commit-effects.service';
import { PrismaService } from '../prisma/prisma.service';
import { SportsMutationEventsService } from '../sports/realtime/sports-mutation-events.service';
import { McpEventContentSyncLockService } from './mcp-event-content-sync-lock.service';
import { McpAdminMaintenanceService } from './mcp-admin-maintenance.service';

const { jest } = import.meta;

function context() {
  const entry = { eventId: 'event-1', revision: 2, leaseUntil: null, createdAt: new Date() };
  const prisma = {
    mcpEventContentSync: {
      findMany: jest.fn().mockResolvedValue([entry]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    mcpAdminOperationLog: {
      findMany: jest.fn().mockResolvedValue([{ id: 'old-log' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    mcpAdminDelegation: {
      findMany: jest.fn().mockResolvedValue([{ id: 'expired-delegation' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const effects = { syncEventContent: jest.fn().mockResolvedValue(undefined) };
  const sports = { publishForBackingEvent: jest.fn().mockResolvedValue(undefined) };
  const syncLock = { run: jest.fn(async (_eventId: string, operation: () => Promise<void>) => operation()) };
  const service = new McpAdminMaintenanceService(
    prisma as unknown as PrismaService,
    effects as unknown as EventPostCommitEffectsService,
    sports as unknown as SportsMutationEventsService,
    syncLock as unknown as McpEventContentSyncLockService,
  );
  return { service, prisma, effects, sports, entry, syncLock };
}

describe('McpAdminMaintenanceService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it('claims a bounded event-only recovery batch and deletes only the synchronized generation', async () => {
    const { service, prisma, effects, sports, entry } = context();
    const leaseUntil = new Date(Date.now() + 60_000);

    await service.flush();

    expect(prisma.mcpEventContentSync.findMany).toHaveBeenCalledWith({
      where: { OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
      orderBy: [{ leaseUntil: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }, { eventId: 'asc' }],
      take: 20,
    });
    expect(prisma.mcpEventContentSync.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        eventId: entry.eventId,
        revision: entry.revision,
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
      },
      data: { leaseUntil },
    });
    expect(effects.syncEventContent).toHaveBeenCalledWith(entry.eventId);
    expect(sports.publishForBackingEvent).toHaveBeenCalledWith(entry.eventId, { syncBackingResources: false });
    expect(prisma.mcpEventContentSync.deleteMany).toHaveBeenCalledWith({
      where: { eventId: entry.eventId, revision: entry.revision, leaseUntil },
    });
    expect(prisma.mcpEventContentSync.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.mcpAdminDelegation.findMany).not.toHaveBeenCalled();
  });

  it('does not synchronize or delete work whose lease was claimed concurrently', async () => {
    const { service, prisma, effects, sports } = context();
    prisma.mcpEventContentSync.updateMany.mockResolvedValue({ count: 0 });

    await service.flush();

    expect(effects.syncEventContent).not.toHaveBeenCalled();
    expect(sports.publishForBackingEvent).not.toHaveBeenCalled();
    expect(prisma.mcpEventContentSync.deleteMany).not.toHaveBeenCalled();
    expect(prisma.mcpEventContentSync.updateMany).toHaveBeenCalledTimes(1);
  });

  it('limits foreground approval recovery to the approved event', async () => {
    const { service, prisma, entry, effects } = context();

    await service.flush(entry.eventId);

    expect(prisma.mcpEventContentSync.findMany).toHaveBeenCalledWith({
      where: { eventId: entry.eventId, OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }] },
      orderBy: [{ leaseUntil: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }, { eventId: 'asc' }],
      take: 1,
    });
    expect(effects.syncEventContent).toHaveBeenCalledWith(entry.eventId);
  });

  it.each(['projection', 'realtime'])(
    'keeps work pending with a retry delay after a transient %s failure',
    async (stage) => {
      const { service, prisma, effects, sports } = context();
      const failure = new Error('Temporary synchronization error');
      if (stage === 'projection') effects.syncEventContent.mockRejectedValueOnce(failure);
      if (stage === 'realtime') sports.publishForBackingEvent.mockRejectedValueOnce(failure);

      await expect(service.flush()).resolves.toBeUndefined();

      expect(prisma.mcpEventContentSync.deleteMany).not.toHaveBeenCalled();
      expect(prisma.mcpEventContentSync.updateMany).toHaveBeenCalledTimes(1);
      if (stage === 'projection') expect(sports.publishForBackingEvent).not.toHaveBeenCalled();

      jest.advanceTimersByTime(60_000);
      await service.flush();

      expect(prisma.mcpEventContentSync.deleteMany).toHaveBeenCalledTimes(1);
      expect(effects.syncEventContent).toHaveBeenCalledTimes(2);
    },
  );

  it('uses revision CAS so completing older recovery cannot delete a newer approved edit', async () => {
    const { service, prisma, effects, entry } = context();
    let pendingRevision: number | null = entry.revision;
    effects.syncEventContent.mockImplementation(async () => {
      pendingRevision = entry.revision + 1;
    });
    prisma.mcpEventContentSync.deleteMany.mockImplementation(
      async (args: { where: { eventId: string; revision: number; leaseUntil: Date } }) => {
        if (args.where.revision !== pendingRevision) return { count: 0 };
        pendingRevision = null;
        return { count: 1 };
      },
    );

    await service.flush();

    expect(pendingRevision).toBe(entry.revision + 1);
    expect(prisma.mcpEventContentSync.deleteMany).toHaveBeenCalledWith({
      where: { eventId: entry.eventId, revision: entry.revision, leaseUntil: new Date(Date.now() + 60_000) },
    });
  });

  it('prunes bounded personal evidence after 90 days without deleting event recovery work', async () => {
    const { service, prisma, effects, entry } = context();
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000);

    await service.prune();

    expect(prisma.mcpAdminOperationLog.findMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
    });
    expect(prisma.mcpAdminOperationLog.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-log'] }, createdAt: { lt: cutoff } },
    });
    expect(prisma.mcpAdminDelegation.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['expired-delegation'] }, expiresAt: { lt: cutoff } },
    });
    expect(prisma.mcpEventContentSync.deleteMany).not.toHaveBeenCalled();

    // Recovery has only an event identifier and still runs after personal rows are pruned.
    await service.flush();
    expect(effects.syncEventContent).toHaveBeenCalledWith(entry.eventId);
  });
});
