import { TicketPurchaseRetentionService } from './ticket-purchase-retention.service';

describe('ticket purchase receipt retention', () => {
  function setup() {
    const purchases = [{ id: 'purchase', objectKey: 'receipt' }];
    const prisma = { ticketPurchase: {
      findMany: jest.fn().mockResolvedValue(purchases),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    } };
    const s3 = { deleteFile: jest.fn().mockResolvedValue(undefined) };
    const service = new TicketPurchaseRetentionService(prisma as never, s3 as never);
    return { service, prisma, s3 };
  }

  it('deletes expired objects before clearing their keys, retaining purchase history', async () => {
    const { service, prisma, s3 } = setup();
    await service.clearExpiredReceipts();
    expect(prisma.ticketPurchase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { receiptExpiresAt: { lte: expect.any(Date) }, objectKey: { not: '' } }, take: 100,
    }));
    expect(s3.deleteFile).toHaveBeenCalledWith('receipt');
    expect(prisma.ticketPurchase.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'purchase', objectKey: 'receipt' }), data: { objectKey: '' },
    }));
    expect(s3.deleteFile.mock.invocationCallOrder[0]).toBeLessThan(prisma.ticketPurchase.updateMany.mock.invocationCallOrder[0]);
  });

  it('preserves keys for retry after storage failure and continues with other purchases', async () => {
    const { service, prisma, s3 } = setup();
    prisma.ticketPurchase.findMany.mockResolvedValue([{ id: 'failed', objectKey: 'failed-receipt' }, { id: 'purchase', objectKey: 'receipt' }]);
    s3.deleteFile.mockRejectedValueOnce(new Error('Unavailable'));
    await service.clearExpiredReceipts();
    expect(prisma.ticketPurchase.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.ticketPurchase.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'purchase' }) }));
  });

  it('runs at startup and stops its interval on shutdown', async () => {
    jest.useFakeTimers();
    try {
      const { service, prisma } = setup();
      service.onModuleInit();
      await Promise.resolve();
      expect(prisma.ticketPurchase.findMany).toHaveBeenCalledTimes(1);
      service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(60 * 60 * 1_000);
      expect(prisma.ticketPurchase.findMany).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
