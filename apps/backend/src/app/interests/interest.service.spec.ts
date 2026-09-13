import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { SubscriptionStatus } from '@prisma/client';
import { EventInterestsService } from './interest.service';

const fixtureNow = Date.now();

describe('EventInterestsService', () => {
  describe.each(['EVENT', 'EVENT_GROUP'] as const)('automatic registration for %s interests', (targetType) => {
    it('recognizes an activity added after the major registration without selection rows', async () => {
      const prisma = automaticInterestPrisma(targetType);

      const state = await serviceFor(prisma).getCurrentUserInterestState('person-1', targetType, 'target-1');

      expect(state.subscribed).toBe(true);
      expect(prisma.majorEventSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          majorEventId: 'major-1',
          personId: 'person-1',
          deletedAt: null,
          subscriptionStatus: { notIn: expect.arrayContaining([SubscriptionStatus.CANCELED, SubscriptionStatus.REJECTED_INVALID_RECEIPT]) },
        }),
      }));
    });

    it('rejects interest writes for an automatically registered participant', async () => {
      const prisma = automaticInterestPrisma(targetType);
      prisma.$transaction.mockImplementation((operation) => operation(prisma));

      await expect(serviceFor(prisma).setCurrentUserInterest(
        'person-1', { targetType, targetId: 'target-1' }, true,
      )).rejects.toThrow('Pessoas já inscritas não podem alterar o interesse');
      expect(prisma.eventInterest.create).not.toHaveBeenCalled();
      expect(prisma.eventInterest.update).not.toHaveBeenCalled();
    });

    it('marks automatic registrations consistently in public and admin interest lists', async () => {
      const prisma = automaticInterestPrisma(targetType);
      const service = serviceFor(prisma);

      const publicRows = await service.listCurrentUserInterests('person-1');
      const adminRows = await service.listAdminInterests({ sub: 'admin-1' } as never, { targetType, targetId: 'target-1' });

      expect(publicRows[0].isSubscribed).toBe(true);
      expect(adminRows[0].isSubscribed).toBe(true);
    });

    it('returns the existing registration when converting a retained automatic interest', async () => {
      const prisma = automaticInterestPrisma(targetType);

      await expect(serviceFor(prisma).convertInterestToSubscription(
        { sub: 'admin-1' } as never, { interestId: 'interest-1' },
      )).resolves.toEqual(expect.objectContaining({ majorEventSubscriptionId: 'major-sub-1' }));
      expect(prisma.eventSubscription.create).not.toHaveBeenCalled();
      expect(prisma.eventInterest.update).not.toHaveBeenCalled();
    });

    it('does not treat a missing active major registration as an automatic subscription', async () => {
      const prisma = automaticInterestPrisma(targetType);
      prisma.majorEventSubscription.findFirst.mockResolvedValue(null);

      const state = await serviceFor(prisma).getCurrentUserInterestState('person-1', targetType, 'target-1');

      expect(state.subscribed).toBe(false);
    });

    it('keeps unselected nonautomatic activities available for interest', async () => {
      const prisma = automaticInterestPrisma(targetType);
      prisma.event.findUnique.mockResolvedValue({ majorEventId: 'major-1', autoSubscribe: false });
      prisma.eventGroup.findUnique.mockResolvedValue({ majorEventId: 'major-1', events: [] });

      const state = await serviceFor(prisma).getCurrentUserInterestState('person-1', targetType, 'target-1');

      expect(state.subscribed).toBe(false);
      expect(prisma.majorEventSubscription.findFirst).not.toHaveBeenCalled();
    });
  });

  it('returns state needed to disable the toggle after registration', async () => {
    const prisma = createPrisma();
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1', interestEnabled: true, endDate: endDate() });
    prisma.eventInterest.findFirst.mockResolvedValue(interestRecord({ eventId: 'event-1' }));
    prisma.event.findUnique.mockResolvedValue({ majorEventId: null });
    prisma.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });

    const state = await serviceFor(prisma).getCurrentUserInterestState('person-1', 'EVENT', 'event-1');

    expect(state).toEqual(
      expect.objectContaining({
        subscribed: true,
        enabled: true,
        endsAt: endDate(),
        interest: expect.objectContaining({ eventId: 'event-1', targetType: 'EVENT' }),
      }),
    );
  });

  it('marks admin interest rows as subscribed only for the selected target', async () => {
    const prisma = createPrisma();
    prisma.eventInterest.findMany.mockResolvedValue([interestRecord({ eventId: 'event-1' })]);
    prisma.event.findUnique.mockResolvedValue({ majorEventId: null, eventGroupId: null });
    prisma.eventSubscription.findMany.mockResolvedValue([{ personId: 'person-1' }]);
    const rows = await serviceFor(prisma).listAdminInterests(
      { sub: 'admin-1' } as never,
      { targetType: 'EVENT', targetId: 'event-1' },
    );

    expect(rows[0]).toEqual(expect.objectContaining({ isSubscribed: true }));
  });

  it('treats a selected major-event activity as subscribed without treating other activities as subscribed', async () => {
    const prisma = createPrisma();
    prisma.event.findFirst.mockResolvedValue({ id: 'event-2', interestEnabled: true, endDate: endDate() });
    prisma.eventInterest.findFirst.mockResolvedValue(null);
    prisma.event.findUnique.mockResolvedValue({ majorEventId: 'major-1' });
    prisma.eventSubscription.findFirst.mockResolvedValue(null);
    prisma.majorEventSubscriptionEventSelection.findFirst.mockResolvedValue({ id: 'selection-1' });

    const state = await serviceFor(prisma).getCurrentUserInterestState('person-1', 'EVENT', 'event-2');

    expect(state.subscribed).toBe(true);
  });

  it('rejects interest changes after a target has an active subscription', async () => {
    const prisma = createPrisma();
    const tx = createPrisma();
    prisma.$transaction.mockImplementation((operation) => operation(tx));
    tx.event.findFirst.mockResolvedValue({ id: 'event-1' });
    tx.event.findUnique.mockResolvedValue({ majorEventId: null });
    tx.eventSubscription.findFirst.mockResolvedValue({ id: 'subscription-1' });

    await expect(
      serviceFor(prisma).setCurrentUserInterest('person-1', { targetType: 'EVENT', targetId: 'event-1' }, false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.eventInterest.update).not.toHaveBeenCalled();
  });

  it('rejects both setting and unsetting interest after the target ends', async () => {
    const prisma = createPrisma();
    const tx = createPrisma();
    prisma.$transaction.mockImplementation((operation) => operation(tx));
    tx.event.findFirst.mockResolvedValue({ id: 'event-1' });
    tx.event.findUnique.mockResolvedValue({ majorEventId: null });
    tx.eventInterest.findFirst.mockResolvedValue(null);
    tx.event.findFirst.mockResolvedValueOnce({ id: 'event-1' }).mockResolvedValueOnce({ id: 'event-1', endDate: new Date(fixtureNow - 86_400_000) });

    await expect(
      serviceFor(prisma).setCurrentUserInterest('person-1', { targetType: 'EVENT', targetId: 'event-1' }, true),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('publishes the existing admin subscription scope after a committed interest write', async () => {
    const prisma = createPrisma();
    const tx = createPrisma();
    prisma.$transaction.mockImplementation((operation) => operation(tx));
    tx.event.findFirst
      .mockResolvedValueOnce({ id: 'event-1' })
      .mockResolvedValueOnce({ id: 'event-1', interestEnabled: true, endDate: endDate() });
    tx.event.findUnique.mockResolvedValue({ majorEventId: null });
    tx.eventInterest.findFirst.mockResolvedValue(null);
    tx.eventInterest.create.mockResolvedValue(interestRecord({ eventId: 'event-1' }));
    const realtime = {
      scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
      publish: jest.fn().mockResolvedValue({}),
    };
    const service = new EventInterestsService(
      prisma as never,
      { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      { assertEventGroupMutable: jest.fn().mockResolvedValue(undefined) } as never,
      realtime as never,
    );

    await service.setCurrentUserInterest('person-1', { targetType: 'EVENT', targetId: 'event-1' }, true);

    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-event-subscriptions:event-1',
      expect.objectContaining({ type: 'INTERESTS_INVALIDATED', targetId: 'event-1' }),
    );
  });

  it('converts a major-event interest through the workspace subscription flow and keeps the interest', async () => {
    const prisma = createPrisma();
    const interest = interestRecord({ majorEventId: 'major-1' });
    prisma.eventInterest.findFirst.mockResolvedValueOnce(interest);
    prisma.eventInterest.findUniqueOrThrow.mockResolvedValue(interest);
    prisma.majorEvent.findUnique.mockResolvedValue({ isPaymentRequired: true });
    prisma.majorEventSubscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'major-sub-1', subscriptionStatus: SubscriptionStatus.CONFIRMED });
    prisma.majorEventSubscriptionEventSelection = createDelegate();
    const workspaceSubscriptions = {
      createWorkspaceMajorEventSubscription: jest.fn().mockResolvedValue({ id: 'major-sub-1' }),
    };
    const service = new EventInterestsService(
      prisma as never,
      { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      workspaceSubscriptions as never,
      { assertEventGroupMutable: jest.fn().mockResolvedValue(undefined) } as never,
    );

    const result = await service.convertInterestToSubscription(
      { sub: 'admin-1' } as never,
      { interestId: 'interest-1', selectedEventIds: ['event-1'] },
    );

    expect(workspaceSubscriptions.createWorkspaceMajorEventSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        majorEventId: 'major-1',
        personId: 'person-1',
        selectedEventIds: ['event-1'],
        subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      }),
      expect.objectContaining({ req: expect.objectContaining({ user: expect.objectContaining({ sub: 'admin-1' }) }) }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        majorEventSubscriptionId: 'major-sub-1',
        interest: expect.objectContaining({ id: 'interest-1', majorEventId: 'major-1' }),
      }),
    );
  });

  it('adds an unselected activity to an existing major registration without replacing its selection', async () => {
    const prisma = createPrisma();
    const interest = interestRecord({ eventId: 'event-2' });
    prisma.eventInterest.findFirst.mockResolvedValue(interest);
    prisma.eventInterest.findUniqueOrThrow.mockResolvedValue(interest);
    prisma.event.findFirst.mockResolvedValue({ id: 'event-2', majorEventId: 'major-1', eventGroupId: null });
    prisma.event.findUnique.mockResolvedValue({ majorEventId: 'major-1' });
    prisma.eventSubscription.findFirst.mockResolvedValue(null);
    prisma.majorEventSubscriptionEventSelection.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ subscription: { id: 'major-sub-1', subscriptionStatus: SubscriptionStatus.CONFIRMED } });
    prisma.majorEventSubscription.findFirst.mockResolvedValue({
      id: 'major-sub-1',
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
    });
    prisma.majorEventSubscriptionEventSelection.findMany.mockResolvedValue([{ eventId: 'event-1' }]);
    const workspaceSubscriptions = {
      updateWorkspaceMajorEventSubscription: jest.fn().mockResolvedValue({ id: 'major-sub-1' }),
    };
    const service = new EventInterestsService(
      prisma as never,
      { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      workspaceSubscriptions as never,
      { assertEventGroupMutable: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await service.convertInterestToSubscription({ sub: 'admin-1' } as never, {
      interestId: 'interest-1',
      selectedEventIds: ['event-2'],
    });

    expect(workspaceSubscriptions.updateWorkspaceMajorEventSubscription).toHaveBeenCalledWith(
      'major-sub-1',
      expect.objectContaining({
        selectedEventIds: ['event-1', 'event-2'],
        subscriptionStatus: SubscriptionStatus.CONFIRMED,
      }),
      expect.any(Object),
    );
  });

  it('requires parent-scope permissions before creating a linked major registration', async () => {
    const prisma = createPrisma();
    const interest = interestRecord({ eventId: 'event-1' });
    prisma.eventInterest.findFirst.mockResolvedValue(interest);
    prisma.event.findUnique.mockResolvedValue({ majorEventId: 'major-1' });
    prisma.eventSubscription.findFirst.mockResolvedValue(null);
    prisma.majorEventSubscriptionEventSelection.findFirst.mockResolvedValue(null);
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1', majorEventId: 'major-1', eventGroupId: null });
    prisma.majorEventSubscription.findFirst.mockResolvedValue(null);
    const assertPermissions = jest.fn().mockImplementation(
      async (_user: unknown, permissions: readonly string[]) => {
        if (permissions.length === 3 && permissions.includes(Permission.MajorEvent.Read)) {
          throw new ForbiddenException();
        }
      },
    );
    const workspaceSubscriptions = {
      createWorkspaceMajorEventSubscription: jest.fn().mockResolvedValue({ id: 'major-sub-1' }),
    };
    const service = new EventInterestsService(
      prisma as never,
      { assertPermissions } as never,
      {} as never,
      workspaceSubscriptions as never,
      { assertEventGroupMutable: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      service.convertInterestToSubscription({ sub: 'event-admin-1' } as never, {
        interestId: 'interest-1',
        selectedEventIds: ['event-1'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(workspaceSubscriptions.createWorkspaceMajorEventSubscription).not.toHaveBeenCalled();
    expect(assertPermissions).toHaveBeenLastCalledWith(
      { sub: 'event-admin-1' },
      [Permission.Subscription.Create, Permission.Event.Read, Permission.MajorEvent.Read],
      { majorEventId: 'major-1' },
    );
  });

  it('requires parent update permission before changing an existing major registration', async () => {
    const prisma = createPrisma();
    const interest = interestRecord({ eventId: 'event-2' });
    prisma.eventInterest.findFirst.mockResolvedValue(interest);
    prisma.event.findUnique.mockResolvedValue({ majorEventId: 'major-1' });
    prisma.event.findFirst.mockResolvedValue({ id: 'event-2', majorEventId: 'major-1', eventGroupId: null });
    prisma.eventSubscription.findFirst.mockResolvedValue(null);
    prisma.majorEventSubscriptionEventSelection.findFirst.mockResolvedValue(null);
    prisma.majorEventSubscription.findFirst.mockResolvedValue({
      id: 'major-sub-1',
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
    });
    const assertPermissions = jest.fn().mockImplementation(
      async (_user: unknown, permissions: readonly string[]) => {
        if (permissions.includes(Permission.Subscription.Update)) {
          throw new ForbiddenException();
        }
      },
    );
    const workspaceSubscriptions = {
      updateWorkspaceMajorEventSubscription: jest.fn().mockResolvedValue({ id: 'major-sub-1' }),
    };
    const service = new EventInterestsService(
      prisma as never,
      { assertPermissions } as never,
      {} as never,
      workspaceSubscriptions as never,
      { assertEventGroupMutable: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      service.convertInterestToSubscription({ sub: 'event-admin-1' } as never, {
        interestId: 'interest-1',
        selectedEventIds: ['event-2'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(workspaceSubscriptions.updateWorkspaceMajorEventSubscription).not.toHaveBeenCalled();
    expect(assertPermissions).toHaveBeenLastCalledWith(
      { sub: 'event-admin-1' },
      [Permission.Subscription.Update, Permission.Event.Read, Permission.MajorEvent.Read],
      { majorEventId: 'major-1' },
    );
  });

  it('uses the admin event conversion path for a post-event grouped interest with consent and policy bypass', async () => {
    const prisma = createPrisma();
    const interest = interestRecord({ eventId: 'event-1' });
    prisma.eventInterest.findFirst.mockResolvedValue(interest);
    prisma.eventInterest.findUniqueOrThrow.mockResolvedValue(interest);
    prisma.event.findUnique.mockResolvedValue({ majorEventId: null });
    prisma.event.findFirst.mockResolvedValue({
      id: 'event-1',
      majorEventId: null,
      eventGroupId: 'group-1',
      startDate: new Date(fixtureNow - 3_600_000),
      endDate: new Date(fixtureNow - 1_800_000),
    });
    prisma.eventSubscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'event-sub-1', eventGroupSubscriptionId: 'group-sub-1' });
    const eventSubscriptions = {
      subscribeCurrentUserEvent: jest.fn().mockResolvedValue(undefined),
    };
    const frozen = {
      assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    };
    const service = new EventInterestsService(
      prisma as never,
      { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
      eventSubscriptions as never,
      {} as never,
      frozen as never,
    );
    const actor = { sub: 'admin-1' };

    await service.convertInterestToSubscription(actor as never, {
      interestId: 'interest-1',
      imageLicenseAgreementAccepted: true,
    });

    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('group-1', actor, 'edit');
    expect(eventSubscriptions.subscribeCurrentUserEvent).toHaveBeenCalledWith(
      'person-1',
      'event-1',
      actor,
      undefined,
      true,
      expect.objectContaining({
        createdByMethod: 'ADMIN_DASHBOARD',
        bypassSubscriptionPolicy: true,
      }),
    );
  });

  it('uses the admin group conversion path while preserving explicit image consent', async () => {
    const prisma = createPrisma();
    const interest = interestRecord({ eventGroupId: 'group-1' });
    prisma.eventInterest.findFirst.mockResolvedValue(interest);
    prisma.eventInterest.findUniqueOrThrow.mockResolvedValue(interest);
    prisma.eventGroup.findUnique.mockResolvedValue({ majorEventId: null });
    prisma.eventGroup.findFirst.mockResolvedValue({ majorEventId: null });
    prisma.eventGroupSubscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'group-sub-1' });
    const eventSubscriptions = {
      subscribeCurrentUserEventGroup: jest.fn().mockResolvedValue(undefined),
    };
    const frozen = {
      assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    };
    const actor = { sub: 'admin-1' };
    const service = new EventInterestsService(
      prisma as never,
      { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
      eventSubscriptions as never,
      {} as never,
      frozen as never,
    );

    await service.convertInterestToSubscription(actor as never, {
      interestId: 'interest-1',
      imageLicenseAgreementAccepted: true,
    });

    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('group-1', actor, 'edit');
    expect(eventSubscriptions.subscribeCurrentUserEventGroup).toHaveBeenCalledWith(
      'person-1',
      'group-1',
      actor,
      true,
      expect.objectContaining({ bypassSubscriptionPolicy: true }),
    );
  });
});

function serviceFor(prisma: ReturnType<typeof createPrisma>): EventInterestsService {
  return new EventInterestsService(
    prisma as never,
    { assertPermissions: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    {} as never,
    { assertEventGroupMutable: jest.fn().mockResolvedValue(undefined) } as never,
  );
}

function automaticInterestPrisma(targetType: 'EVENT' | 'EVENT_GROUP') {
  const prisma = createPrisma();
  const interest = interestRecord(targetType === 'EVENT' ? { eventId: 'target-1' } : { eventGroupId: 'target-1' });
  prisma.event.findFirst.mockResolvedValue({ id: 'target-1', interestEnabled: true, endDate: endDate() });
  prisma.event.findUnique.mockResolvedValue({ majorEventId: 'major-1', autoSubscribe: true });
  prisma.eventGroup.findFirst.mockResolvedValue({ id: 'target-1', interestEnabled: true, events: [{ endDate: endDate() }] });
  prisma.eventGroup.findUnique.mockResolvedValue({ majorEventId: 'major-1', events: [{ id: 'automatic-event' }] });
  prisma.eventInterest.findFirst.mockResolvedValue(interest);
  prisma.eventInterest.findUniqueOrThrow.mockResolvedValue(interest);
  prisma.eventInterest.findMany.mockResolvedValue([interest]);
  prisma.majorEventSubscription.findFirst.mockResolvedValue({
    id: 'major-sub-1', subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
  });
  prisma.majorEventSubscription.findMany.mockResolvedValue([{ personId: 'person-1' }]);
  return prisma;
}

function createPrisma() {
  return {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    event: createDelegate(),
    eventGroup: createDelegate(),
    majorEvent: createDelegate(),
    eventInterest: createDelegate(),
    eventSubscription: createDelegate(),
    eventGroupSubscription: createDelegate(),
    majorEventSubscription: createDelegate(),
    majorEventSubscriptionEventSelection: createDelegate(),
  };
}

function createDelegate() {
  return {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
  };
}

function interestRecord(overrides: { eventId?: string | null; eventGroupId?: string | null; majorEventId?: string | null }) {
  return {
    id: 'interest-1',
    personId: 'person-1',
    eventId: overrides.eventId ?? null,
    eventGroupId: overrides.eventGroupId ?? null,
    majorEventId: overrides.majorEventId ?? null,
    createdAt: new Date(fixtureNow - 3_600_000),
    updatedAt: new Date(fixtureNow - 3_600_000),
    createdById: 'person-1',
    person: { id: 'person-1', name: 'Pessoa', email: 'pessoa@example.com' },
  };
}

function endDate(): Date {
  return new Date(fixtureNow + 86_400_000);
}
