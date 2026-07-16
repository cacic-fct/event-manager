import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { PublicationState } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PublicationStateWriterService } from './publishing-state-writer.service';

describe('PublicationStateWriterService', () => {
  const now = new Date('2026-07-07T12:00:00.000Z');

  function createUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
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
      ...overrides,
    };
  }

  function eventRecord(id = 'event-1') {
    return {
      id,
      name: `Evento ${id}`,
      majorEventId: 'major-1',
      eventGroupId: 'group-1',
      publicationState: PublicationState.DRAFT,
      scheduledPublishAt: null,
      publishedAt: null,
      unpublishedAt: null,
    };
  }

  function majorEventRecord(id = 'major-1') {
    return {
      id,
      name: `Grande evento ${id}`,
      publicationState: PublicationState.DRAFT,
      scheduledPublishAt: null,
      publishedAt: null,
      unpublishedAt: null,
    };
  }

  function createService() {
    const tx = {
      event: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      majorEvent: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PublicationStateWriterService(prisma as never, auditLog as never);

    return { auditLog, prisma, service, tx };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('publishes a single event and records an event-scoped audit log', async () => {
    const { auditLog, service, tx } = createService();
    const previous = eventRecord();
    const updated = { ...previous, publicationState: PublicationState.PUBLISHED, publishedAt: now };
    const user = createUser();
    tx.event.findFirst.mockResolvedValue(previous);
    tx.event.update.mockResolvedValue(updated);

    await expect(service.updateEventPublicationState('event-1', PublicationState.PUBLISHED, null, user)).resolves.toEqual(
      {
        eventIds: ['event-1'],
        majorEventIds: [],
      },
    );

    expect(tx.event.findFirst).toHaveBeenCalledWith({
      where: { id: 'event-1', deletedAt: null },
      select: expect.any(Object),
    });
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: {
        publicationState: PublicationState.PUBLISHED,
        scheduledPublishAt: null,
        publishedAt: now,
        unpublishedAt: null,
        publicationScheduledBy: null,
        publicationUpdatedBy: 'admin-1',
      },
      select: expect.any(Object),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.EVENT,
        entityId: 'event-1',
        entityLabel: 'Evento event-1',
        operation: AuditLogOperation.UPDATE,
        actor: user,
        before: previous,
        after: updated,
        scope: {
          permission: Permission.Event.Update,
          eventId: 'event-1',
          majorEventId: 'major-1',
          eventGroupId: 'group-1',
        },
        summary: 'Conteúdo publicado.',
        squashWindowMs: 0,
      }),
      tx,
    );
  });

  it('does not rewrite or audit an event already in the requested publication state', async () => {
    const { auditLog, service, tx } = createService();
    const published = { ...eventRecord(), publicationState: PublicationState.PUBLISHED, publishedAt: now };
    tx.event.findFirst.mockResolvedValue(published);

    await expect(service.updateEventPublicationState('event-1', PublicationState.PUBLISHED, null, createUser())).resolves.toEqual({
      eventIds: [],
      majorEventIds: [],
    });

    expect(tx.event.update).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('rejects scheduled publication without a future timestamp before opening a transaction', async () => {
    const { prisma, service } = createService();
    const user = createUser();

    await expect(
      service.updateEventPublicationState('event-1', PublicationState.SCHEDULED, null, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateEventPublicationState('event-1', PublicationState.SCHEDULED, now, user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('schedules a single event publication with the requested future timestamp', async () => {
    const { service, tx } = createService();
    const scheduledPublishAt = new Date('2026-07-08T12:00:00.000Z');
    const previous = eventRecord();
    const updated = { ...previous, publicationState: PublicationState.SCHEDULED, scheduledPublishAt };
    const user = createUser();
    tx.event.findFirst.mockResolvedValue(previous);
    tx.event.update.mockResolvedValue(updated);

    await expect(
      service.updateEventPublicationState('event-1', PublicationState.SCHEDULED, scheduledPublishAt, user),
    ).resolves.toEqual({
      eventIds: ['event-1'],
      majorEventIds: [],
    });

    expect(tx.event.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          publicationState: PublicationState.SCHEDULED,
          scheduledPublishAt,
          publishedAt: null,
          unpublishedAt: null,
          publicationScheduledBy: 'admin-1',
          publicationUpdatedBy: 'admin-1',
        },
      }),
    );
  });

  it('unpublishes a major event and records a major-event-scoped audit log', async () => {
    const { auditLog, service, tx } = createService();
    const previous = majorEventRecord();
    const updated = { ...previous, publicationState: PublicationState.UNPUBLISHED, unpublishedAt: now };
    const user = createUser({ sub: undefined, email: 'fallback@example.com' });
    tx.majorEvent.findFirst.mockResolvedValue(previous);
    tx.majorEvent.update.mockResolvedValue(updated);

    await expect(
      service.updateMajorEventPublicationState('major-1', PublicationState.UNPUBLISHED, null, user),
    ).resolves.toEqual({
      eventIds: [],
      majorEventIds: ['major-1'],
    });

    expect(tx.majorEvent.update).toHaveBeenCalledWith({
      where: { id: 'major-1' },
      data: {
        publicationState: PublicationState.UNPUBLISHED,
        scheduledPublishAt: null,
        publishedAt: null,
        unpublishedAt: now,
        publicationScheduledBy: null,
        publicationUpdatedBy: 'fallback@example.com',
      },
      select: expect.any(Object),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.MAJOR_EVENT,
        entityId: 'major-1',
        entityLabel: 'Grande evento major-1',
        operation: AuditLogOperation.UPDATE,
        actor: user,
        before: previous,
        after: updated,
        scope: {
          permission: Permission.MajorEvent.Update,
          majorEventId: 'major-1',
        },
        summary: 'Conteúdo despublicado.',
        squashWindowMs: 0,
      }),
      tx,
    );
  });

  it('deduplicates bulk targets, moves them to draft, and audits each updated target', async () => {
    const { auditLog, service, tx } = createService();
    const firstEvent = { ...eventRecord('event-1'), publicationState: PublicationState.PUBLISHED };
    const secondEvent = { ...eventRecord('event-2'), publicationState: PublicationState.PUBLISHED };
    const majorEvent = { ...majorEventRecord('major-1'), publicationState: PublicationState.PUBLISHED };
    tx.event.findFirst.mockResolvedValueOnce(firstEvent).mockResolvedValueOnce(secondEvent);
    tx.event.update
      .mockResolvedValueOnce({ ...firstEvent, publicationState: PublicationState.DRAFT })
      .mockResolvedValueOnce({ ...secondEvent, publicationState: PublicationState.DRAFT });
    tx.majorEvent.findFirst.mockResolvedValueOnce(majorEvent);
    tx.majorEvent.update.mockResolvedValueOnce({ ...majorEvent, publicationState: PublicationState.DRAFT });

    await expect(
      service.updateTargetsPublicationState({
        eventIds: ['event-1', 'event-2', 'event-1'],
        majorEventIds: ['major-1', 'major-1'],
        state: PublicationState.DRAFT,
        scheduledPublishAt: new Date('2026-07-08T12:00:00.000Z'),
        user: undefined,
      }),
    ).resolves.toEqual({
      eventIds: ['event-1', 'event-2'],
      majorEventIds: ['major-1'],
    });

    expect(tx.event.update).toHaveBeenCalledTimes(2);
    expect(tx.majorEvent.update).toHaveBeenCalledTimes(1);
    expect(tx.event.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'event-1' },
        data: expect.objectContaining({
          publicationState: PublicationState.DRAFT,
          scheduledPublishAt: null,
          publishedAt: null,
          unpublishedAt: null,
          publicationScheduledBy: null,
          publicationUpdatedBy: 'unknown-admin',
        }),
      }),
    );
    expect(tx.event.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'event-2' },
      }),
    );
    expect(tx.majorEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'major-1' },
        data: expect.objectContaining({
          publicationState: PublicationState.DRAFT,
          publicationUpdatedBy: 'unknown-admin',
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledTimes(3);
    expect(auditLog.record).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        entityType: AuditLogEntityType.MAJOR_EVENT,
        summary: 'Conteúdo movido para rascunho.',
      }),
      tx,
    );
  });

  it('accepts a bulk state update without explicit target arrays', async () => {
    const { auditLog, service, tx } = createService();

    await expect(
      service.updateTargetsPublicationState({
        state: PublicationState.DRAFT,
        scheduledPublishAt: null,
        user: createUser(),
      }),
    ).resolves.toEqual({
      eventIds: [],
      majorEventIds: [],
    });

    expect(tx.event.findFirst).not.toHaveBeenCalled();
    expect(tx.majorEvent.findFirst).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('throws when the requested event or major event no longer exists', async () => {
    const { service, tx } = createService();
    tx.event.findFirst.mockResolvedValueOnce(null);
    tx.majorEvent.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.updateEventPublicationState('event-missing', PublicationState.PUBLISHED, null, createUser()),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateMajorEventPublicationState('major-missing', PublicationState.PUBLISHED, null, createUser()),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.event.update).not.toHaveBeenCalled();
    expect(tx.majorEvent.update).not.toHaveBeenCalled();
  });

  it('throws when a requested bulk event target no longer exists', async () => {
    const { service, tx } = createService();
    tx.event.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.updateTargetsPublicationState({
        eventIds: ['event-missing'],
        majorEventIds: ['major-1'],
        state: PublicationState.PUBLISHED,
        scheduledPublishAt: null,
        user: createUser(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.event.update).not.toHaveBeenCalled();
    expect(tx.majorEvent.findFirst).not.toHaveBeenCalled();
  });

  it('throws when a requested bulk major event target no longer exists', async () => {
    const { service, tx } = createService();
    const event = eventRecord();
    tx.event.findFirst.mockResolvedValueOnce(event);
    tx.event.update.mockResolvedValueOnce({ ...event, publicationState: PublicationState.PUBLISHED });
    tx.majorEvent.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.updateTargetsPublicationState({
        eventIds: ['event-1'],
        majorEventIds: ['major-missing'],
        state: PublicationState.PUBLISHED,
        scheduledPublishAt: null,
        user: createUser(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.event.update).toHaveBeenCalledTimes(1);
    expect(tx.majorEvent.update).not.toHaveBeenCalled();
  });
});
