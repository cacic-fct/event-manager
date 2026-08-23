import { LgpdStorageCleanupService } from './lgpd-storage-cleanup.service';

describe('LgpdStorageCleanupService', () => {
  function createHarness() {
    const tx = {
      lgpdStorageCleanupOutbox: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      lgpdStorageCleanupOutbox: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const s3 = { deleteFile: jest.fn().mockResolvedValue(undefined) };
    return {
      tx,
      prisma,
      queue,
      s3,
      service: new LgpdStorageCleanupService(prisma as never, s3 as never, queue as never),
    };
  }

  it('persists one outbox row per unique object key in the caller transaction', async () => {
    const { service, tx } = createHarness();

    await service.enqueueInTransaction(tx as never, 'request-1', ['a.png', 'a.png', 'b.png']);

    expect(tx.lgpdStorageCleanupOutbox.upsert).toHaveBeenCalledTimes(2);
    expect(tx.lgpdStorageCleanupOutbox.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { requestId_objectKey: { requestId: 'request-1', objectKey: 'a.png' } },
      }),
    );
  });

  it('claims only one eligible row and deletes it idempotently', async () => {
    const { service, prisma, s3 } = createHarness();
    prisma.lgpdStorageCleanupOutbox.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.lgpdStorageCleanupOutbox.findUnique
      .mockResolvedValueOnce({ id: 'outbox-1', attempts: 1 })
      .mockResolvedValueOnce({ objectKey: 'receipt.png' });

    await service.process({ outboxId: 'outbox-1' });

    expect(s3.deleteFile).toHaveBeenCalledWith('receipt.png');
    expect(prisma.lgpdStorageCleanupOutbox.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DELETED' }) }),
    );
  });

  it('records a retry lease when storage deletion fails', async () => {
    const { service, prisma, s3 } = createHarness();
    s3.deleteFile.mockRejectedValueOnce(new Error('S3 unavailable'));
    prisma.lgpdStorageCleanupOutbox.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.lgpdStorageCleanupOutbox.findUnique
      .mockResolvedValueOnce({ id: 'outbox-1', attempts: 2 })
      .mockResolvedValueOnce({ objectKey: 'receipt.png' })
      .mockResolvedValueOnce({ status: 'PROCESSING', attempts: 2 });

    await service.process({ outboxId: 'outbox-1' });

    expect(prisma.lgpdStorageCleanupOutbox.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING', lastError: 'S3 unavailable' }),
      }),
    );
  });

  it('continues reconciling when one queue enqueue fails', async () => {
    const { service, prisma, queue } = createHarness();
    prisma.lgpdStorageCleanupOutbox.findMany.mockResolvedValueOnce([{ id: 'one' }, { id: 'two' }]);
    queue.add.mockRejectedValueOnce(new Error('Redis unavailable')).mockResolvedValueOnce(undefined);

    await expect(service.reconcile()).resolves.toBeUndefined();
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenLastCalledWith(
      'delete-object',
      { outboxId: 'two' },
      expect.not.objectContaining({ attempts: expect.anything(), backoff: expect.anything() }),
    );
  });
});
