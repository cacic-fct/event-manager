import { assertScannerTicket } from './scanner-ticket-validation';

const ticketId = '019af432-98b0-7000-8000-000000000001';
const input = { scannerCode: `ticket:${ticketId}:holder`, personId: 'person', eventId: 'event', attendedAt: new Date() };

describe('scanner ticket binding', () => {
  it('checks the persisted ticket, event and holder under a transaction lock', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      eventTicket: {
        findFirst: jest.fn().mockResolvedValue({
          holderPersonId: 'person',
          holder: { userId: 'holder', deletedAt: null, mergedIntoId: null },
          transfers: [],
        }),
      },
    };
    await expect(assertScannerTicket(tx as never, input)).resolves.toBeUndefined();
    expect(tx.eventTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: ticketId,
        eventId: 'event',
        status: { in: ['ACTIVE', 'CONSUMED'] },
        expiresAt: { gt: input.attendedAt },
        issuedAt: { lte: input.attendedAt },
        ticketConfig: { enabled: true },
        event: { deletedAt: null },
      }),
      select: {
        holderPersonId: true,
        holder: { select: { userId: true, deletedAt: true, mergedIntoId: true } },
        transfers: {
          where: {
            senderStatus: 'ACCEPTED',
            recipientStatus: 'ACCEPTED',
            acceptedAt: { gt: input.attendedAt },
          },
          select: { senderPersonId: true, senderUserId: true, acceptedAt: true },
          orderBy: { acceptedAt: 'asc' },
          take: 1,
        },
      },
    }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.eventTicket.findFirst.mock.invocationCallOrder[0]);
  });

  it('accepts the prior holder barcode when the recorded attendance predates transfer acceptance', async () => {
    const acceptedAt = new Date(input.attendedAt.getTime() + 60_000);
    const tx = {
      $queryRaw: jest.fn(),
      eventTicket: {
        findFirst: jest.fn().mockResolvedValue({
          holderPersonId: 'recipient-person',
          holder: { userId: 'recipient-user', deletedAt: null, mergedIntoId: null },
          transfers: [{ senderPersonId: 'person', senderUserId: 'holder', acceptedAt }],
        }),
      },
    };

    await expect(assertScannerTicket(tx as never, input)).resolves.toBeUndefined();
    expect(tx.eventTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: ticketId, eventId: 'event' }),
    }));
  });

  it('rejects the new holder barcode before transfer acceptance', async () => {
    const acceptedAt = new Date(input.attendedAt.getTime() + 60_000);
    const tx = {
      $queryRaw: jest.fn(),
      eventTicket: {
        findFirst: jest.fn().mockResolvedValue({
          holderPersonId: 'recipient-person',
          holder: { userId: 'recipient-user', deletedAt: null, mergedIntoId: null },
          transfers: [{ senderPersonId: 'person', senderUserId: 'holder', acceptedAt }],
        }),
      },
    };

    await expect(assertScannerTicket(tx as never, {
      ...input,
      personId: 'recipient-person',
      scannerCode: `ticket:${ticketId}:recipient-user`,
    })).rejects.toThrow('Este bilhete não é válido');
  });

  it('rejects a barcode when its ticket does not match the target event or holder', async () => {
    const tx = { $queryRaw: jest.fn(), eventTicket: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(assertScannerTicket(tx as never, input)).rejects.toThrow('Este bilhete não é válido');
  });

  it('rejects a former holder barcode whose user does not match the transfer snapshot', async () => {
    const acceptedAt = new Date(input.attendedAt.getTime() + 60_000);
    const tx = {
      $queryRaw: jest.fn(),
      eventTicket: {
        findFirst: jest.fn().mockResolvedValue({
          holderPersonId: 'recipient-person',
          holder: { userId: 'recipient-user', deletedAt: null, mergedIntoId: null },
          transfers: [{ senderPersonId: 'person', senderUserId: 'different-user', acceptedAt }],
        }),
      },
    };

    await expect(assertScannerTicket(tx as never, input)).rejects.toThrow('Este bilhete não é válido');
  });

  it('keeps ordinary user credentials working without ticket queries', async () => {
    await expect(assertScannerTicket({} as never, { ...input, scannerCode: 'user:holder' })).resolves.toBeUndefined();
  });
});
