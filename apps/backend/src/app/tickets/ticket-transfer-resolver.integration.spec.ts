import { TicketsResolver } from './tickets.resolver';
import { createTicketTransferServiceFixture } from './testing/ticket-transfer.service.fixtures';

describe('ticket transfer GraphQL mutation integration', () => {
  it('returns an author-only pending response without exposing recipient identity', async () => {
    const fixture = createTicketTransferServiceFixture();
    const resolver = new TicketsResolver(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      fixture.service,
      {} as never,
      { assertEventMutable: jest.fn() } as never,
    );

    const result = await resolver.startTicketTransfer(
      'ticket-1',
      'PASS-12345',
      { req: { user: { sub: 'sender-user' } } } as never,
    );

    expect(result).toEqual(expect.objectContaining({
      senderStatus: 'PENDING',
      recipientStatus: 'PENDING',
      recipient: null,
      submittedDestinationIdentityDocument: 'PASS-12345',
    }));
    expect(result.ticket.aztecPayload).toBeNull();
    expect(JSON.stringify(result)).not.toContain('recipient-user');
    expect(JSON.stringify(result)).not.toContain('recipient-person');
    expect(fixture.tx.ticketTransferResolutionOutbox.create).toHaveBeenCalledWith({
      data: { transferId: 'transfer-1' },
    });
  });
});
