import { ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { TicketLifecycleState } from '@cacic-fct/shared-ticketing';
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
    const resolver = new TicketsResolver(prisma as never, authorization as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { assertEventMutable: jest.fn() } as never,
      {} as never,
    );
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
    const resolver = new TicketsResolver(prisma as never, authorization as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { assertEventMutable: jest.fn() } as never,
      {} as never,
    );
    await resolver.adminEventTickets('event', status, undefined, 50, undefined, context);
    const rowWhere = prisma.eventTicket.findMany.mock.calls[0][0].where;
    expect(rowWhere).toEqual(status === 'ACTIVE'
      ? {
          eventId: 'event',
          status: 'ACTIVE',
          expiresAt: { gt: expect.any(Date) },
          ticketConfig: { enabled: true },
          event: { is: { deletedAt: null } },
        }
      : {
          eventId: 'event',
          status: 'ACTIVE',
          expiresAt: { gt: expect.any(Date) },
          OR: [
            { ticketConfig: { enabled: false } },
            { event: { is: { deletedAt: { not: null } } } },
          ],
        });
    expect(prisma.eventTicket.count).toHaveBeenCalledWith({ where: rowWhere });
  });

  it('includes a soft-deleted event with enabled ticket configuration in UNAVAILABLE', async () => {
    const now = Date.now();
    const deletedAt = new Date(now - 60_000);
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue({ id: 'event' }) },
      eventTicket: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'ticket',
          eventId: 'event',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 60_000),
          holder: null,
          originalHolder: null,
          source: 'ADMIN',
          sourceKey: null,
          history: [],
          ticketConfig: {
            enabled: true,
            displayName: null,
            displayEmoji: null,
            description: null,
            transferEligibilityDescription: null,
            transferable: false,
            recipientSubscriptionRequirement: 'ANY',
            recipientRequiresUnesp: false,
            recipientAcademicIdPrefixes: [],
            recipientCourseCodes: [],
            recipientRequiresAccountManagerVerification: false,
            recipientAllowedPriceTierIds: [],
          },
          event: {
            id: 'event',
            name: 'Evento excluído',
            emoji: '🎟️',
            type: 'OTHER',
            startDate: new Date(now - 120_000),
            endDate: deletedAt,
            locationDescription: null,
            majorEventId: null,
            isPubliclyListed: false,
            publicationState: 'DRAFT',
            audience: 'PUBLIC',
            deletedAt,
          },
        }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const resolver = new TicketsResolver(
      prisma as never,
      { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { assertEventMutable: jest.fn() } as never,
      {} as never,
    );

    const result = await resolver.adminEventTickets('event', 'UNAVAILABLE', undefined, 50, undefined, context);

    expect(result.tickets[0]?.status).toBe(TicketLifecycleState.Unavailable);
    const where = prisma.eventTicket.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ event: { is: { deletedAt: { not: null } } } });
    expect(where.OR).toContainEqual({ ticketConfig: { enabled: false } });
    expect(prisma.eventTicket.count).toHaveBeenCalledWith({ where });
  });
});
