import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { MajorEventsResolver } from './resolver';

describe('MajorEventsResolver', () => {
  it('filters current major-event lookups by end date when requested', async () => {
    const endDateFrom = new Date('2026-07-05T12:00:00.000Z');
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ exists: false }]),
      majorEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn(() => false),
    };
    const authorizationPolicy = {
      accessibleMajorEventIds: jest.fn().mockResolvedValue(null),
    };
    const resolver = new MajorEventsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      authorizationPolicy as never,
    );

    await expect(
      resolver.majorEvents({ req: { user: { sub: 'admin-1' } } } as never, undefined, undefined, undefined, endDateFrom),
    ).resolves.toEqual([]);

    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          endDate: {
            gte: endDateFrom,
          },
        },
      }),
    );
  });

  it('clones reusable major-event payment, subscription, and certificate settings only', async () => {
    const source = {
      id: 'major-source',
      name: 'SECOMPP',
      emoji: '🎓',
      startDate: new Date('2026-08-01T12:00:00.000Z'),
      endDate: new Date('2026-08-05T12:00:00.000Z'),
      description: 'Semana acadêmica',
      subscriptionStartDate: new Date('2026-07-01T12:00:00.000Z'),
      subscriptionEndDate: new Date('2026-07-31T12:00:00.000Z'),
      maxCoursesPerAttendee: 2,
      maxLecturesPerAttendee: 4,
      maxUncategorizedPerAttendee: 1,
      rankedSubscriptionEnabled: true,
      buttonText: 'Site',
      buttonLink: 'https://example.com',
      contactInfo: 'eventos@example.com',
      contactType: 'EMAIL',
      isPaymentRequired: true,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      additionalPaymentInfo: 'Enviar comprovante.',
      paymentInfo: {
        id: 'payment-1',
        bankName: 'Banco',
        agency: '0001',
        account: '1234',
        holder: 'CACiC',
        document: '00.000.000/0001-00',
        pixKey: 'pix@example.com',
        pixCity: 'Presidente Prudente',
        majorEventId: 'major-source',
      },
      majorEventPrices: [
        {
          id: 'price-1',
          type: 'TIERED',
          tiers: [
            { id: 'tier-1', name: 'Aluno', value: 4000 },
            { id: 'tier-2', name: 'Professor', value: 6000 },
          ],
        },
      ],
      deletedAt: null,
      createdAt: new Date('2026-06-01T12:00:00.000Z'),
      createdById: 'creator',
      updatedAt: new Date('2026-06-01T12:00:00.000Z'),
      updatedById: 'creator',
      certificateConfigs: [
        {
          name: 'Participante',
          certificateTemplateId: 'template-1',
          certificateText: 'Texto',
          shouldAutofillSecondPage: true,
          secondPageText: null,
          isActive: true,
          issuedTo: 'ATTENDEE',
          certificateFields: null,
        },
      ],
    };
    const created = {
      ...source,
      id: 'major-clone',
      name: 'SECOMPP 2027',
      paymentInfo: {
        ...source.paymentInfo,
        id: 'payment-clone',
        majorEventId: 'major-clone',
      },
      certificateConfigs: [],
    };
    const tx = {
      majorEvent: {
        create: jest.fn().mockResolvedValue(created),
      },
      certificateConfig: {
        create: jest.fn(),
      },
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ exists: true }]),
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue(source),
      },
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const typesenseSearch = {
      upsertMajorEvent: jest.fn(),
    };
    const authorizationPolicy = {
      assertPermissions: jest.fn(),
    };
    const auditLog = {
      record: jest.fn(),
    };
    const resolver = new MajorEventsResolver(
      prisma as never,
      typesenseSearch as never,
      {} as never,
      authorizationPolicy as never,
      auditLog as never,
    );

    await expect(
      resolver.cloneMajorEvent(
        'major-source',
        {
          name: 'SECOMPP 2027',
          parts: {
            certificateConfig: true,
            subscriptionSettings: true,
            paymentSettings: true,
          },
        },
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).resolves.toBe(created);

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'admin-1' },
      [Permission.MajorEvent.Create],
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'admin-1' },
      [Permission.CertificateConfig.Read],
      { majorEventId: 'major-source' },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      { sub: 'admin-1' },
      [Permission.CertificateConfig.Create],
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledTimes(3);
    expect(tx.majorEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'SECOMPP 2027',
          subscriptionStartDate: source.subscriptionStartDate,
          subscriptionEndDate: source.subscriptionEndDate,
          isPaymentRequired: true,
          paymentInfo: {
            create: expect.objectContaining({
              bankName: 'Banco',
              pixKey: 'pix@example.com',
            }),
          },
          majorEventPrices: {
            create: expect.objectContaining({
              type: 'TIERED',
              tiers: {
                create: [
                  { name: 'Aluno', value: 4000 },
                  { name: 'Professor', value: 6000 },
                ],
              },
            }),
          },
        }),
      }),
    );
    expect(tx.certificateConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: 'MAJOR_EVENT',
        majorEventId: 'major-clone',
        certificateTemplateId: 'template-1',
      }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'major-clone',
        summary: 'Grande evento criado como cópia de SECOMPP.',
      }),
      tx,
    );
  });

  it('moves a published major event back to draft when content is edited', async () => {
    const majorEvent = {
      id: 'major-1',
      name: 'SECOMPP',
      description: 'Semana acadêmica',
      startDate: new Date('2026-08-01T12:00:00.000Z'),
      endDate: new Date('2026-08-05T12:00:00.000Z'),
      isPaymentRequired: false,
      publicationState: 'PUBLISHED',
    };
    const updatedMajorEvent = {
      ...majorEvent,
      name: 'SECOMPP 2026',
      publicationState: 'DRAFT',
    };
    const tx = {
      majorEvent: {
        update: jest.fn().mockResolvedValue({ id: 'major-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedMajorEvent),
      },
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ exists: false }]),
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue(majorEvent),
      },
      $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const typesenseSearch = {
      upsertMajorEvent: jest.fn(),
    };
    const frozenResources = {
      assertMajorEventMutable: jest.fn(),
    };
    const auditLog = {
      record: jest.fn(),
    };
    const resolver = new MajorEventsResolver(
      prisma as never,
      typesenseSearch as never,
      frozenResources as never,
      {} as never,
      auditLog as never,
    );

    await expect(
      resolver.updateMajorEvent(
        'major-1',
        {
          name: 'SECOMPP 2026',
        },
        { req: { user: { sub: 'admin-1' } } } as never,
      ),
    ).resolves.toBe(updatedMajorEvent);

    expect(tx.majorEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'SECOMPP 2026',
          publicationState: 'DRAFT',
          scheduledPublishAt: null,
          publicationUpdatedBy: 'admin-1',
        }),
      }),
    );
    expect(typesenseSearch.upsertMajorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'major-1',
        publicationState: 'DRAFT',
      }),
    );
  });

  it('returns no major events when scoped read access is empty', async () => {
    const { resolver, prisma, authorizationPolicy } = createResolver();
    authorizationPolicy.accessibleMajorEventIds.mockResolvedValue(new Set());

    await expect(resolver.majorEvents(context() as never)).resolves.toEqual([]);

    expect(prisma.majorEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('sorts searchable major events by Typesense priority after scoped access filtering', async () => {
    const { resolver, prisma, typesenseSearch, authorizationPolicy } = createResolver();
    const major1 = majorEventRecord({ id: 'major-1', name: 'First result' });
    const major2 = majorEventRecord({ id: 'major-2', name: 'Best result' });
    authorizationPolicy.accessibleMajorEventIds.mockResolvedValue(new Set(['major-1', 'major-2']));
    typesenseSearch.isEnabled.mockReturnValue(true);
    typesenseSearch.searchMajorEvents.mockResolvedValue({
      available: true,
      ids: ['major-2', 'major-1', 'hidden-major'],
    });
    prisma.majorEvent.findMany.mockResolvedValue([major1, major2]);

    await expect(
      resolver.majorEvents(context() as never, '  secompp  ', undefined, undefined, undefined, 1, 1),
    ).resolves.toEqual([major1]);

    expect(typesenseSearch.searchMajorEvents).toHaveBeenCalledWith('secompp', 2);
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          id: { in: ['major-2', 'major-1'] },
        },
        skip: 0,
        take: 2,
      }),
    );
  });

  it('falls back to database search when Typesense search is unavailable', async () => {
    const { resolver, prisma, typesenseSearch } = createResolver();
    typesenseSearch.isEnabled.mockReturnValue(true);
    typesenseSearch.searchMajorEvents.mockResolvedValue({ available: false, ids: [] });
    prisma.majorEvent.findMany.mockResolvedValue([majorEventRecord()]);

    await resolver.majorEvents(context() as never, 'SECOMPP');

    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          name: { contains: 'SECOMPP', mode: 'insensitive' },
        },
      }),
    );
  });

  it('filters database major-event search by start-date range when search indexing is disabled', async () => {
    const { resolver, prisma, typesenseSearch } = createResolver();
    const startDateFrom = new Date('2026-08-01T12:00:00.000Z');
    const startDateUntil = new Date('2026-08-31T12:00:00.000Z');
    typesenseSearch.isEnabled.mockReturnValue(false);
    prisma.majorEvent.findMany.mockResolvedValue([majorEventRecord()]);

    await resolver.majorEvents(context() as never, 'SECOMPP', startDateFrom, startDateUntil);

    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          startDate: {
            gte: startDateFrom,
            lte: startDateUntil,
          },
          name: { contains: 'SECOMPP', mode: 'insensitive' },
        },
      }),
    );
  });

  it('returns no major events when Typesense has no prioritized matches', async () => {
    const { resolver, prisma, typesenseSearch } = createResolver();
    typesenseSearch.isEnabled.mockReturnValue(true);
    typesenseSearch.searchMajorEvents.mockResolvedValue({ available: true, ids: [] });

    await expect(resolver.majorEvents(context() as never, 'SECOMPP')).resolves.toEqual([]);

    expect(prisma.majorEvent.findMany).not.toHaveBeenCalled();
  });

  it('loads one major event and hides missing major events', async () => {
    const { resolver, prisma } = createResolver();
    const majorEvent = majorEventRecord();
    prisma.majorEvent.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(majorEvent);

    await expect(resolver.majorEvent('missing-major')).rejects.toBeInstanceOf(NotFoundException);
    await expect(resolver.majorEvent('major-1')).resolves.toBe(majorEvent);

    expect(prisma.majorEvent.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: 'major-1',
          deletedAt: null,
        },
      }),
    );
  });

  it('creates draft major events with default labels, nested payment settings, and audit context', async () => {
    const { resolver, prisma, tx, typesenseSearch, auditLog } = createResolver({ paymentInfoTableExists: true });
    const endDate = new Date('2026-10-02T12:00:00.000Z');
    const created = majorEventRecord({
      id: 'major-created',
      name: 'Grande evento sem título',
      emoji: '📌',
      startDate: new Date('2026-10-01T12:00:00.000Z'),
      endDate,
    });
    tx.majorEvent.create.mockResolvedValue(created);

    await expect(
      resolver.createMajorEvent(
        {
          id: 'major-created',
          name: '   ',
          emoji: '   ',
          endDate,
          paymentInfo: {
            bankName: ' Banco ',
            agency: ' 0001 ',
            account: ' 1234 ',
            holder: ' CACiC ',
            document: ' 00.000.000/0001-00 ',
            pixKey: ' pix@example.com ',
            pixCity: ' Presidente Prudente ',
          },
          price: {
            type: 'SINGLE',
            tiers: [{ name: ' Inteira ', value: 1234.6 }],
          },
        } as never,
        { request: { user: { sub: 'request-user' } } } as never,
      ),
    ).resolves.toBe(created);

    expect(tx.majorEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'major-created',
          name: 'Grande evento sem título',
          emoji: '📌',
          startDate: new Date('2026-10-01T12:00:00.000Z'),
          endDate,
          paymentInfo: {
            create: {
              bankName: 'Banco',
              agency: '0001',
              account: '1234',
              holder: 'CACiC',
              document: '00.000.000/0001-00',
              pixKey: 'pix@example.com',
              pixCity: 'Presidente Prudente',
            },
          },
          majorEventPrices: {
            create: {
              type: 'SINGLE',
              tiers: {
                create: [{ name: 'Inteira', value: 1235 }],
              },
            },
          },
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { sub: 'request-user' },
        entityId: 'major-created',
      }),
      tx,
    );
    expect(typesenseSearch.upsertMajorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'major-created' }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects payment information when the payment info table is unavailable', async () => {
    const { resolver, prisma } = createResolver({ paymentInfoTableExists: false });

    await expect(
      resolver.createMajorEvent(
        {
          name: 'SECOMPP',
          paymentInfo: {
            bankName: 'Banco',
            agency: '0001',
            account: '1234',
            holder: 'CACiC',
            document: '00.000.000/0001-00',
          },
        } as never,
        context() as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects incomplete bank payment data and invalid price tiers', async () => {
    const { resolver } = createResolver({ paymentInfoTableExists: true });

    await expect(
      resolver.createMajorEvent(
        {
          name: 'SECOMPP',
          paymentInfo: {
            bankName: 'Banco',
            agency: '',
            account: '1234',
            holder: 'CACiC',
            document: '00.000.000/0001-00',
          },
        } as never,
        context() as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      resolver.createMajorEvent(
        {
          name: 'SECOMPP',
          paymentInfo: {
            bankName: 'Banco',
            agency: '0001',
            account: '1234',
            holder: 'CACiC',
            document: '',
          },
        } as never,
        context() as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      resolver.createMajorEvent(
        {
          name: 'SECOMPP',
          price: {
            type: 'SINGLE',
            tiers: [
              { name: 'Aluno', value: 1000 },
              { name: 'Professor', value: 2000 },
            ],
          },
        } as never,
        context() as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      resolver.createMajorEvent(
        {
          name: 'SECOMPP',
          price: {
            type: 'TIERED',
            tiers: [{ name: 'Aluno', value: -1 }],
          },
        } as never,
        context() as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates major-event content, payment info, price tiers, and certificate flags together', async () => {
    const { resolver, prisma, tx, frozenResources, typesenseSearch } = createResolver({ paymentInfoTableExists: true });
    const existing = majorEventRecord({
      isPaymentRequired: false,
      paymentInfo: paymentInfoRecord(),
      publicationState: 'SCHEDULED',
    });
    const updated = majorEventRecord({
      ...existing,
      name: 'SECOMPP atualizada',
      publicationState: 'DRAFT',
      isPaymentRequired: true,
    });
    prisma.majorEvent.findFirst.mockResolvedValue(existing);
    tx.majorEvent.update.mockResolvedValue({ id: 'major-1' });
    tx.majorEvent.findUniqueOrThrow.mockResolvedValue(updated);

    await expect(
      resolver.updateMajorEvent(
        'major-1',
        {
          id: 'major-updated',
          name: 'SECOMPP atualizada',
          emoji: '  ',
          startDate: new Date('2026-09-01T12:00:00.000Z'),
          endDate: new Date('2026-09-05T12:00:00.000Z'),
          description: 'Descrição',
          subscriptionStartDate: new Date('2026-08-01T12:00:00.000Z'),
          subscriptionEndDate: new Date('2026-08-31T12:00:00.000Z'),
          maxCoursesPerAttendee: 2,
          maxLecturesPerAttendee: 3,
          maxUncategorizedPerAttendee: 4,
          rankedSubscriptionEnabled: true,
          buttonText: 'Inscrever',
          buttonLink: 'https://example.com',
          contactInfo: 'eventos@example.com',
          contactType: 'EMAIL',
          isPaymentRequired: true,
          shouldIssueCertificateForNonPayingAttendees: true,
          shouldIssueCertificateForNonSubscribedAttendees: true,
          additionalPaymentInfo: 'Enviar comprovante.',
          paymentInfo: {
            bankName: 'Banco',
            agency: '0001',
            account: '1234',
            holder: 'CACiC',
            document: '00.000.000/0001-00',
          },
          price: {
            type: 'TIERED',
            tiers: [
              { name: 'Aluno', value: 4000 },
              { name: 'Professor', value: 6000 },
            ],
          },
        } as never,
        context() as never,
      ),
    ).resolves.toBe(updated);

    expect(frozenResources.assertMajorEventMutable).toHaveBeenCalledWith('major-1', { sub: 'admin-1' }, 'edit');
    expect(tx.majorEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'major-updated',
          emoji: '📌',
          isPaymentRequired: true,
          shouldIssueCertificateForNonPayingAttendees: false,
          shouldIssueCertificateForNonSubscribedAttendees: true,
          publicationState: 'DRAFT',
          paymentInfo: {
            upsert: {
              create: expect.objectContaining({ bankName: 'Banco' }),
              update: expect.objectContaining({ bankName: 'Banco' }),
            },
          },
        }),
      }),
    );
    expect(tx.majorEventPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tiers: {
            create: [
              { name: 'Aluno', value: 4000 },
              { name: 'Professor', value: 6000 },
            ],
          },
        }),
      }),
    );
    expect(typesenseSearch.upsertMajorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'major-1', publicationState: 'DRAFT' }),
    );
  });

  it('deletes payment info and price tiers when update inputs clear them', async () => {
    const { resolver, prisma, tx } = createResolver({ paymentInfoTableExists: true });
    const existing = majorEventRecord({
      isPaymentRequired: false,
      paymentInfo: paymentInfoRecord(),
      publicationState: 'DRAFT',
    });
    prisma.majorEvent.findFirst.mockResolvedValue(existing);
    tx.majorEvent.update.mockResolvedValue({ id: 'major-1' });
    tx.majorEvent.findUniqueOrThrow.mockResolvedValue(majorEventRecord({ paymentInfo: null }));

    await expect(
      resolver.updateMajorEvent('major-1', { paymentInfo: null, price: null } as never, context() as never),
    ).resolves.toEqual(expect.objectContaining({ id: 'major-1' }));

    expect(tx.majorEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          paymentInfo: { delete: true },
        },
      }),
    );
    expect(tx.priceTier.deleteMany).toHaveBeenCalledWith({
      where: {
        price: {
          majorEventId: 'major-1',
        },
      },
    });
    expect(tx.majorEventPrice.deleteMany).toHaveBeenCalledWith({
      where: {
        majorEventId: 'major-1',
      },
    });
  });

  it('clears existing payment info and price tiers when update inputs are empty', async () => {
    const { resolver, prisma, tx } = createResolver({ paymentInfoTableExists: true });
    const existing = majorEventRecord({
      isPaymentRequired: false,
      paymentInfo: paymentInfoRecord(),
      publicationState: 'DRAFT',
    });
    prisma.majorEvent.findFirst.mockResolvedValue(existing);
    tx.majorEvent.update.mockResolvedValue({ id: 'major-1' });
    tx.majorEvent.findUniqueOrThrow.mockResolvedValue(majorEventRecord({ paymentInfo: null }));

    await expect(
      resolver.updateMajorEvent(
        'major-1',
        {
          shouldIssueCertificateForNonPayingAttendees: true,
          paymentInfo: {
            bankName: '',
            agency: '',
            account: '',
            holder: '',
            document: '',
          },
          price: {
            type: 'TIERED',
            tiers: [],
          },
        } as never,
        context() as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: 'major-1' }));

    expect(tx.majorEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          shouldIssueCertificateForNonPayingAttendees: true,
          paymentInfo: { delete: true },
        },
      }),
    );
    expect(tx.priceTier.deleteMany).toHaveBeenCalled();
    expect(tx.majorEventPrice.deleteMany).toHaveBeenCalled();
  });

  it('throws when updating a missing major event', async () => {
    const { resolver, prisma } = createResolver();
    prisma.majorEvent.findFirst.mockResolvedValue(null);

    await expect(resolver.updateMajorEvent('missing-major', { name: 'Novo nome' }, context() as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes major events with frozen-resource, audit, and search cleanup', async () => {
    const { resolver, tx, frozenResources, typesenseSearch, auditLog } = createResolver();
    tx.majorEvent.findFirst.mockResolvedValue(majorEventRecord({ id: 'major-delete', name: 'Excluir' }));

    await expect(resolver.deleteMajorEvent('major-delete', context() as never)).resolves.toEqual({
      deleted: true,
      id: 'major-delete',
    });

    expect(frozenResources.assertMajorEventMutable).toHaveBeenCalledWith('major-delete', { sub: 'admin-1' }, 'delete');
    expect(tx.majorEvent.update).toHaveBeenCalledWith({
      where: {
        id: 'major-delete',
        deletedAt: null,
      },
      data: {
        deletedAt: expect.any(Date),
      },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'major-delete',
        summary: 'Grande evento excluído.',
        force: true,
      }),
      tx,
    );
    expect(typesenseSearch.deleteMajorEvent).toHaveBeenCalledWith('major-delete');
  });

  it('throws when deleting a missing major event', async () => {
    const { resolver, tx, typesenseSearch } = createResolver();
    tx.majorEvent.findFirst.mockResolvedValue(null);

    await expect(resolver.deleteMajorEvent('missing-major', context() as never)).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.majorEvent.update).not.toHaveBeenCalled();
    expect(typesenseSearch.deleteMajorEvent).not.toHaveBeenCalled();
  });

  it('throws when cloning a missing major event', async () => {
    const { resolver, prisma, authorizationPolicy } = createResolver();
    prisma.majorEvent.findFirst.mockResolvedValue(null);

    await expect(resolver.cloneMajorEvent('missing-major', null, context() as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(authorizationPolicy.assertPermissions).not.toHaveBeenCalled();
  });
});

function context(sub = 'admin-1') {
  return {
    req: {
      user: { sub },
    },
  };
}

function createResolver(options: { paymentInfoTableExists?: boolean } = {}) {
  const tx = {
    majorEvent: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    majorEventPrice: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    priceTier: {
      deleteMany: jest.fn(),
    },
    certificateConfig: {
      create: jest.fn(),
    },
  };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ exists: options.paymentInfoTableExists ?? false }]),
    $transaction: jest.fn((operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    majorEvent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const typesenseSearch = {
    isEnabled: jest.fn(() => false),
    searchMajorEvents: jest.fn(),
    upsertMajorEvent: jest.fn(),
    deleteMajorEvent: jest.fn(),
  };
  const frozenResources = {
    assertMajorEventMutable: jest.fn(),
  };
  const authorizationPolicy = {
    accessibleMajorEventIds: jest.fn().mockResolvedValue(null),
    assertPermissions: jest.fn(),
  };
  const auditLog = {
    record: jest.fn(),
  };
  return {
    resolver: new MajorEventsResolver(
      prisma as never,
      typesenseSearch as never,
      frozenResources as never,
      authorizationPolicy as never,
      auditLog as never,
    ),
    prisma,
    tx,
    typesenseSearch,
    frozenResources,
    authorizationPolicy,
    auditLog,
  };
}

function majorEventRecord(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-01T12:00:00.000Z');
  return {
    id: 'major-1',
    name: 'SECOMPP',
    emoji: '🎓',
    startDate: new Date('2026-08-01T12:00:00.000Z'),
    endDate: new Date('2026-08-05T12:00:00.000Z'),
    description: 'Semana acadêmica',
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    maxCoursesPerAttendee: null,
    maxLecturesPerAttendee: null,
    maxUncategorizedPerAttendee: null,
    rankedSubscriptionEnabled: false,
    buttonText: null,
    buttonLink: null,
    contactInfo: null,
    contactType: null,
    isPaymentRequired: false,
    shouldIssueCertificateForNonPayingAttendees: true,
    shouldIssueCertificateForNonSubscribedAttendees: false,
    additionalPaymentInfo: null,
    majorEventPrices: [],
    paymentInfo: null,
    publicationState: 'DRAFT',
    scheduledPublishAt: null,
    publishedAt: null,
    unpublishedAt: null,
    deletedAt: null,
    createdAt: now,
    createdById: 'admin-1',
    updatedAt: now,
    updatedById: 'admin-1',
    ...overrides,
  };
}

function paymentInfoRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    bankName: 'Banco',
    agency: '0001',
    account: '1234',
    holder: 'CACiC',
    document: '00.000.000/0001-00',
    pixKey: 'pix@example.com',
    pixCity: 'Presidente Prudente',
    majorEventId: 'major-1',
    ...overrides,
  };
}
