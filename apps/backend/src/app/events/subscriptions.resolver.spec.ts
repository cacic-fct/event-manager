import { Permission, getPermissionIncludedDataSummary } from '@cacic-fct/shared-permissions';
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
});
