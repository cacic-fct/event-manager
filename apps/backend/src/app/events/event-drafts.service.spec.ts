import { Logger } from '@nestjs/common';
import { AuditLogOperation, PublicationState } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventDraftsService } from './event-drafts.service';

describe('EventDraftsService', () => {
  let loggerWarnSpy: jest.SpyInstance;

  const user = {
    sub: 'user-1',
    email: 'editor@example.com',
    preferredUsername: 'editor',
    claims: { name: 'Editora' },
  };

  const sourceEvent = {
    id: 'event-1',
    name: 'Evento publicado',
    endDate: new Date('2026-07-01T13:00:00.000Z'),
  };

  const draftRecord = {
    id: 'draft-1',
    sourceEventId: 'event-1',
    name: 'Evento revisado',
    payload: {
      name: 'Evento revisado',
      startDate: '2026-07-01T12:00:00.000Z',
      endDate: '2026-07-01T13:00:00.000Z',
    },
    createdById: 'user-1',
    createdByName: 'Editora',
    createdByEmail: 'editor@example.com',
    updatedById: 'user-1',
    updatedByName: 'Editora',
    updatedByEmail: 'editor@example.com',
    createdAt: new Date('2026-06-27T12:00:00.000Z'),
    updatedAt: new Date('2026-06-27T12:30:00.000Z'),
    expiresAt: new Date('2026-07-31T13:00:00.000Z'),
  };

  beforeEach(() => {
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  function buildService(overrides: Partial<{
    prisma: Record<string, unknown>;
    authorizationPolicy: Record<string, unknown>;
    frozenResources: Record<string, unknown>;
    auditLog: Record<string, unknown>;
    attendanceRealtime: Record<string, unknown>;
    typesenseSearch: Record<string, unknown>;
  }> = {}) {
    const tx = {
      eventDraft: {
        create: jest.fn().mockResolvedValue(draftRecord),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      event: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      eventGroup: {
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(sourceEvent),
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventDraft: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Editora', email: 'editor@example.com' }),
      },
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
      ...(overrides.prisma ?? {}),
    };
    const authorizationPolicy = {
      assertPermissions: jest.fn(),
      accessibleEventTargets: jest.fn(),
      ...(overrides.authorizationPolicy ?? {}),
    };
    const frozenResources = {
      assertEventUpdateMutable: jest.fn(),
      ...(overrides.frozenResources ?? {}),
    };
    const auditLog = {
      record: jest.fn(),
      ...(overrides.auditLog ?? {}),
    };
    const attendanceRealtime = {
      notifyAllConnectedPeople: jest.fn(),
      ...(overrides.attendanceRealtime ?? {}),
    };
    const typesenseSearch = {
      upsertEvent: jest.fn(),
      ...(overrides.typesenseSearch ?? {}),
    };

    return {
      service: new EventDraftsService(
        prisma as never,
        authorizationPolicy as never,
        frozenResources as never,
        auditLog as never,
        attendanceRealtime as never,
        typesenseSearch as never,
      ),
      prisma,
      tx,
      authorizationPolicy,
      frozenResources,
      auditLog,
      attendanceRealtime,
      typesenseSearch,
    };
  }

  it('lists drafts only through editable event targets', async () => {
    const { service, prisma, authorizationPolicy } = buildService();
    authorizationPolicy.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(['event-1']),
      majorEventIds: new Set<string>(),
      eventGroupIds: new Set<string>(),
    });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }]);
    prisma.eventDraft.findMany.mockResolvedValue([draftRecord]);

    await expect(service.listEventDrafts(user as never, { sourceEventId: 'event-1' })).resolves.toEqual([
      expect.objectContaining({ id: 'draft-1', payloadJson: expect.any(String) }),
    ]);

    expect(authorizationPolicy.accessibleEventTargets).toHaveBeenCalledWith(user, Permission.Event.Update);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [{ id: { in: ['event-1'] } }],
            },
          ],
        }),
      }),
    );
  });

  it('saves a separate draft without updating the published event row', async () => {
    const { service, tx, authorizationPolicy, frozenResources, auditLog } = buildService();

    await expect(
      service.saveEventDraft(
        {
          sourceEventId: 'event-1',
          input: {
            name: 'Evento revisado',
            startDate: new Date('2026-07-01T12:00:00.000Z'),
            endDate: new Date('2026-07-01T13:00:00.000Z'),
          },
        },
        user as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'draft-1', payloadJson: expect.any(String) }));

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, ['event#update'], { eventId: 'event-1' });
    expect(frozenResources.assertEventUpdateMutable).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ name: 'Evento revisado' }),
      user,
    );
    expect(tx.event.updateMany).not.toHaveBeenCalled();
    expect(tx.eventDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceEventId: 'event-1',
          name: 'Evento revisado',
          payload: expect.objectContaining({
            name: 'Evento revisado',
            startDate: '2026-07-01T12:00:00.000Z',
          }),
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'event-1',
        operation: AuditLogOperation.CREATE,
        summary: 'Rascunho "Evento revisado" criado.',
      }),
      tx,
    );
  });

  it('applies a draft to the source event, keeps it published, and hard deletes the draft', async () => {
    const previousEvent = {
      id: 'event-1',
      name: 'Evento publicado',
      publicationState: PublicationState.PUBLISHED,
      publishedAt: new Date('2026-06-01T12:00:00.000Z'),
      majorEventId: null,
      eventGroupId: null,
    };
    const updatedEvent = {
      ...previousEvent,
      name: 'Evento revisado',
      emoji: '🎟️',
      type: 'OTHER',
      description: null,
      shortDescription: null,
      locationDescription: null,
      shouldIssueCertificate: false,
      publiclyVisible: true,
      startDate: new Date('2026-07-01T12:00:00.000Z'),
      endDate: new Date('2026-07-01T13:00:00.000Z'),
    };
    const { service, prisma, tx, auditLog, attendanceRealtime, typesenseSearch } = buildService();
    prisma.eventDraft.findUnique.mockResolvedValue(draftRecord);
    tx.event.findFirst.mockResolvedValue(previousEvent);
    tx.event.findUniqueOrThrow.mockResolvedValue(updatedEvent);

    await expect(service.applyEventDraft('draft-1', user as never)).resolves.toEqual(updatedEvent);

    expect(tx.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-1', deletedAt: null },
        data: expect.objectContaining({
          name: 'Evento revisado',
          publicationState: PublicationState.PUBLISHED,
          scheduledPublishAt: null,
          publicationScheduledBy: null,
          unpublishedAt: null,
        }),
      }),
    );
    const updateCall = tx.event.updateMany.mock.calls[0][0] as { data: { publishedAt: Date } };
    expect(updateCall.data.publishedAt).toBeInstanceOf(Date);
    expect(updateCall.data.publishedAt.getTime()).toBeGreaterThan(previousEvent.publishedAt.getTime());
    expect(tx.eventDraft.delete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'event-1',
        operation: AuditLogOperation.UPDATE,
        summary: 'Rascunho "Evento revisado" aplicado à publicação.',
        metadata: expect.objectContaining({ draftId: 'draft-1' }),
      }),
      tx,
    );
    expect(typesenseSearch.upsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'event-1',
        name: 'Evento revisado',
        publicationState: PublicationState.PUBLISHED,
      }),
    );
    expect(attendanceRealtime.notifyAllConnectedPeople).not.toHaveBeenCalled();
  });

  it('keeps the apply mutation successful when post-commit search sync fails', async () => {
    const previousEvent = {
      id: 'event-1',
      name: 'Evento publicado',
      publicationState: PublicationState.PUBLISHED,
      publishedAt: new Date('2026-06-01T12:00:00.000Z'),
      majorEventId: null,
      eventGroupId: null,
    };
    const updatedEvent = {
      ...previousEvent,
      name: 'Evento revisado',
      emoji: '🎟️',
      type: 'OTHER',
      description: null,
      shortDescription: null,
      locationDescription: null,
      shouldIssueCertificate: false,
      publiclyVisible: true,
      startDate: new Date('2026-07-01T12:00:00.000Z'),
      endDate: new Date('2026-07-01T13:00:00.000Z'),
    };
    const { service, prisma, tx, typesenseSearch } = buildService();
    prisma.eventDraft.findUnique.mockResolvedValue(draftRecord);
    tx.event.findFirst.mockResolvedValue(previousEvent);
    tx.event.findUniqueOrThrow.mockResolvedValue(updatedEvent);
    typesenseSearch.upsertEvent.mockRejectedValueOnce(new Error('Typesense unavailable'));

    await expect(service.applyEventDraft('draft-1', user as never)).resolves.toEqual(updatedEvent);

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Typesense event sync failed after applying event draft draft-1'),
    );
  });

  it('deletes a single draft using only the source event scope', async () => {
    const { service, prisma, authorizationPolicy, frozenResources, tx } = buildService();
    prisma.eventDraft.findUnique.mockResolvedValue({
      ...draftRecord,
      payload: {
        ...draftRecord.payload,
        majorEventId: 'major-event-from-draft',
        eventGroupId: 'event-group-from-draft',
      },
    });
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1', name: 'Evento publicado' }]);

    await expect(service.deleteEventDraft('draft-1', user as never)).resolves.toEqual({
      deleted: true,
      id: 'draft-1',
      eventId: 'event-1',
    });

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, [Permission.Event.Update], {
      eventId: 'event-1',
    });
    expect(frozenResources.assertEventUpdateMutable).toHaveBeenCalledWith('event-1', {}, user);
    expect(tx.eventDraft.deleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['draft-1'],
        },
      },
    });
  });

  it('cleans up all stale draft batches', async () => {
    const secondDraft = {
      ...draftRecord,
      id: 'draft-2',
      updatedAt: new Date('2026-06-27T12:31:00.000Z'),
    };
    const thirdDraft = {
      ...draftRecord,
      id: 'draft-3',
      updatedAt: new Date('2026-06-27T12:32:00.000Z'),
    };
    const { service, prisma, tx } = buildService();
    prisma.eventDraft.findMany
      .mockResolvedValueOnce([draftRecord, secondDraft])
      .mockResolvedValueOnce([thirdDraft])
      .mockResolvedValueOnce([]);
    prisma.event.findMany.mockResolvedValue([{ id: 'event-1', name: 'Evento publicado' }]);

    await expect(service.cleanupStaleDrafts(new Date('2026-08-01T00:00:00.000Z'))).resolves.toBe(3);

    expect(prisma.eventDraft.findMany).toHaveBeenCalledTimes(3);
    expect(tx.eventDraft.deleteMany).toHaveBeenCalledTimes(2);
    expect(tx.eventDraft.deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: {
          in: ['draft-1', 'draft-2'],
        },
      },
    });
    expect(tx.eventDraft.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: {
          in: ['draft-3'],
        },
      },
    });
  });
});
