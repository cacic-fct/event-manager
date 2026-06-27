import { AuditLogOperation, PublicationState } from '@prisma/client';
import { EventDraftsService } from './event-drafts.service';

describe('EventDraftsService', () => {
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
      },
      eventDraft: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
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
          unpublishedAt: null,
        }),
      }),
    );
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
});
