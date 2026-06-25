import { Permission } from '@cacic-fct/shared-permissions';
import { MajorEventsResolver } from './resolver';

describe('MajorEventsResolver', () => {
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
});
