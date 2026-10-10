import { createLgpdServiceTestContext, restoreLgpdServiceTestContext } from './lgpd.service.spec-support';

describe('interest data lifecycle', () => {
  afterEach(() => restoreLgpdServiceTestContext());

  it('exports explicit interest history separately from subscriptions', async () => {
    const { service, prisma } = createLgpdServiceTestContext();
    prisma.eventInterest.findMany.mockResolvedValue([{ id: 'interest-1', eventId: 'event-1', personId: 'source-person' }]);
    const result = await service.collectUserData({ userId: 'old-user', email: 'old@example.com' });
    expect(result.interests).toEqual({ records: [expect.objectContaining({ id: 'interest-1' })] });
    expect(prisma.eventInterest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { personId: { in: ['source-person', 'target-person'] } },
    }));
  });

  it('archives interests with the deletion request and restores only that request', async () => {
    const { service, tx } = createLgpdServiceTestContext();
    const input = { userId: 'old-user', email: 'old@example.com', requestId: 'request-1' };
    await service.scheduleDeletion(input);
    expect(tx.eventInterest.updateMany).toHaveBeenCalledWith({
      where: { personId: { in: ['source-person', 'target-person'] }, deletedAt: null },
      data: { deletedAt: expect.any(Date), lgpdDeletionRequestId: 'request-1' },
    });
    await service.cancelDeletion(input);
    expect(tx.eventInterest.updateMany).toHaveBeenLastCalledWith({
      where: { personId: { in: ['source-person', 'target-person'] }, lgpdDeletionRequestId: 'request-1' },
      data: { deletedAt: null, lgpdDeletionRequestId: null },
    });
  });
});
