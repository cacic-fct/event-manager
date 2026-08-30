import { BadRequestException, Logger } from '@nestjs/common';
import { PublicationState, PublicationTargetType } from '@cacic-fct/shared-data-types';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PublicationBulkOperation } from './publishing.models';
import { PublicationTransitionService } from './publishing-transition.service';

describe('PublicationTransitionService', () => {
  function createUser(): AuthenticatedUser {
    return {
      realm_access: { roles: [] },
      sub: 'admin-1',
      preferredUsername: 'admin',
      email: 'admin@example.com',
      token: 'token',
      roles: [],
      roleSet: new Set(),
      permissions: [],
      permissionSet: new Set(),
      oidcScopes: [],
      oidcScopeSet: new Set(),
      scopes: [],
      scopeSet: new Set(),
      claims: {},
    };
  }

  function createService() {
    const searchSync = {
      syncSearch: jest.fn().mockResolvedValue(undefined),
    };
    const stateWriter = {
      updateEventPublicationState: jest.fn(),
      updateMajorEventPublicationState: jest.fn(),
      updateTargetsPublicationState: jest.fn(),
    };
    const targets = {
      resolveChildEventIds: jest.fn(),
    };
    const sitemap = { refresh: jest.fn().mockResolvedValue([]) };
    const realtime = {
      scope: jest.fn((channel: string) => channel),
      publish: jest.fn().mockResolvedValue({}),
    };
    const service = new PublicationTransitionService(
      searchSync as never,
      stateWriter as never,
      targets as never,
      sitemap as never,
      realtime as never,
    );

    return { realtime, searchSync, service, sitemap, stateWriter, targets };
  }

  it('publishes a single event and syncs search for the changed target', async () => {
    const { realtime, searchSync, service, stateWriter, targets } = createService();
    const user = createUser();
    const sync = { eventIds: ['event-1'], majorEventIds: [] };
    stateWriter.updateEventPublicationState.mockResolvedValue(sync);

    await expect(
      service.setPublicationState(
        {
          targetType: PublicationTargetType.EVENT,
          targetId: 'event-1',
          state: PublicationState.PUBLISHED,
        },
        user,
      ),
    ).resolves.toEqual({
      result: {
        ok: true,
        message: 'Conteúdo publicado. 1 item afetado.',
        affectedEventIds: ['event-1'],
        affectedMajorEventIds: [],
      },
      sync,
      scheduledState: PublicationState.PUBLISHED,
      scheduledPublishAt: null,
    });

    expect(stateWriter.updateEventPublicationState).toHaveBeenCalledWith(
      'event-1',
      PublicationState.PUBLISHED,
      null,
      user,
    );
    expect(targets.resolveChildEventIds).not.toHaveBeenCalled();
    expect(searchSync.syncSearch).toHaveBeenCalledWith(sync);
    expect(realtime.publish).toHaveBeenCalledTimes(2);
    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-workspace',
      expect.objectContaining({
        type: 'PUBLICATION_INVALIDATED',
        eventIds: ['event-1'],
        majorEventIds: [],
      }),
    );
    expect(realtime.publish).toHaveBeenCalledWith(
      'public-catalog-v2',
      expect.objectContaining({ type: 'PUBLIC_CATALOG_INVALIDATED', revision: expect.any(String) }),
    );
  });

  it('does not turn a committed publication into an error when realtime invalidation fails', async () => {
    const { realtime, service, stateWriter } = createService();
    stateWriter.updateEventPublicationState.mockResolvedValue({ eventIds: ['event-1'], majorEventIds: [] });
    realtime.publish.mockRejectedValue(new Error('Realtime unavailable'));

    await expect(
      service.setPublicationState(
        {
          targetType: PublicationTargetType.EVENT,
          targetId: 'event-1',
          state: PublicationState.PUBLISHED,
        },
        createUser(),
      ),
    ).resolves.toMatchObject({ result: { ok: true } });
  });

  it('does not publish a catalog invalidation when no target changed', async () => {
    const { realtime, service, stateWriter } = createService();
    stateWriter.updateEventPublicationState.mockResolvedValue({ eventIds: [], majorEventIds: [] });

    await expect(
      service.setPublicationState(
        {
          targetType: PublicationTargetType.EVENT,
          targetId: 'event-1',
          state: PublicationState.PUBLISHED,
        },
        createUser(),
      ),
    ).resolves.toMatchObject({
      result: {
        affectedEventIds: [],
        affectedMajorEventIds: [],
      },
    });

    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it('schedules a major event with the provided timestamp', async () => {
    const { service, stateWriter } = createService();
    const user = createUser();
    const scheduledPublishAt = new Date('2026-07-08T12:00:00.000Z');
    const sync = { eventIds: [], majorEventIds: ['major-1'] };
    stateWriter.updateMajorEventPublicationState.mockResolvedValue(sync);

    await expect(
      service.setPublicationState(
        {
          targetType: PublicationTargetType.MAJOR_EVENT,
          targetId: 'major-1',
          state: PublicationState.SCHEDULED,
          scheduledPublishAt,
        },
        user,
      ),
    ).resolves.toMatchObject({
      result: {
        message: 'Publicação agendada. 1 item afetado.',
      },
      sync,
      scheduledState: PublicationState.SCHEDULED,
      scheduledPublishAt,
    });

    expect(stateWriter.updateMajorEventPublicationState).toHaveBeenCalledWith(
      'major-1',
      PublicationState.SCHEDULED,
      scheduledPublishAt,
      user,
    );
  });

  it('publishes an event and synchronizes the public-site visibility override', async () => {
    const { searchSync, service, stateWriter } = createService();
    const sync = { eventIds: ['event-1'], majorEventIds: [] };
    stateWriter.updateEventPublicationState.mockResolvedValue(sync);

    await expect(
      service.setEventPublicationState('event-1', PublicationState.PUBLISHED, createUser(), {
        isPubliclyListed: true,
      }),
    ).resolves.toEqual(sync);

    expect(stateWriter.updateEventPublicationState).toHaveBeenCalledWith(
      'event-1',
      PublicationState.PUBLISHED,
      null,
      expect.any(Object),
      { isPubliclyListed: true },
    );
    expect(searchSync.syncSearch).toHaveBeenCalledWith(sync);
  });

  it('rejects a scheduled state change when no schedule is provided', async () => {
    const { searchSync, service, stateWriter, targets } = createService();

    await expect(
      service.setPublicationState(
        {
          targetType: PublicationTargetType.EVENT,
          targetId: 'event-1',
          state: PublicationState.SCHEDULED,
        },
        createUser(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(stateWriter.updateEventPublicationState).not.toHaveBeenCalled();
    expect(targets.resolveChildEventIds).not.toHaveBeenCalled();
    expect(searchSync.syncSearch).not.toHaveBeenCalled();
  });

  it('updates every active child when changing an event-group state', async () => {
    const { service, stateWriter, targets } = createService();
    const user = createUser();
    const sync = { eventIds: ['event-1', 'event-2'], majorEventIds: [] };
    targets.resolveChildEventIds.mockResolvedValue(['event-1', 'event-2']);
    stateWriter.updateTargetsPublicationState.mockResolvedValue(sync);

    await expect(
      service.setPublicationState(
        {
          targetType: PublicationTargetType.EVENT_GROUP,
          targetId: 'group-1',
          state: PublicationState.UNPUBLISHED,
        },
        user,
      ),
    ).resolves.toMatchObject({
      result: {
        message: 'Conteúdo despublicado. 2 itens afetados.',
        affectedEventIds: ['event-1', 'event-2'],
      },
      scheduledPublishAt: null,
    });

    expect(targets.resolveChildEventIds).toHaveBeenCalledWith(PublicationTargetType.EVENT_GROUP, 'group-1', {
      requireChildren: true,
    });
    expect(stateWriter.updateTargetsPublicationState).toHaveBeenCalledWith({
      eventIds: ['event-1', 'event-2'],
      state: PublicationState.UNPUBLISHED,
      scheduledPublishAt: null,
      user,
    });
  });

  it('publishes only missing child targets during the missing-children bulk operation', async () => {
    const { searchSync, service, stateWriter, targets } = createService();
    const user = createUser();
    const sync = { eventIds: ['event-1'], majorEventIds: [] };
    targets.resolveChildEventIds.mockResolvedValue(['event-1']);
    stateWriter.updateTargetsPublicationState.mockResolvedValue(sync);

    await expect(
      service.runBulkOperation(
        {
          targetType: PublicationTargetType.MAJOR_EVENT,
          targetId: 'major-1',
          operation: PublicationBulkOperation.PUBLISH_MISSING_CHILDREN,
        },
        user,
      ),
    ).resolves.toMatchObject({
      result: {
        message: 'Item vinculado pendente publicado. 1 item afetado.',
      },
      scheduledState: null,
      scheduledPublishAt: null,
    });

    expect(targets.resolveChildEventIds).toHaveBeenCalledWith(PublicationTargetType.MAJOR_EVENT, 'major-1', {
      onlyMissingPublication: true,
    });
    expect(stateWriter.updateTargetsPublicationState).toHaveBeenCalledWith({
      eventIds: ['event-1'],
      state: PublicationState.PUBLISHED,
      scheduledPublishAt: null,
      user,
    });
    expect(searchSync.syncSearch).toHaveBeenCalledWith(sync);
  });

  it('schedules a major-event bundle including the major event and its children', async () => {
    const { service, stateWriter, targets } = createService();
    const user = createUser();
    const scheduledPublishAt = new Date('2026-07-08T12:00:00.000Z');
    const sync = { eventIds: ['event-1'], majorEventIds: ['major-1'] };
    targets.resolveChildEventIds.mockResolvedValue(['event-1']);
    stateWriter.updateTargetsPublicationState.mockResolvedValue(sync);

    await expect(
      service.runBulkOperation(
        {
          targetType: PublicationTargetType.MAJOR_EVENT,
          targetId: 'major-1',
          operation: PublicationBulkOperation.SCHEDULE_BUNDLE,
          scheduledPublishAt,
        },
        user,
      ),
    ).resolves.toMatchObject({
      result: {
        message: 'Conjunto agendado. 2 itens afetados.',
      },
      scheduledState: PublicationState.SCHEDULED,
      scheduledPublishAt,
    });

    expect(targets.resolveChildEventIds).toHaveBeenCalledWith(PublicationTargetType.MAJOR_EVENT, 'major-1', {
      includeTargetEvent: true,
    });
    expect(stateWriter.updateTargetsPublicationState).toHaveBeenCalledWith({
      eventIds: ['event-1'],
      majorEventIds: ['major-1'],
      state: PublicationState.SCHEDULED,
      scheduledPublishAt,
      user,
    });
  });

  it('schedules an event bundle without adding a major-event target', async () => {
    const { service, stateWriter, targets } = createService();
    const user = createUser();
    const scheduledPublishAt = new Date('2026-07-08T12:00:00.000Z');
    const sync = { eventIds: ['event-1'], majorEventIds: [] };
    targets.resolveChildEventIds.mockResolvedValue(['event-1']);
    stateWriter.updateTargetsPublicationState.mockResolvedValue(sync);

    await expect(
      service.runBulkOperation(
        {
          targetType: PublicationTargetType.EVENT,
          targetId: 'event-1',
          operation: PublicationBulkOperation.SCHEDULE_BUNDLE,
          scheduledPublishAt,
        },
        user,
      ),
    ).resolves.toMatchObject({
      result: {
        message: 'Conjunto agendado. 1 item afetado.',
      },
      scheduledState: PublicationState.SCHEDULED,
      scheduledPublishAt,
    });

    expect(stateWriter.updateTargetsPublicationState).toHaveBeenCalledWith({
      eventIds: ['event-1'],
      majorEventIds: [],
      state: PublicationState.SCHEDULED,
      scheduledPublishAt,
      user,
    });
  });

  it('rejects a scheduled bundle when no schedule is provided', async () => {
    const { searchSync, service, stateWriter, targets } = createService();

    await expect(
      service.runBulkOperation(
        {
          targetType: PublicationTargetType.MAJOR_EVENT,
          targetId: 'major-1',
          operation: PublicationBulkOperation.SCHEDULE_BUNDLE,
        },
        createUser(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(targets.resolveChildEventIds).not.toHaveBeenCalled();
    expect(stateWriter.updateTargetsPublicationState).not.toHaveBeenCalled();
    expect(searchSync.syncSearch).not.toHaveBeenCalled();
  });

  it('unpublishes an event bundle without adding a major-event target', async () => {
    const { service, stateWriter, targets } = createService();
    const sync = { eventIds: ['event-1'], majorEventIds: [] };
    targets.resolveChildEventIds.mockResolvedValue(['event-1']);
    stateWriter.updateTargetsPublicationState.mockResolvedValue(sync);

    await expect(
      service.runBulkOperation(
        {
          targetType: PublicationTargetType.EVENT,
          targetId: 'event-1',
          operation: PublicationBulkOperation.UNPUBLISH_BUNDLE,
        },
        undefined,
      ),
    ).resolves.toMatchObject({
      result: {
        message: 'Conjunto despublicado. 1 item afetado.',
      },
      scheduledState: null,
    });

    expect(stateWriter.updateTargetsPublicationState).toHaveBeenCalledWith({
      eventIds: ['event-1'],
      majorEventIds: [],
      state: PublicationState.UNPUBLISHED,
      scheduledPublishAt: null,
      user: undefined,
    });
  });

  it('unpublishes a major-event bundle including the major-event target', async () => {
    const { service, stateWriter, targets } = createService();
    const user = createUser();
    const sync = { eventIds: ['event-1'], majorEventIds: ['major-1'] };
    targets.resolveChildEventIds.mockResolvedValue(['event-1']);
    stateWriter.updateTargetsPublicationState.mockResolvedValue(sync);

    await expect(
      service.runBulkOperation(
        {
          targetType: PublicationTargetType.MAJOR_EVENT,
          targetId: 'major-1',
          operation: PublicationBulkOperation.UNPUBLISH_BUNDLE,
        },
        user,
      ),
    ).resolves.toMatchObject({
      result: {
        message: 'Conjunto despublicado. 2 itens afetados.',
      },
    });

    expect(stateWriter.updateTargetsPublicationState).toHaveBeenCalledWith({
      eventIds: ['event-1'],
      majorEventIds: ['major-1'],
      state: PublicationState.UNPUBLISHED,
      scheduledPublishAt: null,
      user,
    });
  });

  it('delegates scheduled job publication helpers to the state writer', async () => {
    const { realtime, service, stateWriter } = createService();
    const user = createUser();
    stateWriter.updateEventPublicationState.mockResolvedValue({ eventIds: ['event-1'], majorEventIds: [] });
    stateWriter.updateMajorEventPublicationState.mockResolvedValue({ eventIds: [], majorEventIds: ['major-1'] });

    await expect(service.publishEventById('event-1', user)).resolves.toEqual({
      eventIds: ['event-1'],
      majorEventIds: [],
    });
    await expect(service.publishMajorEventById('major-1', null)).resolves.toEqual({
      eventIds: [],
      majorEventIds: ['major-1'],
    });

    expect(stateWriter.updateEventPublicationState).toHaveBeenCalledWith(
      'event-1',
      PublicationState.PUBLISHED,
      null,
      user,
    );
    expect(stateWriter.updateMajorEventPublicationState).toHaveBeenCalledWith(
      'major-1',
      PublicationState.PUBLISHED,
      null,
      undefined,
    );
    expect(realtime.publish).toHaveBeenCalledTimes(4);
    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-workspace',
      expect.objectContaining({ type: 'PUBLICATION_INVALIDATED', eventIds: ['event-1'] }),
    );
    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-workspace',
      expect.objectContaining({ type: 'PUBLICATION_INVALIDATED', majorEventIds: ['major-1'] }),
    );
  });

  it('keeps direct scheduled publication successful when realtime invalidation fails', async () => {
    const { realtime, service, stateWriter } = createService();
    const sync = { eventIds: ['event-1'], majorEventIds: [] };
    stateWriter.updateEventPublicationState.mockResolvedValue(sync);
    realtime.publish.mockRejectedValue(new Error('Realtime unavailable'));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    try {
      await expect(service.publishEventById('event-1', createUser())).resolves.toEqual(sync);
      expect(warn).toHaveBeenCalledWith('Publication realtime invalidation failed after commit: Realtime unavailable');
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps direct major-event publication successful when realtime invalidation fails', async () => {
    const { realtime, service, stateWriter } = createService();
    const sync = { eventIds: [], majorEventIds: ['major-1'] };
    stateWriter.updateMajorEventPublicationState.mockResolvedValue(sync);
    realtime.publish.mockRejectedValue(new Error('Realtime unavailable'));

    await expect(service.publishMajorEventById('major-1', null, { skipSitemap: true })).resolves.toEqual(sync);
  });

  it('does not mask a direct publication state-writer error as a realtime result', async () => {
    const { realtime, service, stateWriter } = createService();
    const failure = new Error('State writer unavailable');
    stateWriter.updateEventPublicationState.mockRejectedValue(failure);

    await expect(service.publishEventById('event-1', createUser())).rejects.toBe(failure);
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it('merges sync batches while preserving first-seen target order', () => {
    const { service } = createService();

    expect(
      service.mergeSync([
        { eventIds: ['event-1', 'event-2'], majorEventIds: ['major-1'] },
        { eventIds: ['event-2', 'event-3'], majorEventIds: ['major-1', 'major-2'] },
      ]),
    ).toEqual({
      eventIds: ['event-1', 'event-2', 'event-3'],
      majorEventIds: ['major-1', 'major-2'],
    });
  });

  it('returns committed publication state when derived search synchronization fails', async () => {
    const { searchSync, service, stateWriter } = createService();
    const sync = { eventIds: ['event-1'], majorEventIds: [] };
    stateWriter.updateEventPublicationState.mockResolvedValue(sync);
    searchSync.syncSearch.mockRejectedValue(new Error('Typesense unavailable'));

    await expect(
      service.setEventPublicationState('event-1', PublicationState.PUBLISHED, createUser()),
    ).resolves.toEqual(sync);
  });
});
