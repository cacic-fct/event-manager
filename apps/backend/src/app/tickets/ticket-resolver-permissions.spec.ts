import { Permission } from '@cacic-fct/shared-permissions';
import { TicketsResolver } from './tickets.resolver';

describe('ticket resolver permission alternatives', () => {
  it.each([Permission.Ticket.Issue, Permission.TicketTransfer.Manage])(
    'allows the eligibility preflight when the caller has %s plus person-read access',
    async (operationPermission) => {
      const authorization = {
        evaluatePermissions: jest.fn().mockResolvedValue([operationPermission]),
        assertPermissions: jest.fn().mockResolvedValue(undefined),
      };
      const eligibility = {
        evaluateManualIssueEligibility: jest.fn().mockResolvedValue({ eligible: true, warnings: [] }),
      };
      const resolver = new TicketsResolver(
        {} as never,
        authorization as never,
        {} as never,
        {} as never,
        eligibility as never,
        {} as never,
        {} as never,
        { assertEventMutable: jest.fn() } as never,
        {} as never,
      );

      await expect(resolver.adminTicketEligibilityWarnings('event-1', 'person-1', {
        request: { user: { sub: 'manager-1' } },
      } as never)).resolves.toEqual(expect.objectContaining({ eligible: true }));

      expect(authorization.evaluatePermissions).toHaveBeenCalledWith(
        { sub: 'manager-1' },
        [Permission.Ticket.Issue, Permission.TicketTransfer.Manage],
      );
      expect(authorization.assertPermissions).toHaveBeenNthCalledWith(
        1,
        { sub: 'manager-1' },
        [Permission.RelatedPerson.Read],
        { eventId: 'event-1' },
      );
      expect(authorization.assertPermissions).toHaveBeenNthCalledWith(
        2,
        { sub: 'manager-1' },
        [operationPermission],
        { eventId: 'event-1' },
      );
    },
  );
});

describe('ticket mutation frozen protection', () => {
  it.each(['configuration', 'issue', 'revoke'] as const)('blocks %s changes before writing to a frozen event', async (operation) => {
    const prisma = {
      event: { findUnique: jest.fn().mockResolvedValue({ id: 'event', majorEventId: null, eventGroup: null }) },
      ticketConfig: { findUnique: jest.fn().mockResolvedValue({ id: 'config', updatedAt: new Date() }) },
      eventTicket: { findUnique: jest.fn().mockResolvedValue({ id: 'ticket', eventId: 'event', event: { eventGroup: null } }) },
      $transaction: jest.fn(),
    };
    const authorization = { assertPermissions: jest.fn() };
    const frozenResources = { assertEventMutable: jest.fn().mockRejectedValue(new Error('Frozen')) };
    const issuance = { issueForPerson: jest.fn() };
    const resolver = new TicketsResolver(prisma as never, authorization as never, {} as never,
      issuance as never, {} as never, {} as never, {} as never, frozenResources as never, {} as never);
    const user = { sub: 'manager' };
    const context = { req: { user } } as never;
    const change = operation === 'configuration'
      ? resolver.saveTicketConfig({ eventId: 'event' } as never, context)
      : operation === 'issue'
        ? resolver.adminIssueTicket({ eventId: 'event', personId: 'person', reason: 'Correção' }, context)
        : resolver.adminRevokeTicket({ ticketId: 'ticket', reason: 'Correção' }, context);
    await expect(change).rejects.toThrow('Frozen');
    expect(frozenResources.assertEventMutable).toHaveBeenCalledWith('event', user, 'edit');
    expect(authorization.assertPermissions.mock.invocationCallOrder[0]).toBeLessThan(frozenResources.assertEventMutable.mock.invocationCallOrder[0]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(issuance.issueForPerson).not.toHaveBeenCalled();
  });
});
