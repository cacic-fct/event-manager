import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuditLogOperation, Prisma, SubscriptionStatus } from '@prisma/client';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { CurrentUserMajorEventSubscriptionsResolver } from './subscriptions.resolver';
import {
  createPublicEventRecord,
  createPublicMajorEventRecord,
} from '../../public-events/testing/public-event-record.fixtures';
import { RATE_LIMIT_METADATA_KEY } from '../../rate-limit/rate-limit.decorator';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';

describe('CurrentUserMajorEventSubscriptionsResolver', () => {
  it('declares the mutation rate-limit guard and resource identity metadata', () => {
    const handler = CurrentUserMajorEventSubscriptionsResolver.prototype.upsertCurrentUserMajorEventSubscription;

    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([RateLimitGuard]);
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, handler)).toEqual({
      policy: RATE_LIMIT_POLICIES.majorEventSubscription,
      resources: [{ source: 'args', path: 'input.majorEventId' }],
    });
  });

  it('returns no subscriptions or feed items when the authenticated user has no local person projection', async () => {
    const harness = createHarness();
    harness.currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: null });

    await expect(harness.resolver.currentUserMajorEventSubscriptions({ req: {} } as never)).resolves.toEqual([]);
    await expect(harness.resolver.currentUserMajorEventFeed({ req: {} } as never)).resolves.toEqual([]);
    await expect(
      harness.resolver.currentUserMajorEventSubscription('major-1', { req: {} } as never),
    ).resolves.toBeNull();

    expect(harness.publicEvents.hasPaymentInfoTable).not.toHaveBeenCalled();
    expect(harness.prisma.majorEventSubscription.findMany).not.toHaveBeenCalled();
    expect(harness.prisma.majorEventSubscription.findFirst).not.toHaveBeenCalled();
  });

  it('maps the current-user major-event subscription list without adding private persistence fields', async () => {
    const harness = createHarness();
    const event = eventRecord('event-1');
    const majorEvent = majorEventRecord();
    const publicMajorEvent = { id: 'major-1', name: 'Major event' };
    const subscription = subscriptionRecord(majorEvent);
    harness.currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
    harness.publicEvents.hasPaymentInfoTable.mockResolvedValue(true);
    harness.prisma.majorEventSubscription.findMany.mockResolvedValue([subscription]);
    harness.majorEventSubscriptions.getSelectedEventsByMajorEvent.mockResolvedValue(
      new Map([['major-1', [event]]]),
    );
    harness.mapper.mapPublicMajorEvent.mockReturnValue(publicMajorEvent);

    await expect(harness.resolver.currentUserMajorEventSubscriptions({ req: {} } as never)).resolves.toEqual([
      {
        id: 'subscription-1',
        majorEventId: 'major-1',
        majorEvent: publicMajorEvent,
        subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
        amountPaid: 2500,
        paymentDate: subscription.paymentDate,
        paymentTier: 'student',
        imageLicenseAgreementAccepted: false,
        selectedEvents: [event],
        notSubscribedEvents: [],
      },
    ]);

    expect(harness.publicEvents.getMajorEventSubscriptionSelect).toHaveBeenCalledWith(true);
    expect(harness.majorEventSubscriptions.getSelectedEventsByMajorEvent).toHaveBeenCalledWith(
      'person-1',
      ['major-1'],
    );
  });

  it('returns an empty list when the person has no active major-event subscriptions', async () => {
    const harness = createHarness();
    harness.currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
    harness.publicEvents.hasPaymentInfoTable.mockResolvedValue(false);
    harness.prisma.majorEventSubscription.findMany.mockResolvedValue([]);

    await expect(harness.resolver.currentUserMajorEventSubscriptions({ request: {} } as never)).resolves.toEqual([]);

    expect(harness.majorEventSubscriptions.getSelectedEventsByMajorEvent).not.toHaveBeenCalled();
  });

  it('delegates the current-user major-event feed with the person id and schema capability flag', async () => {
    const harness = createHarness();
    const feed = [{ id: 'major-1', majorEventId: 'major-1', selectedEvents: [], notSubscribedEvents: [] }];
    harness.currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
    harness.publicEvents.hasPaymentInfoTable.mockResolvedValue(false);
    harness.majorEventSubscriptions.getCurrentUserMajorEventFeedItems.mockResolvedValue(feed);

    await expect(harness.resolver.currentUserMajorEventFeed({ req: {} } as never)).resolves.toBe(feed);

    expect(harness.majorEventSubscriptions.getCurrentUserMajorEventFeedItems).toHaveBeenCalledWith('person-1', false);
  });

  it('maps a current-user major-event subscription and selected-event projections', async () => {
    const harness = createHarness();
    const majorEvent = majorEventRecord();
    const subscription = subscriptionRecord(majorEvent);
    const selectedEvents = [eventRecord('event-1')];
    const notSubscribedEvents = [eventRecord('event-2')];
    const publicMajorEvent = { id: 'major-1', name: 'Major event' };
    harness.currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
    harness.publicEvents.hasPaymentInfoTable.mockResolvedValue(false);
    harness.prisma.majorEventSubscription.findFirst.mockResolvedValue(subscription);
    harness.majorEventSubscriptions.getMajorEventSubscriptionEvents.mockResolvedValue({
      selectedEvents,
      notSubscribedEvents,
    });
    harness.mapper.mapPublicMajorEvent.mockReturnValue(publicMajorEvent);

    await expect(
      harness.resolver.currentUserMajorEventSubscription('major-1', { request: {} } as never),
    ).resolves.toEqual({
      id: 'subscription-1',
      majorEventId: 'major-1',
      majorEvent: publicMajorEvent,
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      amountPaid: 2500,
      paymentDate: subscription.paymentDate,
      paymentTier: 'student',
      imageLicenseAgreementAccepted: false,
      selectedEvents,
      notSubscribedEvents,
    });

    expect(harness.majorEventSubscriptions.getMajorEventSubscriptionEvents).toHaveBeenCalledWith(
      'person-1',
      'major-1',
    );
  });

  it('returns null for a public major event with no current-user subscription', async () => {
    const harness = createHarness();
    harness.currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
    harness.publicEvents.hasPaymentInfoTable.mockResolvedValue(false);
    harness.prisma.majorEventSubscription.findFirst.mockResolvedValue(null);
    harness.publicEvents.requirePublicMajorEvent.mockResolvedValue({ id: 'major-1' });

    await expect(
      harness.resolver.currentUserMajorEventSubscription('major-1', { req: {} } as never),
    ).resolves.toBeNull();

    expect(harness.publicEvents.requirePublicMajorEvent).toHaveBeenCalledWith('major-1');
  });

  it('propagates current-user query failures without leaking a fallback subscription', async () => {
    const harness = createHarness();
    const failure = new Error('Major-event query failed.');
    harness.currentUserContext.resolveCurrentUserContext.mockRejectedValue(failure);

    await expect(harness.resolver.currentUserMajorEventFeed({ req: {} } as never)).rejects.toBe(failure);
  });

  it('rejects a regular upsert with no selected events before mutating persistence', async () => {
    const harness = createHarness();
    harness.publicEvents.hasPaymentInfoTable.mockResolvedValue(false);
    harness.prisma.majorEvent.findFirst.mockResolvedValue(majorEventRecord());
    harness.majorEventSubscriptions.normalizeSelectedEventIds.mockReturnValue([]);

    await expect(
      harness.resolver.upsertCurrentUserMajorEventSubscription(
        { majorEventId: 'major-1', selectedEventIds: [] },
        { req: {} } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.frozenResources.assertMajorEventMutable).toHaveBeenCalledWith(
      'major-1',
      harness.user,
      'edit',
    );
    expect(harness.prisma.majorEvent.findFirst).toHaveBeenCalled();
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows image consent after registration closes and before the event ends without changing registration', async () => {
    const harness = createHarness();
    const majorEvent = majorEventRecord({
      requiresImageLicenseAgreement: true,
      subscriptionEndDate: new Date(publicFixtureDateFromNow(-1)),
    });
    const acceptedSubscription = subscriptionRecord(majorEvent, {
      imageLicenseAgreementAccepted: true,
      paymentTier: 'student',
      amountPaid: 2500,
    });
    const tx = {
      majorEvent: { findFirst: jest.fn().mockResolvedValue(majorEvent) },
      majorEventSubscription: {
        findFirst: jest.fn().mockResolvedValue({ id: 'subscription-1' }),
        update: jest.fn().mockResolvedValue(acceptedSubscription),
      },
    };
    const selectedEvents = [eventRecord('original-event')];
    harness.publicEvents.hasPaymentInfoTable.mockResolvedValue(false);
    harness.prisma.majorEvent.findFirst.mockResolvedValue(majorEvent);
    harness.prisma.$transaction.mockImplementation((operation: (transaction: unknown) => Promise<unknown>) =>
      operation(tx),
    );
    harness.majorEventSubscriptions.getMajorEventSubscriptionEvents.mockResolvedValue({
      selectedEvents,
      notSubscribedEvents: [],
    });
    harness.mapper.mapPublicMajorEvent.mockReturnValue({ id: 'major-1', name: 'Major event' });

    await expect(
      harness.resolver.upsertCurrentUserMajorEventSubscription(
        {
          majorEventId: 'major-1',
          selectedEventIds: ['attacker-event'],
          paymentTier: 'attacker-tier',
          desiredCourses: 9,
          desiredLectures: 8,
          desiredUncategorized: 7,
          imageLicenseAgreementAccepted: true,
        },
        { req: {} } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        paymentTier: 'student',
        amountPaid: 2500,
        imageLicenseAgreementAccepted: true,
        selectedEvents,
      }),
    );

    expect(tx.majorEventSubscription.update).toHaveBeenCalledWith({
      where: { id: 'subscription-1' },
      data: { imageLicenseAgreementAccepted: true },
      select: 'subscription-select',
    });
    expect(harness.prisma.event.findMany).not.toHaveBeenCalled();
    expect(harness.majorEventSubscriptions.resolveSelfServicePayment).not.toHaveBeenCalled();
    expect(harness.eventForms.submitSubscriptionFlowResponses).not.toHaveBeenCalled();
  });

  it('maps a successful self-service upsert, records the actor, and emits form deltas', async () => {
    const harness = createHarness();
    const majorEvent = majorEventRecord();
    const selectedEvent = eventRecord('event-1');
    const updatedSubscription = {
      ...subscriptionRecord(majorEvent),
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
    };
    const tx = createUpsertTransaction(majorEvent, selectedEvent, updatedSubscription);
    harness.currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    harness.publicEvents.hasPaymentInfoTable.mockResolvedValue(false);
    harness.prisma.majorEvent.findFirst.mockResolvedValue(majorEvent);
    harness.prisma.majorEventSubscription.findFirst.mockResolvedValue(null);
    harness.prisma.event.findMany
      .mockResolvedValueOnce([selectedEvent])
      .mockResolvedValueOnce([]);
    harness.prisma.$transaction.mockImplementation((operation: (transaction: unknown) => Promise<unknown>) =>
      operation(tx),
    );
    harness.mapper.mapPublicMajorEvent.mockReturnValue({ id: 'major-1', name: 'Major event' });
    harness.mapper.mapPublicEvent.mockImplementation((event: { id: string }) => ({ id: event.id }));

    await expect(
      harness.resolver.upsertCurrentUserMajorEventSubscription(
        { majorEventId: 'major-1', selectedEventIds: ['event-1'] },
        { req: {} } as never,
      ),
    ).resolves.toEqual({
      id: 'subscription-1',
      majorEventId: 'major-1',
      majorEvent: { id: 'major-1', name: 'Major event' },
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
      amountPaid: 2500,
      paymentDate: updatedSubscription.paymentDate,
      paymentTier: 'student',
      imageLicenseAgreementAccepted: false,
      selectedEvents: [{ id: 'event-1' }],
      notSubscribedEvents: [],
    });

    expect(harness.auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: harness.user,
        operation: AuditLogOperation.USER_CREATE,
        entityId: 'subscription-1',
      }),
      tx,
    );
    expect(harness.eventForms.submitSubscriptionFlowResponses).toHaveBeenCalledWith(
      tx,
      'person-1',
      undefined,
      expect.objectContaining({ majorEventId: 'major-1' }),
      harness.user,
    );
    expect(harness.eventForms.emitResultsDeltas).toHaveBeenCalledWith([]);
    expect(harness.attendanceCategories.refreshForMajorEventPerson).toHaveBeenCalledWith(
      'major-1',
      'person-1',
      tx,
    );
  });

  it('returns the active winner when the major-subscription unique index rejects a concurrent create', async () => {
    const harness = createHarness();
    const majorEvent = majorEventRecord();
    const selectedEvent = eventRecord('event-1');
    const winner = {
      id: 'subscription-1',
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      imageLicenseAgreementAccepted: false,
      amountPaid: null,
      paymentTier: null,
      selectedEvents: [],
      sportsTournamentParticipants: [],
    };
    const updatedSubscription = { ...subscriptionRecord(majorEvent), ...winner };
    const losingTx = createUpsertTransaction(majorEvent, selectedEvent, updatedSubscription);
    const winningTx = createUpsertTransaction(majorEvent, selectedEvent, updatedSubscription);
    winningTx.majorEventSubscription.findFirst.mockReset();
    winningTx.majorEventSubscription.findFirst
      .mockResolvedValueOnce(winner)
      .mockResolvedValueOnce(winner)
      .mockResolvedValueOnce(updatedSubscription)
      .mockResolvedValueOnce({ id: 'subscription-1', subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD })
      .mockResolvedValueOnce(updatedSubscription);
    losingTx.majorEventSubscription.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.9.1',
      }),
    );
    harness.currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    harness.publicEvents.hasPaymentInfoTable.mockResolvedValue(false);
    harness.prisma.majorEvent.findFirst.mockResolvedValue(majorEvent);
    harness.prisma.event.findMany.mockResolvedValueOnce([selectedEvent]).mockResolvedValueOnce([]);
    harness.prisma.$transaction
      .mockImplementationOnce((operation: (transaction: unknown) => Promise<unknown>) => operation(losingTx))
      .mockImplementationOnce((operation: (transaction: unknown) => Promise<unknown>) => operation(winningTx));
    harness.mapper.mapPublicMajorEvent.mockReturnValue({ id: 'major-1', name: 'Major event' });
    harness.mapper.mapPublicEvent.mockImplementation((event: { id: string }) => ({ id: event.id }));

    await expect(
      harness.resolver.upsertCurrentUserMajorEventSubscription(
        { majorEventId: 'major-1', selectedEventIds: ['event-1'] },
        { req: {} } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'subscription-1' }));
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(winningTx.majorEventSubscription.create).not.toHaveBeenCalled();
  });

  it('maps missing major-event and image-license validation failures before transaction work', async () => {
    const harness = createHarness();
    harness.prisma.majorEvent.findFirst.mockResolvedValue(null);

    await expect(
      harness.resolver.upsertCurrentUserMajorEventSubscription(
        { majorEventId: 'missing-major', selectedEventIds: ['event-1'] },
        { req: {} } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();

    harness.prisma.majorEvent.findFirst.mockResolvedValue(
      majorEventRecord({ requiresImageLicenseAgreement: true }),
    );
    await expect(
      harness.resolver.upsertCurrentUserMajorEventSubscription(
        { majorEventId: 'major-1', selectedEventIds: ['event-1'] },
        { req: {} } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechecks publication and registration invariants inside the serializable transaction', async () => {
    const harness = createHarness();
    const majorEvent = majorEventRecord();
    const selectedEvent = eventRecord('event-1');
    const tx = createUpsertTransaction(majorEvent, selectedEvent, subscriptionRecord(majorEvent));
    tx.majorEvent.findFirst.mockResolvedValue(null);
    harness.currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    harness.publicEvents.hasPaymentInfoTable.mockResolvedValue(false);
    harness.prisma.majorEvent.findFirst.mockResolvedValue(majorEvent);
    harness.prisma.event.findMany.mockResolvedValueOnce([selectedEvent]).mockResolvedValueOnce([]);
    harness.prisma.$transaction.mockImplementation((operation: (transaction: unknown) => Promise<unknown>) =>
      operation(tx),
    );

    await expect(
      harness.resolver.upsertCurrentUserMajorEventSubscription(
        { majorEventId: 'major-1', selectedEventIds: ['event-1'] },
        { req: {} } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.majorEventSubscription.create).not.toHaveBeenCalled();
  });

});

function createHarness() {
  const user = { sub: 'user-1' };
  const currentUserContext = {
    getAuthenticatedUser: jest.fn().mockReturnValue(user),
    resolveCurrentUserContext: jest.fn().mockResolvedValue({ person: { id: 'person-1' } }),
    requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }),
  };
  const mapper = {
    mapPublicMajorEvent: jest.fn(),
    mapPublicEvent: jest.fn(),
  };
  const publicEvents = {
    hasPaymentInfoTable: jest.fn(),
    getMajorEventSelect: jest.fn().mockReturnValue('major-event-select'),
    getMajorEventSubscriptionSelect: jest.fn().mockReturnValue('subscription-select'),
    requirePublicMajorEvent: jest.fn(),
  };
  const majorEventSubscriptions = {
    getSelectedEventsByMajorEvent: jest.fn(),
    getCurrentUserMajorEventFeedItems: jest.fn(),
    getMajorEventSubscriptionEvents: jest.fn(),
    getSelectedEventsForMajorEventSubscription: jest.fn(),
    normalizeSelectedEventIds: jest.fn((ids: readonly string[]) => [...new Set(ids)]),
    ensureMajorEventSubscriptionWindowOpen: jest.fn(),
    ensureMajorEventEventLimits: jest.fn(),
    ensureMajorEventScheduleHasNoConflicts: jest.fn(),
    ensureEventGroupsAreFullySelected: jest.fn(),
    resolveRankedDesiredCounts: jest.fn(),
    resolveSelfServicePayment: jest.fn().mockReturnValue({ amountPaid: null, paymentTier: null }),
    resolveNextSubscriptionStatus: jest.fn().mockReturnValue(undefined),
    refreshEventSubscriptionCounters: jest.fn().mockResolvedValue(undefined),
  };
  const attendanceCategories = {
    refreshForMajorEventPerson: jest.fn().mockResolvedValue(undefined),
  };
  const frozenResources = {
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const auditLog = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const eventForms = {
    archiveResponsesForSubscriptionScope: jest.fn().mockResolvedValue([]),
    submitSubscriptionFlowResponses: jest.fn().mockResolvedValue([]),
    emitResultsDeltas: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    majorEvent: { findFirst: jest.fn() },
    majorEventSubscription: { findMany: jest.fn(), findFirst: jest.fn() },
    event: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const resolver = new CurrentUserMajorEventSubscriptionsResolver(
    prisma as never,
    currentUserContext as never,
    mapper as never,
    publicEvents as never,
    majorEventSubscriptions as never,
    attendanceCategories as never,
    frozenResources as never,
    auditLog as never,
    eventForms as never,
  );

  return {
    resolver,
    user,
    prisma,
    currentUserContext,
    mapper,
    publicEvents,
    majorEventSubscriptions,
    attendanceCategories,
    frozenResources,
    auditLog,
    eventForms,
  };
}

function majorEventRecord(overrides: Record<string, unknown> = {}) {
  return createPublicMajorEventRecord({
    startDate: new Date(publicFixtureDateFromNow()),
    endDate: new Date(publicFixtureDateFromNow(1)),
    ...overrides,
  });
}

function eventRecord(id: string) {
  return createPublicEventRecord({
    id,
    startDate: new Date(publicFixtureDateFromNow(2)),
    endDate: new Date(publicFixtureDateFromNow(3)),
  });
}

function subscriptionRecord(majorEvent: ReturnType<typeof majorEventRecord>, overrides: Record<string, unknown> = {}) {
  return {
    id: 'subscription-1',
    majorEventId: 'major-1',
    personId: 'person-1',
    subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
    amountPaid: 2500,
    paymentDate: new Date(publicFixtureDateFromNow(-2)),
    paymentTier: 'student',
    imageLicenseAgreementAccepted: false,
    majorEvent,
    ...overrides,
  };
}

function createUpsertTransaction(
  majorEvent: ReturnType<typeof majorEventRecord>,
  selectedEvent: ReturnType<typeof eventRecord>,
  updatedSubscription: ReturnType<typeof subscriptionRecord>,
) {
  return {
    majorEvent: {
      findFirst: jest.fn().mockResolvedValue(majorEvent),
    },
    majorEventSubscription: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'subscription-1', subscriptionStatus: SubscriptionStatus.CONFIRMED })
        .mockResolvedValueOnce(updatedSubscription),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
    },
    majorEventSubscriptionEventSelection: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    eventSubscription: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    event: {
      findMany: jest.fn().mockResolvedValueOnce([selectedEvent]).mockResolvedValueOnce([]),
    },
  };
}
