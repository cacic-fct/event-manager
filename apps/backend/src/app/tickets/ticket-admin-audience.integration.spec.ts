import { ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { audienceContext, EventAudiencePrincipal } from '../audiences/audience-context';
import { TicketsResolver } from './tickets.resolver';

const context = { req: { user: { sub: 'manager' } } } as never;
const calls: Array<[string, (resolver: TicketsResolver) => Promise<unknown>]> = [
  ['event configuration read', (resolver) => resolver.adminTicketConfigs('event', undefined, context)],
  ['major-event configuration read', (resolver) => resolver.adminTicketConfigs(undefined, 'major', context)],
  ['configuration save', (resolver) => resolver.saveTicketConfig({ eventId: 'event' } as never, context)],
  ['eligibility warnings', (resolver) => resolver.adminTicketEligibilityWarnings('event', 'person', context)],
  ['holder list', (resolver) => resolver.adminEventTickets('event', undefined, undefined, undefined, undefined, context)],
  ['manual issue', (resolver) => resolver.adminIssueTicket({ eventId: 'event', personId: 'person', reason: 'Emissão manual' }, context)],
  ['revoke', (resolver) => resolver.adminRevokeTicket({ ticketId: 'ticket', reason: 'Correção administrativa' }, context)],
  ['admin transfer', (resolver) => resolver.adminStartTicketTransfer({ ticketId: 'ticket', recipientPersonId: 'person', reason: 'Transferência administrativa' }, context)],
  ['transfer trail', (resolver) => resolver.adminTicketHistory('ticket', context)],
];

describe('ticket administrator audience boundaries', () => {
  it.each(calls)('checks %s against the real request principal before any privileged write', async (_label, call) => {
    const observed: Array<EventAudiencePrincipal | undefined> = [];
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue({ id: 'event', name: 'Evento', majorEventId: null, eventGroup: null }) },
      majorEvent: { findUnique: jest.fn().mockResolvedValue({ id: 'major' }) },
      ticketConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      eventTicket: { findUnique: jest.fn().mockResolvedValue({ id: 'ticket', eventId: 'event', event: { name: 'Evento' } }) },
      $transaction: jest.fn(),
    };
    const authorization = {
      evaluatePermissions: jest.fn().mockResolvedValue([Permission.Ticket.Issue, Permission.TicketTransfer.Manage]),
      assertPermissions: jest.fn().mockImplementation(async () => {
        observed.push(audienceContext.getStore());
        throw new ForbiddenException('Outside event audience');
      }),
    };
    const resolver = new TicketsResolver(prisma as never, authorization as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const principal: EventAudiencePrincipal = { userId: 'manager', personIds: ['manager-person'], isUnesp: false, verifiedCourseCode: null, bypass: false };
    await expect(audienceContext.run(principal, () => call(resolver))).rejects.toThrow(ForbiddenException);
    expect(observed.length).toBeGreaterThan(0);
    for (const current of observed) {
      expect(current?.bypass).toBe(false);
      expect(current?.userId).toBe('manager');
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});


describe('admin ticket status filtering', () => {
  it.each(['ACTIVE', 'UNAVAILABLE'])('uses the same effective %s state for rows and totals', async (status) => {
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue({ id: 'event' }) },
      eventTicket: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const resolver = new TicketsResolver(prisma as never, authorization as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    await resolver.adminEventTickets('event', status, undefined, 50, undefined, context);
    const rowWhere = prisma.eventTicket.findMany.mock.calls[0][0].where;
    expect(rowWhere).toEqual({ eventId: 'event', status: 'ACTIVE', expiresAt: { gt: expect.any(Date) }, ticketConfig: { enabled: status === 'ACTIVE' } });
    expect(prisma.eventTicket.count).toHaveBeenCalledWith({ where: rowWhere });
  });
});
