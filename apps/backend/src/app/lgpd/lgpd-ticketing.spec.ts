import { anonymizeTicketingData, collectTicketingData } from './lgpd-ticketing';

describe('ticket data lifecycle', () => {
  it('does not disclose a hidden transfer outcome or destination identity through data export', async () => {
    const tx = {
      eventTicket: { findMany: jest.fn().mockResolvedValue([]) },
      ticketTransfer: { findMany: jest.fn().mockResolvedValue([]) },
      ticketPurchase: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await collectTicketingData(tx as never, ['person'], ['user']);
    const select = tx.ticketTransfer.findMany.mock.calls[0][0].select;
    expect(select.senderStatus).toBe(true);
    expect(select).not.toHaveProperty('recipientStatus');
    expect(select).not.toHaveProperty('recipientPersonId');
    expect(select).not.toHaveProperty('ignoreReason');
    expect(select).not.toHaveProperty('submittedDestinationIdentityDocumentEncrypted');
  });

  it('removes receipt references and transfer data without deleting another holder’s ticket', async () => {
    const tx = {
      eventTicket: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), updateMany: jest.fn() },
      ticketTransfer: { findMany: jest.fn().mockResolvedValue([{ id: 'attempt' }]), updateMany: jest.fn() },
      ticketPurchase: { deleteMany: jest.fn(), updateMany: jest.fn() },
      ticketNotificationOutbox: { deleteMany: jest.fn() },
      ticketRealtimeOutbox: { deleteMany: jest.fn() },
      eventTicketHistory: { updateMany: jest.fn() },
    };
    await anonymizeTicketingData(tx as never, ['person'], ['user']);
    expect(tx.ticketTransfer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { submittedDestinationIdentityDocumentEncrypted: null } }));
    expect(tx.ticketPurchase.deleteMany).toHaveBeenCalledWith({ where: { personId: { in: ['person'] } } });
    expect(tx.eventTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { holderPersonId: { in: ['person'] }, status: 'ACTIVE' } }));
    expect(tx.eventTicket.update).not.toHaveBeenCalled();
    expect(tx.eventTicketHistory.updateMany).toHaveBeenCalledWith({ where: { actorUserId: { in: ['user'] } }, data: { actorUserId: null, actorName: 'Pessoa removida' } });
  });
});
