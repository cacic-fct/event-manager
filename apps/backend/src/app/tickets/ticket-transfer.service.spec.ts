import { ConflictException, NotFoundException } from '@nestjs/common';
import { TicketTransferRecipientStatus, TicketTransferSenderStatus } from '@prisma/client';
import { mapTicketTransfer } from './ticket.mapper';
import { createTicketTransferServiceFixture } from './testing/ticket-transfer.service.fixtures';

describe('ticket transfer mutations', () => {
  it('queues identity lookup and returns a sender-safe response without inline resolution', async () => {
    const f = createTicketTransferServiceFixture();

    const result = await f.service.startForUser('ticket-1', 'PASS-12345', { sub: 'sender-user' } as never);
    const senderView = mapTicketTransfer(result, 'AUTHOR', f.service, new Date());

    expect(f.tx.ticketTransferResolutionOutbox.create).toHaveBeenCalledWith({ data: { transferId: 'transfer-1' } });
    expect(f.eligibility.prepareIdentitySnapshot).not.toHaveBeenCalled();
    expect(f.tx.people.findFirst).not.toHaveBeenCalled();
    expect(senderView.senderStatus).toBe(TicketTransferSenderStatus.PENDING);
    expect(senderView.recipientStatus).toBe(TicketTransferRecipientStatus.PENDING);
    expect(senderView.recipient).toBeNull();
    expect(senderView.submittedDestinationIdentityDocument).toBe('PASS-12345');
    expect(JSON.stringify(senderView)).not.toContain('recipient-user');
    expect(JSON.stringify(senderView)).not.toContain('recipient-person');
    const advisoryLocks = f.tx.$executeRaw.mock.calls.map(([query]) => query);
    expect(advisoryLocks.map((query) => query.values?.[0])).toEqual([
      'ticket-transfer-author:sender-user',
      'ticket-transfer:ticket-1',
    ]);
    expect(f.tx.$executeRaw.mock.invocationCallOrder[1]).toBeLessThan(f.tx.$queryRaw.mock.invocationCallOrder[0]);
    const audit = f.tx.auditLogEntry.create.mock.calls[0][0].data;
    expect(audit.before).toEqual(expect.anything());
    expect(audit.after).toEqual(expect.objectContaining({ senderStatus: TicketTransferSenderStatus.PENDING }));
  });

  it('allows immediate cancellation even while the author must wait to submit again', async () => {
    const f = createTicketTransferServiceFixture();
    f.tx.ticketTransferAuthorCooldown.upsert.mockResolvedValue({ submissionCount: 4, lastSubmittedAt: new Date() } as never);
    await f.service.cancelForUser('transfer-1', { sub: 'sender-user' } as never);
    expect(f.tx.ticketTransfer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ senderStatus: TicketTransferSenderStatus.CANCELED }),
    }));
    expect(f.tx.ticketTransferAuthorCooldown.update).not.toHaveBeenCalled();
    await expect(f.service.startForUser('ticket-1', 'PASS-12345', { sub: 'sender-user' } as never)).rejects.toThrow('Você poderá iniciar outra transferência');
    expect(f.tx.ticketTransfer.create).not.toHaveBeenCalled();
    expect(f.tx.ticketTransferAuthorCooldown.update).not.toHaveBeenCalled();
  });

  it('enforces the submission cooldown for administrative starts too', async () => {
    const f = createTicketTransferServiceFixture();
    f.tx.people.findFirst.mockResolvedValue({ id: 'recipient-person', userId: 'recipient-user', name: 'Recipient' });
    f.tx.ticketTransferAuthorCooldown.upsert.mockResolvedValue({ submissionCount: 4, lastSubmittedAt: new Date() } as never);
    await expect(f.service.startForAdmin('ticket-1', 'recipient-person', 'Authorized correction', { sub: 'admin-user' } as never)).rejects.toThrow('Você poderá iniciar outra transferência');
    expect(f.tx.ticketTransfer.create).not.toHaveBeenCalled();
  });

  it('allows a new request once the author submission cooldown ends', async () => {
    const f = createTicketTransferServiceFixture();
    f.tx.ticketTransferAuthorCooldown.upsert.mockResolvedValue({ submissionCount: 4, lastSubmittedAt: new Date(Date.now() - 11_000) } as never);
    await f.service.startForUser('ticket-1', 'PASS-12345', { sub: 'sender-user' } as never);
    expect(f.tx.ticketTransfer.create).toHaveBeenCalled();
    expect(f.tx.ticketTransferAuthorCooldown.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { submissionCount: { increment: 1 }, lastSubmittedAt: expect.any(Date) },
    }));
  });

  it('serializes cancellation against the ticket and uses a pending-state compare-and-set', async () => {
    const f = createTicketTransferServiceFixture();
    f.tx.ticketTransfer.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      f.service.cancelForUser('transfer-1', { sub: 'sender-user' } as never),
    ).rejects.toBeInstanceOf(ConflictException);

    const lockQueries = f.tx.$executeRaw.mock.calls.map(([query]) => query);
    expect(lockQueries.map((query) => query.values?.[0])).toEqual([
      'ticket-transfer-author:sender-user',
      'ticket-transfer:ticket-1',
    ]);
    expect(f.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(f.tx.ticketTransfer.findUnique.mock.invocationCallOrder[0]);
    expect(f.tx.ticketTransfer.findUnique.mock.invocationCallOrder[0]).toBeLessThan(f.tx.$executeRaw.mock.invocationCallOrder[1]);
    expect(f.tx.ticketTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'transfer-1',
        authorUserId: 'sender-user',
        senderStatus: TicketTransferSenderStatus.PENDING,
      },
      data: expect.objectContaining({ senderStatus: TicketTransferSenderStatus.CANCELED }),
    });
    expect(f.tx.eventTicketHistory.create).not.toHaveBeenCalled();
    expect(f.tx.ticketNotificationOutbox.create).not.toHaveBeenCalled();
  });

  it('does not disclose another holder ticket state when a caller submits its UUID', async () => {
    const f = createTicketTransferServiceFixture();
    f.tx.eventTicket.findUnique.mockResolvedValue({
      ...f.ticket,
      status: 'CONSUMED',
      holder: { ...f.ticket.holder, userId: 'other-user' },
    });

    await expect(f.service.startForUser('ticket-1', 'PASS-12345', { sub: 'attacker' } as never))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('sends accurate, deduplicated cancellation notices separately to admin and holder', async () => {
    const f = createTicketTransferServiceFixture();
    const adminTransfer = {
      ...f.transfer,
      authorUserId: 'admin-user',
      initiatorType: 'ADMIN',
      initiatingAdminUserId: 'admin-user',
    };
    f.tx.ticketTransfer.findUnique.mockResolvedValue(adminTransfer);
    f.tx.ticketTransfer.findUniqueOrThrow.mockResolvedValue(adminTransfer);

    await f.service.cancelForUser('transfer-1', { sub: 'admin-user' } as never);

    const notifications = f.tx.ticketNotificationOutbox.create.mock.calls.map(([call]) => call.data);
    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ notificationType: 'SENDER_CANCELED', recipientUserId: 'admin-user' }),
      expect.objectContaining({ notificationType: 'SENDER_ADMIN_CANCELED', recipientUserId: 'sender-user' }),
    ]));
    const audit = f.tx.auditLogEntry.create.mock.calls.at(-1)?.[0].data;
    expect(audit?.actorId).toBe('admin-user');
    expect(audit?.after).toEqual(expect.objectContaining({ senderStatus: TicketTransferSenderStatus.CANCELED }));
  });

  it('attributes an ignore audit to the receiving user and records its terminal reason', async () => {
    const f = createTicketTransferServiceFixture();
    const incoming = {
      ...f.transfer,
      recipientPersonId: 'recipient-person',
      recipientUserId: 'recipient-user',
      recipient: { id: 'recipient-person', name: 'Recipient Name', userId: 'recipient-user' },
    };
    f.tx.ticketTransfer.findUnique.mockResolvedValue(incoming);
    f.tx.ticketTransfer.findUniqueOrThrow.mockResolvedValue(incoming);

    await f.service.ignoreForUser('transfer-1', { sub: 'recipient-user' } as never);

    const audit = f.tx.auditLogEntry.create.mock.calls.at(-1)?.[0].data;
    expect(audit?.actorId).toBe('recipient-user');
    expect(audit?.after).toEqual(expect.objectContaining({
      recipientStatus: TicketTransferRecipientStatus.IGNORED,
      ignoreReason: 'USER_IGNORED',
    }));
  });
});
