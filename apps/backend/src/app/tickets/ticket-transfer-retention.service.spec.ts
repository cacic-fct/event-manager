import { TicketTransferRetentionService } from './ticket-transfer-retention.service';

describe('ticket transfer document retention', () => {
  it('includes overdue unresolved requests, expires pending requests, and clears every document', async () => {
    const prisma = {
      ticketTransfer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'pending' }, { id: 'accepted' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new TicketTransferRetentionService(prisma as never);
    await service['clearExpiredDocuments']();
    const query = prisma.ticketTransfer.findMany.mock.calls[0][0];
    expect(query.where).not.toHaveProperty('OR');
    expect(query.where.event.endDate.lte.getTime()).toBeLessThan(Date.now() - 29 * 86_400_000);
    expect(prisma.ticketTransfer.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ['pending', 'accepted'] }, senderStatus: 'PENDING', recipientStatus: 'PENDING' },
      data: { senderStatus: 'EXPIRED' },
    });
    expect(prisma.ticketTransfer.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ['pending', 'accepted'] } },
      data: { submittedDestinationIdentityDocumentEncrypted: null },
    });
  });
});
