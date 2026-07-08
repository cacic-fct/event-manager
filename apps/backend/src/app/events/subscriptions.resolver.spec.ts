import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SubscriptionStatus as ContractSubscriptionStatus } from '@cacic-fct/shared-data-types';
import { Permission, getPermissionIncludedDataSummary } from '@cacic-fct/shared-permissions';
import { SubscriptionStatus } from '@prisma/client';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { EventSubscriptionsResolver } from './subscriptions.resolver';

describe('EventSubscriptionsResolver', () => {
  it('requires workflow read permissions without inheriting full person read access', () => {
    const requiredReadScopes = ['subscription#read', 'event#read', 'major-event#read'];

    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EventSubscriptionsResolver.prototype.workspaceEventSubscriptions),
    ).toEqual(requiredReadScopes);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        EventSubscriptionsResolver.prototype.workspaceMajorEventSubscriptions,
      ),
    ).toEqual(requiredReadScopes);
  });

  it('requires workflow permissions when mutation responses return contextual limited person data', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        EventSubscriptionsResolver.prototype.createWorkspaceEventSubscription,
      ),
    ).toEqual(['subscription#create', 'event#read']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        EventSubscriptionsResolver.prototype.createWorkspaceMajorEventSubscription,
      ),
    ).toEqual(['subscription#create', 'event#read', 'major-event#read']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        EventSubscriptionsResolver.prototype.updateWorkspaceMajorEventSubscription,
      ),
    ).toEqual(['subscription#update', 'event#read', 'major-event#read']);
  });

  it('documents the limited person data carried by subscription permissions', () => {
    expect(getPermissionIncludedDataSummary(Permission.Subscription.Read)).toContain(
      'Dados limitados da pessoa inscrita',
    );
    expect(getPermissionIncludedDataSummary(Permission.Subscription.Create)).toContain(
      'Identificação da pessoa inscrita',
    );
  });

  it('attaches major-event history only for selected event subscriptions', async () => {
    const createdAt = new Date('2026-06-22T12:00:00.000Z');
    const subscriptions = [
      {
        id: 'event-subscription-selected',
        eventId: 'event-selected',
        event: {
          id: 'event-selected',
          majorEventId: 'major-1',
        },
        personId: 'person-1',
        person: {
          id: 'person-1',
          name: 'Ana',
        },
        eventGroupSubscriptionId: null,
        createdAt,
        createdById: 'admin-1',
        createdByMethod: 'ADMIN_DASHBOARD',
      },
      {
        id: 'event-subscription-direct',
        eventId: 'event-direct',
        event: {
          id: 'event-direct',
          majorEventId: 'major-1',
        },
        personId: 'person-2',
        person: {
          id: 'person-2',
          name: 'Bruno',
        },
        eventGroupSubscriptionId: null,
        createdAt,
        createdById: 'admin-1',
        createdByMethod: 'ADMIN_DASHBOARD',
      },
    ];
    const prisma = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue(subscriptions),
      },
      majorEventSubscriptionEventSelection: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventId: 'event-selected',
            subscription: {
              id: 'major-subscription-1',
              majorEventId: 'major-1',
              personId: 'person-1',
            },
          },
        ]),
      },
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const resolver = new EventSubscriptionsResolver(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(resolver.workspaceEventSubscriptions('event-selected')).resolves.toEqual([
      expect.objectContaining({
        id: 'event-subscription-selected',
        majorEventSubscriptionId: 'major-subscription-1',
      }),
      expect.objectContaining({
        id: 'event-subscription-direct',
        majorEventSubscriptionId: null,
      }),
    ]);

    expect(prisma.majorEventSubscriptionEventSelection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: {
            in: ['event-selected', 'event-direct'],
          },
          subscription: expect.objectContaining({
            deletedAt: null,
            subscriptionStatus: 'CONFIRMED',
            majorEventId: {
              in: ['major-1'],
            },
            personId: {
              in: ['person-1', 'person-2'],
            },
          }),
        }),
      }),
    );
  });

  it('skips major-event history lookup when listed event subscriptions are standalone events', async () => {
    const createdAt = new Date('2026-06-22T12:00:00.000Z');
    const subscriptions = [
      {
        id: 'event-subscription-1',
        eventId: 'event-1',
        event: {
          id: 'event-1',
          majorEventId: null,
        },
        personId: 'person-1',
        person: {
          id: 'person-1',
          name: 'Ana',
        },
        eventGroupSubscriptionId: null,
        createdAt,
        createdById: 'admin-1',
        createdByMethod: 'ADMIN_DASHBOARD',
      },
    ];
    const prisma = {
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue(subscriptions),
      },
      majorEventSubscriptionEventSelection: {
        findMany: jest.fn(),
      },
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([{ personId: 'person-1' }]),
      },
    };
    const resolver = new EventSubscriptionsResolver(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(resolver.workspaceEventSubscriptions('event-1', -10, 500)).resolves.toEqual([
      expect.objectContaining({
        id: 'event-subscription-1',
        isLecturerSubscription: true,
        majorEventSubscriptionId: null,
      }),
    ]);

    expect(prisma.eventSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 500,
      }),
    );
    expect(prisma.majorEventSubscriptionEventSelection.findMany).not.toHaveBeenCalled();
    expect(prisma.eventLecturer.findMany).toHaveBeenCalledWith({
      where: {
        eventId: {
          in: ['event-1'],
        },
      },
      select: {
        personId: true,
      },
    });
  });

  it('attaches event selection and lecturer state to major-event subscriptions', async () => {
    const createdAt = new Date('2026-06-22T12:00:00.000Z');
    const subscription = {
      id: 'major-subscription-1',
      majorEventId: 'major-1',
      majorEvent: {
        id: 'major-1',
        name: 'SECOMP',
      },
      personId: 'person-1',
      person: {
        id: 'person-1',
        name: 'Ana',
      },
      subscriptionStatus: 'CONFIRMED',
      amountPaid: null,
      paymentDate: null,
      paymentTier: null,
      createdAt,
      createdById: 'admin-1',
      createdByMethod: 'ADMIN_DASHBOARD',
    };
    const prisma = {
      majorEventSubscription: {
        findMany: jest.fn().mockResolvedValue([subscription]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-1',
            name: 'Abertura',
            startDate: new Date('2026-06-23T12:00:00.000Z'),
            lecturers: [],
          },
          {
            id: 'event-2',
            name: 'Workshop',
            startDate: new Date('2026-06-24T12:00:00.000Z'),
            lecturers: [{ personId: 'person-1' }],
          },
        ]),
      },
      majorEventSubscriptionEventSelection: {
        findMany: jest.fn().mockResolvedValue([
          {
            eventId: 'event-1',
            subscription: {
              personId: 'person-1',
            },
          },
        ]),
      },
    };
    const resolver = new EventSubscriptionsResolver(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(resolver.workspaceMajorEventSubscriptions('major-1', 5, 10)).resolves.toEqual([
      expect.objectContaining({
        id: 'major-subscription-1',
        events: [
          expect.objectContaining({
            eventId: 'event-1',
            subscribed: true,
            isLecturerSubscription: false,
          }),
          expect.objectContaining({
            eventId: 'event-2',
            subscribed: false,
            isLecturerSubscription: true,
          }),
        ],
      }),
    ]);

    expect(prisma.majorEventSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 10,
      }),
    );
    expect(prisma.majorEventSubscriptionEventSelection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: {
            in: ['event-1', 'event-2'],
          },
          subscription: expect.objectContaining({
            personId: {
              in: ['person-1'],
            },
            majorEventId: 'major-1',
            deletedAt: null,
          }),
        }),
      }),
    );
  });

  it('does not load major-event events when the subscription page is empty', async () => {
    const prisma = {
      majorEventSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      event: {
        findMany: jest.fn(),
      },
      majorEventSubscriptionEventSelection: {
        findMany: jest.fn(),
      },
    };
    const resolver = new EventSubscriptionsResolver(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(resolver.workspaceMajorEventSubscriptions('major-1')).resolves.toEqual([]);

    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(prisma.majorEventSubscriptionEventSelection.findMany).not.toHaveBeenCalled();
  });

  it('creates a workspace event subscription through a serializable transaction', async () => {
    const createdAt = new Date('2026-06-22T12:00:00.000Z');
    const created = {
      id: 'event-subscription-1',
      eventId: 'event-1',
      event: {
        id: 'event-1',
        majorEventId: null,
      },
      personId: 'person-1',
      person: {
        id: 'person-1',
        name: 'Ana',
      },
      eventGroupSubscriptionId: null,
      createdAt,
      createdById: 'admin-1',
      createdByMethod: 'ADMIN_DASHBOARD',
    };
    const tx = {
      eventSubscription: {
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
      people: {
        findFirst: jest.fn().mockResolvedValue({ id: 'person-1' }),
      },
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const attendanceCategories = {
      refreshForAttendance: jest.fn().mockResolvedValue(undefined),
    };
    const frozenResources = {
      assertEventMutable: jest.fn().mockResolvedValue(undefined),
    };
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const counters = {
      refresh: jest.fn().mockResolvedValue(undefined),
    };
    const eventSubscriptionSync = {
      ensureEventIdsHaveAvailableSlots: jest.fn().mockResolvedValue(undefined),
    };
    const resolver = new EventSubscriptionsResolver(
      prisma as never,
      attendanceCategories as never,
      {} as never,
      frozenResources as never,
      auditLog as never,
      counters as never,
      eventSubscriptionSync as never,
    );
    const user = {
      sub: 'admin-1',
    };

    await expect(
      resolver.createWorkspaceEventSubscription(
        {
          eventId: 'event-1',
          personId: 'person-1',
        },
        { req: { user } } as never,
      ),
    ).resolves.toEqual({
      ...created,
      majorEventSubscriptionId: null,
      isLecturerSubscription: false,
    });

    expect(frozenResources.assertEventMutable).toHaveBeenCalledWith('event-1', user, 'edit');
    expect(eventSubscriptionSync.ensureEventIdsHaveAvailableSlots).toHaveBeenCalledWith(tx, ['event-1']);
    expect(tx.eventSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          eventId: 'event-1',
          personId: 'person-1',
          createdById: 'admin-1',
          createdByMethod: 'ADMIN_DASHBOARD',
        },
      }),
    );
    expect(attendanceCategories.refreshForAttendance).toHaveBeenCalledWith('person-1', 'event-1', tx);
    expect(counters.refresh).toHaveBeenCalledWith(tx, ['event-1']);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'event-subscription-1',
        entityLabel: 'Ana',
        after: created,
        summary: 'Inscrição em evento criada pelo painel administrativo.',
      }),
      tx,
    );
  });

  it('rejects event subscription creation without an authenticated actor id', async () => {
    const prisma = {
      people: {
        findFirst: jest.fn(),
      },
    };
    const frozenResources = {
      assertEventMutable: jest.fn().mockResolvedValue(undefined),
    };
    const resolver = new EventSubscriptionsResolver(
      prisma as never,
      {} as never,
      {} as never,
      frozenResources as never,
      {} as never,
    );

    await expect(
      resolver.createWorkspaceEventSubscription(
        {
          eventId: 'event-1',
          personId: 'person-1',
        },
        { req: { user: { permissions: [] } } } as never,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(frozenResources.assertEventMutable).toHaveBeenCalled();
    expect(prisma.people.findFirst).not.toHaveBeenCalled();
  });

  it('rejects event subscription creation when the person lectures the event', async () => {
    const prisma = {
      people: {
        findFirst: jest.fn().mockResolvedValue({ id: 'person-1' }),
      },
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([{ personId: 'person-1' }]),
      },
    };
    const frozenResources = {
      assertEventMutable: jest.fn().mockResolvedValue(undefined),
    };
    const resolver = new EventSubscriptionsResolver(
      prisma as never,
      {} as never,
      {} as never,
      frozenResources as never,
      {} as never,
    );

    await expect(
      resolver.createWorkspaceEventSubscription(
        {
          eventId: 'event-1',
          personId: 'person-1',
        },
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.eventLecturer.findMany).toHaveBeenCalledWith({
      where: {
        eventId: {
          in: ['event-1'],
        },
      },
      select: {
        personId: true,
      },
    });
  });

  it('creates a major-event subscription with normalized selected events and synchronized event subscriptions', async () => {
    const createdAt = new Date('2026-06-22T12:00:00.000Z');
    const paymentDate = new Date('2026-06-23T12:00:00.000Z');
    const majorEventSubscription = majorEventSubscriptionRecord({
      id: 'major-subscription-1',
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
      amountPaid: 1200,
      paymentDate,
      paymentTier: null,
      createdAt,
    });
    const tx = {
      majorEventSubscription: {
        create: jest.fn().mockResolvedValue(majorEventSubscription),
      },
      majorEventSubscriptionEventSelection: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([
          { eventId: 'event-1', subscription: { personId: 'person-1' } },
          { eventId: 'event-2', subscription: { personId: 'person-1' } },
        ]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue(majorEventEvents()),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
      people: {
        findFirst: jest.fn().mockResolvedValue({ id: 'person-1' }),
      },
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event-1' }, { id: 'event-2' }]),
      },
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
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
    const counters = {
      refresh: jest.fn().mockResolvedValue(undefined),
    };
    const eventSubscriptionSync = {
      syncMajorEventConfirmedSubscriptions: jest.fn().mockResolvedValue({
        activeEventIds: ['event-1'],
        archivedEventIds: [],
        createdEventIds: ['event-2'],
      }),
    };
    const resolver = new EventSubscriptionsResolver(
      prisma as never,
      attendanceCategories as never,
      {} as never,
      frozenResources as never,
      auditLog as never,
      counters as never,
      eventSubscriptionSync as never,
    );
    const user = { email: 'admin@example.com' };

    await expect(
      resolver.createWorkspaceMajorEventSubscription(
        {
          majorEventId: 'major-1',
          personId: 'person-1',
          amountPaid: 1200,
          paymentDate,
          paymentTier: '   ',
          selectedEventIds: [' event-1 ', 'event-2', 'event-1', ''],
        },
        { request: { user } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'major-subscription-1',
        events: [
          expect.objectContaining({ eventId: 'event-1', subscribed: true }),
          expect.objectContaining({ eventId: 'event-2', subscribed: true }),
        ],
      }),
    );

    expect(frozenResources.assertMajorEventMutable).toHaveBeenCalledWith('major-1', user, 'edit');
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['event-1', 'event-2'] },
          majorEventId: 'major-1',
          deletedAt: null,
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.majorEventSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          majorEventId: 'major-1',
          personId: 'person-1',
          subscriptionStatus: SubscriptionStatus.CONFIRMED,
          amountPaid: 1200,
          paymentDate,
          paymentTier: null,
          createdById: 'admin@example.com',
          createdByMethod: 'ADMIN_DASHBOARD',
        }),
      }),
    );
    expect(tx.majorEventSubscriptionEventSelection.createMany).toHaveBeenCalledWith({
      data: [
        { subscriptionId: 'major-subscription-1', eventId: 'event-1', createdById: 'admin@example.com' },
        { subscriptionId: 'major-subscription-1', eventId: 'event-2', createdById: 'admin@example.com' },
      ],
    });
    expect(eventSubscriptionSync.syncMajorEventConfirmedSubscriptions).toHaveBeenCalledWith(
      tx,
      'major-1',
      'person-1',
      ['event-1', 'event-2'],
      SubscriptionStatus.CONFIRMED,
      'admin@example.com',
    );
    expect(attendanceCategories.refreshForMajorEventPerson).toHaveBeenCalledWith('major-1', 'person-1', tx);
    expect(counters.refresh).toHaveBeenCalledWith(tx, expect.arrayContaining(['event-1', 'event-2']));
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'major-subscription-1',
        entityLabel: 'Ana',
        summary: 'Inscrição em grande evento criada pelo painel administrativo.',
        after: expect.objectContaining({
          events: expect.any(Array),
        }),
      }),
      tx,
    );
  });

  it('updates a major-event subscription, archives stale selections, and notifies on status change', async () => {
    const previousRecord = majorEventSubscriptionRecord({
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
    });
    const updatedRecord = majorEventSubscriptionRecord({
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
      amountPaid: 2500,
      paymentTier: 'Lote 2',
    });
    const tx = {
      majorEventSubscription: {
        findUnique: jest.fn().mockResolvedValue(previousRecord),
        update: jest.fn().mockResolvedValue(updatedRecord),
      },
      majorEventSubscriptionEventSelection: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ eventId: 'event-1', subscription: { personId: 'person-1' } }])
          .mockResolvedValueOnce([{ eventId: 'event-1' }, { eventId: 'event-2' }])
          .mockResolvedValueOnce([
            { eventId: 'event-2', subscription: { personId: 'person-1' } },
            { eventId: 'event-3', subscription: { personId: 'person-1' } },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      event: {
        findMany: jest.fn().mockResolvedValue(majorEventEvents(['event-1', 'event-2', 'event-3'])),
      },
    };
    const notificationRecord = {
      id: 'major-subscription-1',
      majorEventId: 'major-1',
      subscriptionStatus: SubscriptionStatus.CONFIRMED,
      receiptRejectionReason: null,
      majorEvent: { name: 'SECOMP' },
      person: {
        id: 'person-1',
        name: 'Ana',
        email: 'ana@example.com',
        phone: null,
        userId: 'user-1',
        user: { id: 'user-1', email: 'ana@example.com', name: 'Ana' },
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
      majorEventSubscription: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'major-subscription-1',
          majorEventId: 'major-1',
          personId: 'person-1',
          subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
        }),
        findUnique: jest.fn().mockResolvedValue(notificationRecord),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event-2' }, { id: 'event-3' }]),
      },
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const attendanceCategories = {
      refreshForMajorEventPerson: jest.fn().mockResolvedValue(undefined),
    };
    const notifications = {
      notifyMajorEventSubscriptionRecordChanged: jest.fn().mockResolvedValue(undefined),
    };
    const frozenResources = {
      assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
    };
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const counters = {
      refresh: jest.fn().mockResolvedValue(undefined),
    };
    const eventSubscriptionSync = {
      syncMajorEventConfirmedSubscriptions: jest.fn().mockResolvedValue({
        activeEventIds: ['event-2'],
        archivedEventIds: ['event-1'],
        createdEventIds: ['event-3'],
      }),
    };
    const resolver = new EventSubscriptionsResolver(
      prisma as never,
      attendanceCategories as never,
      notifications as never,
      frozenResources as never,
      auditLog as never,
      counters as never,
      eventSubscriptionSync as never,
    );
    const user = { sub: 'admin-1' };

    await expect(
      resolver.updateWorkspaceMajorEventSubscription(
        'major-subscription-1',
        {
          subscriptionStatus: ContractSubscriptionStatus.CONFIRMED,
          amountPaid: 2500,
          paymentTier: '  Lote 2  ',
          selectedEventIds: ['event-2', 'event-3', 'event-2'],
        },
        { req: { user } } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'major-subscription-1',
        subscriptionStatus: SubscriptionStatus.CONFIRMED,
        events: expect.arrayContaining([
          expect.objectContaining({ eventId: 'event-2', subscribed: true }),
          expect.objectContaining({ eventId: 'event-3', subscribed: true }),
        ]),
      }),
    );

    expect(frozenResources.assertMajorEventMutable).toHaveBeenCalledWith('major-1', user, 'edit');
    expect(tx.majorEventSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'major-subscription-1' },
        data: {
          subscriptionStatus: SubscriptionStatus.CONFIRMED,
          amountPaid: 2500,
          paymentTier: 'Lote 2',
        },
      }),
    );
    expect(tx.majorEventSubscriptionEventSelection.updateMany).toHaveBeenCalledWith({
      where: {
        subscriptionId: 'major-subscription-1',
        eventId: { in: ['event-1'] },
        deletedAt: null,
      },
      data: {
        deletedAt: expect.any(Date),
      },
    });
    expect(tx.majorEventSubscriptionEventSelection.createMany).toHaveBeenCalledWith({
      data: [{ subscriptionId: 'major-subscription-1', eventId: 'event-3' }],
    });
    expect(eventSubscriptionSync.syncMajorEventConfirmedSubscriptions).toHaveBeenCalledWith(
      tx,
      'major-1',
      'person-1',
      ['event-2', 'event-3'],
      SubscriptionStatus.CONFIRMED,
    );
    expect(counters.refresh).toHaveBeenNthCalledWith(
      1,
      tx,
      expect.arrayContaining(['event-1', 'event-2', 'event-3']),
    );
    expect(counters.refresh).toHaveBeenNthCalledWith(2, tx, ['event-2', 'event-3']);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'major-subscription-1',
        operation: 'UPDATE',
        before: expect.objectContaining({ subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD }),
        after: expect.objectContaining({ subscriptionStatus: SubscriptionStatus.CONFIRMED }),
        summary: 'Inscrição em grande evento atualizada.',
      }),
      tx,
    );
    expect(notifications.notifyMajorEventSubscriptionRecordChanged).toHaveBeenCalledWith(
      SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      notificationRecord,
    );
  });

  it('rejects invalid major-event subscription statuses before opening a transaction', async () => {
    const prisma = {
      $transaction: jest.fn(),
      people: {
        findFirst: jest.fn().mockResolvedValue({ id: 'person-1' }),
      },
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }),
      },
      event: {
        findMany: jest.fn(),
      },
      eventLecturer: {
        findMany: jest.fn(),
      },
    };
    const frozenResources = {
      assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
    };
    const resolver = new EventSubscriptionsResolver(
      prisma as never,
      {} as never,
      {} as never,
      frozenResources as never,
      {} as never,
    );

    await expect(
      resolver.createWorkspaceMajorEventSubscription(
        {
          majorEventId: 'major-1',
          personId: 'person-1',
          subscriptionStatus: 'NOT_A_STATUS' as never,
          selectedEventIds: [],
        },
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function majorEventSubscriptionRecord(
  overrides: {
    id?: string;
    majorEventId?: string;
    personId?: string;
    subscriptionStatus?: SubscriptionStatus;
    amountPaid?: number | null;
    paymentDate?: Date | null;
    paymentTier?: string | null;
    createdAt?: Date;
  } = {},
) {
  const createdAt = overrides.createdAt ?? new Date('2026-06-22T12:00:00.000Z');
  return {
    id: overrides.id ?? 'major-subscription-1',
    majorEventId: overrides.majorEventId ?? 'major-1',
    majorEvent: {
      id: overrides.majorEventId ?? 'major-1',
      name: 'SECOMP',
    },
    personId: overrides.personId ?? 'person-1',
    person: {
      id: overrides.personId ?? 'person-1',
      name: 'Ana',
    },
    subscriptionStatus: overrides.subscriptionStatus ?? SubscriptionStatus.CONFIRMED,
    amountPaid: overrides.amountPaid ?? null,
    paymentDate: overrides.paymentDate ?? null,
    paymentTier: overrides.paymentTier ?? null,
    createdAt,
    createdById: 'admin-1',
    createdByMethod: 'ADMIN_DASHBOARD',
  };
}

function majorEventEvents(eventIds = ['event-1', 'event-2']) {
  return eventIds.map((eventId, index) => ({
    id: eventId,
    name: `Evento ${index + 1}`,
    startDate: new Date(`2026-06-2${index + 3}T12:00:00.000Z`),
    lecturers: [],
  }));
}
