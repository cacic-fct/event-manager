import { TicketTransferResolutionService } from './ticket-transfer-resolution.service';

describe('ticket transfer resolution worker', () => {
  it('releases and retries a queued attempt when Account Manager is temporarily unavailable', async () => {
    const job = { id: 'resolution-1', transferId: 'transfer-1', attempts: 0 };
    const now = new Date();
    const transfer = {
      id: 'transfer-1',
      ticketId: 'ticket-1',
      eventId: 'event-1',
      initiatorType: 'HOLDER',
      senderStatus: 'PENDING',
      recipientStatus: 'PENDING',
      submittedDestinationIdentityDocumentEncrypted: 'encrypted-document',
      ticket: { expiresAt: new Date(now.getTime() + 60_000) },
    };
    const prisma = {
      ticketTransferResolutionOutbox: {
        findMany: jest.fn().mockResolvedValue([job]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ticketTransfer: { findUnique: jest.fn().mockResolvedValue(transfer) },
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: 'recipient-person', mergedIntoId: null }])
        .mockResolvedValueOnce([{ id: 'recipient-person' }]),
      $transaction: undefined,
      people: { findFirst: jest.fn().mockResolvedValue({ id: 'recipient-person', userId: 'recipient-user' }) },
    };
    const identities = { reveal: jest.fn().mockReturnValue('PASS-12345') };
    const eligibility = {
      prepareIdentitySnapshot: jest.fn().mockRejectedValue(new Error('Account Manager unavailable')),
    };
    const realtime = {};
    const service = new TicketTransferResolutionService(
      prisma as never,
      identities as never,
      eligibility as never,
      realtime as never,
    );

    await (service as unknown as { processPending: () => Promise<void> }).processPending();

    expect(eligibility.prepareIdentitySnapshot).toHaveBeenCalledWith('event-1', 'recipient-person', 'recipient');
    expect(prisma.ticketTransferResolutionOutbox.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.ticketTransferResolutionOutbox.updateMany.mock.calls[1][0]).toEqual(expect.objectContaining({
      where: { id: job.id, completedAt: null },
      data: expect.objectContaining({
        attempts: 1,
        leaseUntil: null,
        lastError: 'Destination resolution failed.',
        nextAttemptAt: expect.any(Date),
      }),
    }));
    expect(prisma.$transaction).toBeUndefined();
  });

  it('materializes a missing People row from one unambiguous local User document', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'recipient-user',
          name: 'Recipient Person',
          email: 'recipient@example.org',
          identityDocument: 'PASS-12345',
          academicId: '2026120001',
        }),
      },
      people: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({
          id: 'recipient-person',
          userId: 'recipient-user',
          deletedAt: null,
          mergedIntoId: null,
        }),
      },
    };
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'recipient-user' }]),
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new TicketTransferResolutionService(prisma as never, {} as never, {} as never, {} as never);
    const resolveRecipient = (service as unknown as {
      resolveRecipient: (document: string) => Promise<{ personId: string; userId: string | null } | null>;
    }).resolveRecipient.bind(service);

    await expect(resolveRecipient('PASS12345')).resolves.toEqual({
      personId: 'recipient-person',
      userId: 'recipient-user',
    });
    expect(tx.people.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { externalRef: 'kc:recipient-user' },
      create: expect.objectContaining({
        userId: 'recipient-user',
        externalRef: 'kc:recipient-user',
        identityDocument: 'PASS-12345',
      }),
    }));
    expect(tx.$executeRaw.mock.calls[0][0].values).toContain('ticket-recipient-document:PASS12345');
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.user.findUnique.mock.invocationCallOrder[0]);
    expect(tx.user.findUnique.mock.invocationCallOrder[0]).toBeLessThan(tx.$queryRaw.mock.invocationCallOrder[0]);
  });

  it('fails closed when multiple local accounts share a destination document', async () => {
    const prisma = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'user-a' }, { id: 'user-b' }]),
      $transaction: jest.fn(),
    };
    const service = new TicketTransferResolutionService(prisma as never, {} as never, {} as never, {} as never);
    const resolveRecipient = (service as unknown as {
      resolveRecipient: (document: string) => Promise<{ personId: string; userId: string | null } | null>;
    }).resolveRecipient.bind(service);

    await expect(resolveRecipient('PASS12345')).resolves.toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
