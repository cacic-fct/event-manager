import { Permission } from '@cacic-fct/shared-permissions';
import { EventsResolver } from './resolver';

describe('EventsResolver', () => {
  it('records event creation inside the event transaction', async () => {
    const event = {
      id: 'event-1',
      name: 'Evento de teste',
      emoji: 'calendar',
      type: 'OTHER',
      description: null,
      shortDescription: null,
      locationDescription: null,
      majorEventId: null,
      eventGroupId: null,
      startDate: new Date('2026-06-22T12:00:00.000Z'),
      endDate: new Date('2026-06-22T13:00:00.000Z'),
    };
    const tx = {
      event: {
        create: jest.fn().mockResolvedValue(event),
      },
      eventGroup: {
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const typesenseSearch = {
      upsertEvent: jest.fn(),
    };
    const frozenResources = {
      assertEventCreateTargetsMutable: jest.fn(),
    };
    const auditLog = {
      record: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    };
    const resolver = new EventsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      frozenResources as never,
      {} as never,
      auditLog as never,
    );

    await expect(
      resolver.createEvent(
        {
          name: event.name,
          emoji: event.emoji,
          startDate: event.startDate,
          endDate: event.endDate,
        },
        { req: { user: { sub: 'user-1' } } } as never,
      ),
    ).rejects.toThrow('audit unavailable');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ entityId: event.id }), tx);
    expect(typesenseSearch.upsertEvent).not.toHaveBeenCalled();
  });

  it('uses SQL search when event access is scoped before pagination', async () => {
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(true),
      searchEvents: jest.fn(),
    };
    const authorizationPolicy = {
      accessibleEventTargets: jest.fn().mockResolvedValue({
        eventIds: new Set(['event-1']),
        majorEventIds: new Set<string>(),
        eventGroupIds: new Set<string>(),
      }),
    };
    const resolver = new EventsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      {} as never,
      authorizationPolicy as never,
    );

    await expect(
      resolver.events(
        { req: { user: { sub: 'user-1' } } } as never,
        'aula',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        0,
        10,
      ),
    ).resolves.toEqual([]);

    expect(authorizationPolicy.accessibleEventTargets).toHaveBeenCalledWith({ sub: 'user-1' }, Permission.Event.Read);
    expect(typesenseSearch.searchEvents).not.toHaveBeenCalled();
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                {
                  id: {
                    in: ['event-1'],
                  },
                },
              ],
            },
          ],
          name: {
            contains: 'aula',
            mode: 'insensitive',
          },
        }),
        take: 10,
      }),
    );
  });

  it('uses Typesense rank for unscoped event searches before applying pagination', async () => {
    const prisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([{ id: 'event-b' }, { id: 'event-a' }]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(true),
      searchEvents: jest.fn().mockResolvedValue({
        available: true,
        ids: ['event-a', 'event-b'],
      }),
    };
    const authorizationPolicy = {
      accessibleEventTargets: jest.fn().mockResolvedValue(null),
    };
    const resolver = new EventsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      {} as never,
      authorizationPolicy as never,
    );

    await expect(
      resolver.events(
        { req: { user: { sub: 'user-1' } } } as never,
        ' aula ',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        1,
      ),
    ).resolves.toEqual([{ id: 'event-b' }]);

    expect(typesenseSearch.searchEvents).toHaveBeenCalledWith('aula', 2);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          id: {
            in: ['event-a', 'event-b'],
          },
        },
        skip: 0,
        take: 2,
      }),
    );
  });

  it('uses scalar event snapshots for update audit records', async () => {
    const previousAudit = {
      id: 'event-1',
      name: 'Evento antigo',
      majorEventId: 'major-old',
      eventGroupId: null,
      publicationState: 'PUBLISHED',
    };
    const updatedDetail = {
      id: 'event-1',
      name: 'Evento novo',
      emoji: 'calendar',
      type: 'OTHER',
      description: null,
      shortDescription: null,
      locationDescription: null,
      majorEventId: 'major-new',
      majorEvent: {
        id: 'major-new',
        name: 'Grande evento',
      },
      eventGroupId: null,
      eventGroup: null,
      startDate: new Date('2026-06-22T12:00:00.000Z'),
      endDate: new Date('2026-06-22T13:00:00.000Z'),
    };
    const updatedAudit = {
      id: 'event-1',
      name: 'Evento novo',
      majorEventId: 'major-new',
      eventGroupId: null,
    };
    const tx = {
      event: {
        findFirst: jest.fn().mockResolvedValue(previousAudit),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValueOnce(updatedDetail).mockResolvedValueOnce(updatedAudit),
      },
      eventGroup: {
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue({ eventGroupId: null }),
      },
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const typesenseSearch = {
      upsertEvent: jest.fn(),
    };
    const frozenResources = {
      assertEventUpdateMutable: jest.fn(),
    };
    const authorizationPolicy = {
      assertPermissions: jest.fn(),
    };
    const auditLog = {
      record: jest.fn(),
    };
    const resolver = new EventsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      frozenResources as never,
      authorizationPolicy as never,
      auditLog as never,
    );

    await expect(
      resolver.updateEvent(
        'event-1',
        {
          name: 'Evento novo',
          majorEventId: 'major-new',
          eventGroupId: null,
        } as never,
        { req: { user: { sub: 'user-1' } } } as never,
      ),
    ).resolves.toBe(updatedDetail);

    expect(tx.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Evento novo',
          publicationState: 'DRAFT',
          scheduledPublishAt: null,
          publicationUpdatedBy: 'user-1',
        }),
      }),
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'user-1' },
      [Permission.Event.Update],
      {
        majorEventId: 'major-new',
      },
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        before: previousAudit,
        after: updatedAudit,
        scope: expect.objectContaining({
          majorEventId: 'major-new',
          eventGroupId: null,
        }),
      }),
      tx,
    );
    expect(auditLog.record.mock.calls[0][0].after).not.toHaveProperty('majorEvent');
    expect(auditLog.record.mock.calls[0][0].after).not.toHaveProperty('eventGroup');
  });

  it('clones selected reusable event settings without copying the online attendance code', async () => {
    const source = {
      id: 'event-source',
      name: 'Oficina de Git',
      creditMinutes: 120,
      startDate: new Date('2026-07-01T12:00:00.000Z'),
      endDate: new Date('2026-07-01T14:00:00.000Z'),
      type: 'MINICURSO',
      emoji: '🧪',
      description: 'Descrição',
      shortDescription: 'Resumo',
      latitude: -22.1,
      longitude: -51.4,
      locationDescription: 'Laboratório 1',
      majorEventId: 'major-1',
      eventGroupId: 'group-1',
      allowSubscription: true,
      subscriptionStartDate: new Date('2026-06-01T12:00:00.000Z'),
      subscriptionEndDate: new Date('2026-06-30T12:00:00.000Z'),
      slots: 40,
      autoSubscribe: true,
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldCollectAttendance: true,
      isOnlineAttendanceAllowed: true,
      shouldProvideSubscriberListToLecturer: true,
      onlineAttendanceCode: 'ABCD',
      onlineAttendanceStartDate: new Date('2026-07-01T12:00:00.000Z'),
      onlineAttendanceEndDate: new Date('2026-07-01T14:00:00.000Z'),
      publiclyVisible: false,
      youtubeCode: 'video',
      buttonText: 'Abrir',
      buttonLink: 'https://example.com',
      deletedAt: null,
      createdAt: new Date('2026-06-01T12:00:00.000Z'),
      createdById: 'creator',
      updatedAt: new Date('2026-06-01T12:00:00.000Z'),
      updatedById: 'creator',
      lecturers: [{ personId: 'person-1' }],
      certificateConfigs: [
        {
          name: 'Participante',
          certificateTemplateId: 'template-1',
          certificateText: 'Texto',
          shouldAutofillSecondPage: true,
          secondPageText: 'Verso',
          isActive: true,
          issuedTo: 'ATTENDEE',
          certificateFields: { workload: '2h' },
        },
      ],
    };
    const created = {
      ...source,
      id: 'event-clone',
      name: 'Oficina de Git 2027',
      onlineAttendanceCode: null,
      lecturers: [],
      attendances: [],
    };
    const tx = {
      event: {
        create: jest.fn().mockResolvedValue(created),
      },
      eventGroup: {
        updateMany: jest.fn(),
      },
      certificateConfig: {
        create: jest.fn(),
      },
    };
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue(source),
      },
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue({
          shouldIssueCertificate: true,
          shouldIssueCertificateForNonPayingAttendees: true,
          shouldIssueCertificateForNonSubscribedAttendees: true,
        }),
      },
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const typesenseSearch = {
      upsertEvent: jest.fn(),
    };
    const frozenResources = {
      assertEventCreateTargetsMutable: jest.fn(),
    };
    const authorizationPolicy = {
      assertPermissions: jest.fn(),
    };
    const auditLog = {
      record: jest.fn(),
    };
    const resolver = new EventsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      frozenResources as never,
      authorizationPolicy as never,
      auditLog as never,
    );

    await expect(
      resolver.cloneEvent(
        'event-source',
        {
          name: 'Oficina de Git 2027',
          parts: {
            lecturers: true,
            certificateConfig: true,
            subscriptionSettings: true,
            attendanceSettings: true,
            place: true,
            visibility: true,
          },
        },
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).resolves.toBe(created);

    expect(tx.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Oficina de Git 2027',
          allowSubscription: true,
          shouldCollectAttendance: true,
          onlineAttendanceCode: null,
          onlineAttendanceStartDate: source.onlineAttendanceStartDate,
          onlineAttendanceEndDate: source.onlineAttendanceEndDate,
          publiclyVisible: false,
          lecturers: {
            create: [
              {
                person: {
                  connect: {
                    id: 'person-1',
                  },
                },
                createdById: 'admin-1',
              },
            ],
          },
        }),
      }),
    );
    expect(tx.certificateConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Participante',
        scope: 'EVENT',
        eventId: 'event-clone',
        certificateTemplateId: 'template-1',
      }),
    });
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'admin-1' },
      [Permission.EventLecturer.Read],
      {
        eventId: 'event-source',
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'admin-1' },
      [Permission.CertificateConfig.Read],
      {
        eventId: 'event-source',
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'admin-1' },
      [Permission.Event.Create],
      {
        majorEventId: 'major-1',
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'admin-1' },
      [Permission.Event.Create],
      {
        eventGroupId: 'group-1',
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'admin-1' },
      [Permission.EventLecturer.Create],
      {
        majorEventId: 'major-1',
        eventGroupId: 'group-1',
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'admin-1' },
      [Permission.CertificateConfig.Create],
      {
        majorEventId: 'major-1',
        eventGroupId: 'group-1',
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledTimes(6);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'event-clone',
        summary: 'Evento criado como cópia de Oficina de Git.',
      }),
      tx,
    );
  });
});
