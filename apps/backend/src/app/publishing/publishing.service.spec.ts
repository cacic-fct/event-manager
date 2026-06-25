import { PublicationState, PublicationTargetType } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { PublicationBulkOperation } from './publishing.models';
import { PublicationService } from './publishing.service';

describe('PublicationService', () => {
  function createService() {
    const prisma = {
      majorEvent: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      eventGroup: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      event: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const authorizationPolicy = {
      assertPermissions: jest.fn().mockResolvedValue(undefined),
      accessibleEventTargets: jest.fn().mockResolvedValue(null),
      accessibleMajorEventIds: jest.fn().mockResolvedValue(null),
      accessibleEventGroupIds: jest.fn().mockResolvedValue(null),
    };
    const transitionOutcome = {
      result: {
        ok: true,
        message: 'ok',
        affectedEventIds: [],
        affectedMajorEventIds: [],
      },
      sync: {
        eventIds: [],
        majorEventIds: [],
      },
      scheduledState: null,
      scheduledPublishAt: null,
    };
    const transitions = {
      setPublicationState: jest.fn().mockResolvedValue(transitionOutcome),
      runBulkOperation: jest.fn().mockResolvedValue(transitionOutcome),
    };
    const jobs = {
      enqueueScheduledJobs: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PublicationService(
      prisma as never,
      authorizationPolicy as never,
      transitions as never,
      {} as never,
      jobs as never,
    );

    return { authorizationPolicy, jobs, prisma, service, transitions };
  }

  it('filters publication workspace queries to scoped grant targets', async () => {
    const { authorizationPolicy, prisma, service } = createService();
    const user = { sub: 'admin-1' };
    authorizationPolicy.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(['event-1']),
      majorEventIds: new Set(['major-1']),
      eventGroupIds: new Set(['group-1']),
    });
    authorizationPolicy.accessibleMajorEventIds.mockResolvedValue(new Set(['major-1']));
    authorizationPolicy.accessibleEventGroupIds.mockResolvedValue(new Set(['group-1']));

    await expect(service.getWorkspace({ req: { user } } as never)).resolves.toMatchObject({
      tree: [],
      items: [],
      totalCount: 3,
      skip: 0,
      take: 50,
      hasMore: false,
      warnings: [],
    });

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      user,
      [Permission.Event.Read, Permission.EventGroup.Read, Permission.MajorEvent.Read],
      { allowScopedCollection: true },
    );
    expect(authorizationPolicy.accessibleEventTargets).toHaveBeenCalledWith(user, Permission.Event.Read);
    expect(authorizationPolicy.accessibleMajorEventIds).toHaveBeenCalledWith(user, Permission.MajorEvent.Read);
    expect(authorizationPolicy.accessibleEventGroupIds).toHaveBeenCalledWith(user, Permission.EventGroup.Read);

    const [majorEventCountCall] = prisma.majorEvent.count.mock.calls;
    const [eventGroupCountCall] = prisma.eventGroup.count.mock.calls;
    const [eventCountCall] = prisma.event.count.mock.calls;
    const [treeMajorEventsCall, warningMajorEventsCall] = prisma.majorEvent.findMany.mock.calls;
    const [eventGroupsCall] = prisma.eventGroup.findMany.mock.calls;
    const [eventsCall, warningEventsCall] = prisma.event.findMany.mock.calls;

    expect(JSON.stringify(majorEventCountCall[0].where)).toContain('major-1');
    expect(JSON.stringify(treeMajorEventsCall[0].where)).toContain('major-1');

    expect(JSON.stringify(eventGroupCountCall[0].where)).toContain('group-1');
    expect(JSON.stringify(eventGroupsCall[0].where)).toContain('group-1');
    expect(JSON.stringify(eventGroupsCall[0].where)).toContain('event-1');

    expect(JSON.stringify(eventCountCall[0].where)).toContain('event-1');
    expect(JSON.stringify(eventsCall[0].where)).toContain('event-1');
    expect(JSON.stringify(warningEventsCall[0].where)).toContain('event-1');
    expect(JSON.stringify(warningMajorEventsCall[0].where)).toContain('major-1');
    expect(JSON.stringify(warningMajorEventsCall[0].select.events.where)).toContain('event-1');
  });

  it('paginates publication workspace sections without loading every target', async () => {
    const { prisma, service } = createService();
    prisma.majorEvent.count.mockResolvedValue(60);
    prisma.eventGroup.count.mockResolvedValue(20);
    prisma.event.count.mockResolvedValue(30);

    await expect(service.getWorkspace({ req: { user: { sub: 'admin-1' } } } as never, { skip: 55, take: 30 }))
      .resolves.toMatchObject({
        totalCount: 110,
        skip: 55,
        take: 30,
        hasMore: true,
      });

    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 55,
        take: 5,
      }),
    );
    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      }),
    );
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 5,
      }),
    );
  });

  it('requires event update permission when an event-group state change writes child events', async () => {
    const { authorizationPolicy, service, transitions } = createService();
    const user = { sub: 'admin-1' };
    const input = {
      targetType: PublicationTargetType.EVENT_GROUP,
      targetId: 'group-1',
      state: PublicationState.PUBLISHED,
    };

    await expect(service.setPublicationState(input, { req: { user } } as never)).resolves.toMatchObject({
      ok: true,
    });

    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(
      1,
      user,
      [Permission.EventGroup.Update],
      { eventGroupId: 'group-1' },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(
      2,
      user,
      [Permission.Event.Update],
      { eventGroupId: 'group-1' },
    );
    expect(transitions.setPublicationState).toHaveBeenCalledWith(input, user);
  });

  it('requires event update permission when a major-event bulk operation writes child events', async () => {
    const { authorizationPolicy, service, transitions } = createService();
    const user = { sub: 'admin-1' };
    const scheduledPublishAt = new Date('2026-06-26T12:00:00.000Z');
    const input = {
      targetType: PublicationTargetType.MAJOR_EVENT,
      targetId: 'major-1',
      operation: PublicationBulkOperation.SCHEDULE_BUNDLE,
      scheduledPublishAt,
    };

    await expect(service.runBulkOperation(input, { req: { user } } as never)).resolves.toMatchObject({
      ok: true,
    });

    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(
      1,
      user,
      [Permission.MajorEvent.Update],
      { majorEventId: 'major-1' },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenNthCalledWith(
      2,
      user,
      [Permission.Event.Update],
      { majorEventId: 'major-1' },
    );
    expect(transitions.runBulkOperation).toHaveBeenCalledWith(input, user);
  });
});
