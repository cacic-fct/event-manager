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
