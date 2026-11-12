import { AuditLogRetentionProcessor, AuditLogRetentionScheduler } from './audit-log.retention-job';

const { jest } = import.meta;

describe('Audit log retention', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules daily cleanup with retries', async () => {
    const queue = { upsertJobScheduler: jest.fn() };

    await new AuditLogRetentionScheduler(queue as never).onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      expect.any(String),
      { pattern: '0 4 * * *', tz: 'America/Sao_Paulo' },
      expect.objectContaining({
        name: 'delete-expired-audit-logs',
        opts: expect.objectContaining({ attempts: 3 }),
      }),
    );
  });

  it('uses the same five-year cutoff in both stores and rechecks age when deleting each batch', async () => {
    // A leap day maps to the last day of February in the cutoff year.
    jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2032, 1, 29, 7, 0, 0, 500)));
    const cutoff = new Date(Date.UTC(2027, 1, 28, 7));
    const auditLogEntry = {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'first' }])
        .mockResolvedValueOnce([{ id: 'second' }])
        .mockResolvedValueOnce([]),
      deleteMany: jest.fn(),
    };
    const search = { deleteExpiredAuditLogEntries: jest.fn() };
    const processor = new AuditLogRetentionProcessor({ auditLogEntry } as never, search as never);

    await processor.process({ name: 'delete-expired-audit-logs' } as never);

    const expired = { lastRecordedAt: { lt: cutoff } };
    expect(auditLogEntry.findMany).toHaveBeenCalledWith({
      where: expired,
      select: { id: true },
      orderBy: { lastRecordedAt: 'asc' },
      take: 1000,
    });
    expect(auditLogEntry.deleteMany.mock.calls).toEqual([
      [{ where: { ...expired, id: { in: ['first'] } } }],
      [{ where: { ...expired, id: { in: ['second'] } } }],
    ]);
    expect(search.deleteExpiredAuditLogEntries).toHaveBeenCalledWith(cutoff);
  });
});
