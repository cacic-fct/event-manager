import { assertScannerTicket } from './scanner-ticket-validation';

const ticketId = '019af432-98b0-7000-8000-000000000001';
const input = { scannerCode: `ticket:${ticketId}:holder`, personId: 'person', eventId: 'event', attendedAt: new Date() };

describe('scanner ticket binding', () => {
  it('checks the persisted ticket, event and holder under a transaction lock', async () => {
    const tx = { $queryRaw: jest.fn(), eventTicket: { findFirst: jest.fn().mockResolvedValue({ id: ticketId }) } };
    await expect(assertScannerTicket(tx as never, input)).resolves.toBeUndefined();
    expect(tx.eventTicket.findFirst).toHaveBeenCalledWith({
      where: {
        id: ticketId, eventId: 'event', holderPersonId: 'person',
        holder: { userId: 'holder', deletedAt: null, mergedIntoId: null },
        status: { in: ['ACTIVE', 'CONSUMED'] }, expiresAt: { gt: input.attendedAt },
        issuedAt: { lte: input.attendedAt },
        transfers: { none: { senderStatus: 'ACCEPTED', recipientStatus: 'ACCEPTED', acceptedAt: { gt: input.attendedAt } } },
        ticketConfig: { enabled: true }, event: { deletedAt: null },
      }, select: { id: true },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.eventTicket.findFirst.mock.invocationCallOrder[0]);
  });

  it('rejects a barcode when its ticket does not match the target event or holder', async () => {
    const tx = { $queryRaw: jest.fn(), eventTicket: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(assertScannerTicket(tx as never, input)).rejects.toThrow('Este bilhete não é válido');
  });

  it('keeps ordinary user credentials working without ticket queries', async () => {
    await expect(assertScannerTicket({} as never, { ...input, scannerCode: 'user:holder' })).resolves.toBeUndefined();
  });
});
