import { createAdminTicketConfig } from '@cacic-fct/shared-ticketing/testing';
import { TicketsResolver } from './tickets.resolver';

function setup() {
  const existing = { id: 'config', updatedAt: new Date() };
  const tx = {
    ticketConfig: { findUnique: jest.fn().mockResolvedValue(existing), upsert: jest.fn() },
    ticketPurchase: { count: jest.fn().mockResolvedValue(3) },
  };
  const prisma = {
    event: { findUnique: jest.fn().mockResolvedValue({ id: 'event', majorEventId: null, eventGroup: null }) },
    ticketConfig: { findUnique: jest.fn().mockResolvedValue(existing) },
    $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  const resolver = new TicketsResolver(
    prisma as never,
    { assertPermissions: jest.fn() } as never,
    {} as never,
    { lockEventExpirationAlignment: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const input = createAdminTicketConfig({ eventId: 'event', purchaseEnabled: false });
  const context = { req: { user: { sub: 'admin' } } } as never;
  return { resolver, input, context, tx, prisma };
}

describe('ticket purchase limit configuration', () => {
  it.each([0, -1, 1.5, 2_147_483_648, Number.NaN])('rejects invalid limit %s before writing', async (purchaseLimit) => {
    const { resolver, input, context, prisma, tx } = setup();
    await expect(resolver.saveTicketConfig({ ...input, purchaseLimit } as never, context)).rejects.toThrow('Informe uma quantidade inteira');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.ticketConfig.upsert).not.toHaveBeenCalled();
  });

  it('prevents reducing stock below approved and pending purchases', async () => {
    const { resolver, input, context, tx } = setup();
    await expect(resolver.saveTicketConfig({ ...input, purchaseLimit: 2 } as never, context)).rejects.toThrow('O limite não pode ser menor');
    expect(tx.ticketPurchase.count).toHaveBeenCalledWith({
      where: { ticketConfigId: 'config', status: { in: ['UNDER_REVIEW', 'APPROVED'] } },
    });
    expect(tx.ticketConfig.upsert).not.toHaveBeenCalled();
  });
});
