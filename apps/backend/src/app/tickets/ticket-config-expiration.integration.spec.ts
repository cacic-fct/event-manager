import { TicketExpirationMode } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { TicketsResolver } from './tickets.resolver';

describe('ticket configuration expiry integration', () => {
  it.each([null, 25])('saves purchase limit %s and aligns active tickets in one transaction', async (purchaseLimit) => {
    const expiresAt = new Date(Date.now() + 3 * 86_400_000);
    const event = {
      id: 'event-1',
      name: 'Festa',
      emoji: '🎉',
      type: 'OTHER',
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 86_400_000),
      isPubliclyListed: false,
      publicationState: 'PUBLISHED',
      audience: 'PUBLIC',
      deletedAt: null,
      locationDescription: null,
      majorEventId: null,
      eventGroup: null,
      majorEvent: null,
    };
    const savedConfig = {
      id: 'config-1',
      eventId: event.id,
      enabled: true,
      displayName: 'Ingresso da festa',
      displayEmoji: '🎟️',
      description: null,
      transferEligibilityDescription: null,
      transferable: true,
      issueOnEventSubscription: false,
      issueOnMajorEventSubscription: false,
      includedPriceTierIds: [],
      recipientSubscriptionRequirement: 'ANY',
      recipientRequiresUnesp: false,
      recipientAcademicIdPrefixes: [],
      recipientCourseCodes: [],
      recipientRequiresAccountManagerVerification: false,
      recipientAllowedPriceTierIds: [],
      purchaseEnabled: false,
      purchaseLimit,
      purchaseRequiresUnesp: false,
      purchaseAcademicIdPrefixes: [],
      purchaseCourseCodes: [],
      purchaseRequiresAccountManagerVerification: false,
      purchaseVisiblePriceTierIds: [],
      expirationMode: TicketExpirationMode.CUSTOM,
      customExpiresAt: expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
      priceOptions: [],
      event,
    };
    const tx = {
      ticketConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: savedConfig.id }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(savedConfig),
      },
      ticketPriceOption: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      eventTicket: { findMany: jest.fn().mockResolvedValue([]) },
      ticketTransfer: { findMany: jest.fn().mockResolvedValue([]) },
      ticketEntitlementReconciliation: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: event.id,
          name: event.name,
          majorEventId: null,
          eventGroup: null,
        }),
      },
      ticketConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      priceTier: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const issuance = {
      lockEventExpirationAlignment: jest.fn().mockResolvedValue(undefined),
      alignActiveTicketExpirations: jest.fn().mockResolvedValue(0),
      enqueueExistingSubscriptionReconciliation: jest.fn().mockResolvedValue(undefined),
    };
    const realtime = { enqueueForUsers: jest.fn().mockResolvedValue(undefined) };
    const attendanceCategories = { refreshForEvent: jest.fn().mockResolvedValue(undefined) };
    const resolver = new TicketsResolver(
      prisma as never,
      authorization as never,
      audit as never,
      issuance as never,
      {} as never,
      {} as never,
      realtime as never,
      { assertEventMutable: jest.fn() } as never,
      attendanceCategories as never,
    );

    await resolver.saveTicketConfig({
      eventId: event.id,
      enabled: true,
      transferable: true,
      issueOnEventSubscription: false,
      issueOnMajorEventSubscription: false,
      includedPriceTierIds: [],
      recipientPolicy: {
        subscriptionRequirement: 'ANY',
        requiresUnesp: false,
        requiredAcademicIdPrefixes: [],
        requiredCourseCodes: [],
        requiresAccountManagerVerification: false,
        allowedPriceTierIds: [],
      },
      purchaseEnabled: false,
      purchaseLimit,
      purchaseVisibility: {
        subscriptionRequirement: 'REQUIRED',
        requiresUnesp: false,
        requiredAcademicIdPrefixes: [],
        requiredCourseCodes: [],
        requiresAccountManagerVerification: false,
        allowedPriceTierIds: [],
        requiresValidatedSubscription: true,
      },
      priceOptions: [],
      expirationMode: TicketExpirationMode.CUSTOM,
      customExpiresAt: expiresAt,
    } as never, { request: { user: { sub: 'admin-1' } } } as never);

    expect(tx.ticketConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ purchaseLimit }), update: expect.objectContaining({ purchaseLimit }),
    }));
    expect(issuance.alignActiveTicketExpirations).toHaveBeenCalledWith(tx, event.id, {
      scope: 'ALL_ACTIVE',
      actorUserId: 'admin-1',
      permission: Permission.TicketConfig.Create,
      enqueueInvalidations: false,
    });
    expect(issuance.lockEventExpirationAlignment).toHaveBeenCalledWith(tx, event.id, 'UPDATE');
    expect(issuance.lockEventExpirationAlignment.mock.invocationCallOrder[0])
      .toBeLessThan(tx.ticketConfig.upsert.mock.invocationCallOrder[0]);
    expect(tx.ticketConfig.upsert.mock.invocationCallOrder[0])
      .toBeLessThan(issuance.alignActiveTicketExpirations.mock.invocationCallOrder[0]);
    expect(attendanceCategories.refreshForEvent).toHaveBeenCalledWith(event.id, tx);
    expect(issuance.alignActiveTicketExpirations.mock.invocationCallOrder[0])
      .toBeLessThan(attendanceCategories.refreshForEvent.mock.invocationCallOrder[0]);
    expect(issuance.enqueueExistingSubscriptionReconciliation).toHaveBeenCalledWith(tx, event.id, savedConfig.updatedAt);
  });
});
