import { CertificateIssuedTo, CertificateScope, EventType } from '@cacic-fct/shared-data-types';
import { addMinutes } from 'date-fns';
import { CertificateIssuingService } from './certificate-issuing.service';

describe('CertificateIssuingService', () => {
  const config = {
    id: 'config-1',
    certificateTemplateId: 'template-1',
  };

  it('keeps the original issue date when reissuing an unchanged certificate', async () => {
    const originalIssuedAt = new Date('2026-01-01T00:00:00.000Z');
    const recipient = {
      person: {
        id: 'person-valid',
        name: 'Valid Person',
        email: null,
        identityDocument: null,
        academicId: null,
      },
      events: [],
    };
    const certificateConfig = {
      ...mappedCertificateRecord.config,
      id: 'config-1',
      scope: CertificateScope.MAJOR_EVENT,
      majorEvent: {
        id: 'major-event-1',
        name: 'Major Event',
      },
      certificateFields: null,
    };
    const buildService = new CertificateIssuingService({} as never, {} as never, {} as never);
    const renderedData = (
      buildService as unknown as {
        buildRenderedData(config: unknown, recipient: unknown, issuedAt: Date): unknown;
      }
    ).buildRenderedData(certificateConfig, recipient, originalIssuedAt);
    const existingCertificate = {
      ...mappedCertificateRecord,
      issuedAt: originalIssuedAt,
      renderedData,
      deletedAt: null,
    };
    const prisma = {
      certificate: {
        findUnique: jest.fn().mockResolvedValue(existingCertificate),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const notifications = {
      notifyCertificateAvailable: jest.fn(),
      mapPersonToRecipient: jest.fn(),
    };
    const serviceWithNotifications = new CertificateIssuingService(
      prisma as never,
      {} as never,
      {} as never,
      notifications as never,
    );

    await expect(
      (
        serviceWithNotifications as unknown as {
          upsertCertificateForRecipient(config: unknown, recipient: unknown): Promise<unknown>;
        }
      ).upsertCertificateForRecipient(certificateConfig, recipient),
    ).resolves.toBe(existingCertificate);

    expect(prisma.certificate.create).not.toHaveBeenCalled();
    expect(prisma.certificate.update).not.toHaveBeenCalled();
    expect(notifications.notifyCertificateAvailable).not.toHaveBeenCalled();
  });

  it('keeps the original issue date when rendered data only differs by object key order', async () => {
    const originalIssuedAt = new Date('2026-01-01T00:00:00.000Z');
    const recipient = {
      person: {
        id: 'person-valid',
        name: 'Valid Person',
        email: null,
        identityDocument: null,
        academicId: null,
      },
      events: [],
    };
    const certificateConfig = {
      ...mappedCertificateRecord.config,
      id: 'config-1',
      scope: CertificateScope.MAJOR_EVENT,
      majorEvent: {
        id: 'major-event-1',
        name: 'Major Event',
      },
      certificateFields: null,
    };
    const existingCertificate = {
      ...mappedCertificateRecord,
      issuedAt: originalIssuedAt,
      renderedData: {
        templateData: {
          name: 'Valid Person',
          date: '01 de janeiro de 2026',
        },
        configId: 'config-1',
      },
      deletedAt: null,
    };
    const prisma = {
      certificate: {
        findUnique: jest.fn().mockResolvedValue(existingCertificate),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new CertificateIssuingService(prisma as never, {} as never, {} as never);
    jest
      .spyOn(
        service as unknown as {
          buildRenderedData(config: unknown, recipient: unknown, issuedAt: Date): unknown;
        },
        'buildRenderedData',
      )
      .mockReturnValue({
        configId: 'config-1',
        templateData: {
          date: '01 de janeiro de 2026',
          name: 'Valid Person',
        },
      });

    await expect(
      (
        service as unknown as {
          upsertCertificateForRecipient(config: unknown, recipient: unknown): Promise<unknown>;
        }
      ).upsertCertificateForRecipient(certificateConfig, recipient),
    ).resolves.toBe(existingCertificate);

    expect(prisma.certificate.create).not.toHaveBeenCalled();
    expect(prisma.certificate.update).not.toHaveBeenCalled();
  });

  it('lists certificates by target with normalized ids and optional config filtering', async () => {
    const prisma = {
      certificate: {
        findMany: jest.fn().mockResolvedValue([mappedCertificateRecord]),
      },
    };
    const validation = {
      assertSupportedScope: jest.fn(),
      normalizeRequiredId: jest.fn().mockReturnValue('event-1'),
    };
    const service = new CertificateIssuingService(prisma as never, validation as never, {} as never);

    await expect(service.listCertificatesByTarget(CertificateScope.EVENT, ' event-1 ', ' config-1 ', 5, 20)).resolves
      .toHaveLength(1);

    expect(validation.assertSupportedScope).toHaveBeenCalledWith(CertificateScope.EVENT);
    expect(prisma.certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          config: expect.objectContaining({
            deletedAt: null,
            id: 'config-1',
            eventId: 'event-1',
          }),
        }),
        skip: 5,
        take: 20,
      }),
    );
  });

  it('rejects person issuing when the person is missing or not eligible', async () => {
    const validation = {
      normalizeRequiredId: jest.fn((_field: string, value: string) => value),
    };
    const missingPersonService = new CertificateIssuingService(
      {
        people: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as never,
      validation as never,
      {} as never,
    );

    await expect(missingPersonService.issueForPerson('config-1', 'person-1')).rejects.toThrow(
      'Person person-1 was not found.',
    );

    const ineligibleService = new CertificateIssuingService(
      {
        people: {
          findFirst: jest.fn().mockResolvedValue({ id: 'person-1' }),
        },
      } as never,
      validation as never,
      {
        getConfigById: jest.fn().mockResolvedValue(config),
        resolveEligibleRecipients: jest.fn().mockResolvedValue([]),
      } as never,
    );

    await expect(ineligibleService.issueForPerson('config-1', 'person-1')).rejects.toThrow(
      'Person person-1 is not eligible for config config-1.',
    );
  });

  it('issues a certificate for one eligible person', async () => {
    const prisma = {
      people: {
        findFirst: jest.fn().mockResolvedValue({ id: 'person-valid' }),
      },
    };
    const validation = {
      normalizeRequiredId: jest.fn((_field: string, value: string) => value),
    };
    const recipient = {
      person: mappedCertificateRecord.person,
      events: [],
    };
    const eligibilityService = {
      getConfigById: jest.fn().mockResolvedValue(config),
      resolveEligibleRecipients: jest.fn().mockResolvedValue([recipient]),
    };
    const service = new CertificateIssuingService(prisma as never, validation as never, eligibilityService as never);
    const upsertSpy = jest
      .spyOn(service as never, 'upsertCertificateForRecipient')
      .mockResolvedValue(mappedCertificateRecord as never);

    await expect(service.issueForPerson('config-1', 'person-valid', 'admin-user')).resolves.toMatchObject({
      id: 'certificate-1',
      personId: 'person-valid',
    });

    expect(upsertSpy).toHaveBeenCalledWith(config, recipient, 'admin-user');
  });

  it('creates certificates when no previous person/config certificate exists', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T12:00:00.000Z'));
    const notifications = {
      mapPersonToRecipient: jest.fn().mockReturnValue({ subscriberId: 'user-1' }),
      notifyCertificateAvailable: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      certificate: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mappedCertificateRecord),
        update: jest.fn(),
      },
    };
    const service = new CertificateIssuingService(prisma as never, {} as never, {} as never, notifications as never);

    await expect(
      (
        service as unknown as {
          upsertCertificateForRecipient(config: unknown, recipient: unknown, issuedById?: string): Promise<unknown>;
        }
      ).upsertCertificateForRecipient(mappedCertificateRecord.config, { person: mappedCertificateRecord.person, events: [] }, 'admin-user'),
    ).resolves.toBe(mappedCertificateRecord);

    expect(prisma.certificate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personId: 'person-valid',
          configId: 'config-1',
          certificateTemplateId: 'template-1',
          issuedById: 'admin-user',
          issuedAt: new Date('2026-05-23T12:00:00.000Z'),
        }),
      }),
    );
    expect(prisma.certificate.update).not.toHaveBeenCalled();
    expect(notifications.mapPersonToRecipient).toHaveBeenCalledWith(mappedCertificateRecord.person);
    expect(notifications.notifyCertificateAvailable).toHaveBeenCalledWith({
      certificateId: 'certificate-1',
      configId: 'config-1',
      certificateName: 'Config',
      targetName: null,
      issuedAt: mappedCertificateRecord.issuedAt,
      recipient: { subscriberId: 'user-1' },
    });
    jest.useRealTimers();
  });

  it('notifies when a manual certificate is first issued', async () => {
    const notifications = {
      mapPersonToRecipient: jest.fn().mockReturnValue({ subscriberId: 'user-1' }),
      notifyCertificateAvailable: jest.fn().mockResolvedValue(undefined),
    };
    const manualCertificateRecord = {
      ...mappedCertificateRecord,
      config: {
        ...mappedCertificateRecord.config,
        issuedTo: CertificateIssuedTo.OTHER,
      },
    };
    const prisma = {
      certificate: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(manualCertificateRecord),
        update: jest.fn(),
      },
    };
    const service = new CertificateIssuingService(prisma as never, {} as never, {} as never, notifications as never);

    await (
      service as unknown as {
        upsertCertificateForRecipient(config: unknown, recipient: unknown, issuedById?: string): Promise<unknown>;
      }
    ).upsertCertificateForRecipient(manualCertificateRecord.config, { person: mappedCertificateRecord.person, events: [] });

    expect(notifications.mapPersonToRecipient).toHaveBeenCalledWith(mappedCertificateRecord.person);
    expect(notifications.notifyCertificateAvailable).toHaveBeenCalledWith({
      certificateId: 'certificate-1',
      configId: 'config-1',
      certificateName: 'Config',
      targetName: null,
      issuedAt: mappedCertificateRecord.issuedAt,
      recipient: { subscriberId: 'user-1' },
    });
  });

  it('updates soft-deleted certificates when rendered data or template changed', async () => {
    const notifications = {
      mapPersonToRecipient: jest.fn().mockReturnValue({ subscriberId: 'user-1' }),
      notifyCertificateAvailable: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      certificate: {
        findUnique: jest.fn().mockResolvedValue({
          ...mappedCertificateRecord,
          certificateTemplateId: 'old-template',
          deletedAt: new Date('2026-01-02T00:00:00.000Z'),
        }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(mappedCertificateRecord),
      },
    };
    const service = new CertificateIssuingService(prisma as never, {} as never, {} as never, notifications as never);

    await (
      service as unknown as {
        upsertCertificateForRecipient(config: unknown, recipient: unknown): Promise<unknown>;
      }
    ).upsertCertificateForRecipient(mappedCertificateRecord.config, { person: mappedCertificateRecord.person, events: [] });

    expect(prisma.certificate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'certificate-1' },
        data: expect.objectContaining({
          certificateTemplateId: 'template-1',
          deletedAt: null,
        }),
      }),
    );
    expect(notifications.notifyCertificateAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        certificateId: 'certificate-1',
        certificateName: 'Config',
        recipient: { subscriberId: 'user-1' },
      }),
    );
  });

  it('notifies when an active certificate is materially replaced', async () => {
    const notifications = {
      mapPersonToRecipient: jest.fn().mockReturnValue({ subscriberId: 'user-1' }),
      notifyCertificateAvailable: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      certificate: {
        findUnique: jest.fn().mockResolvedValue({
          ...mappedCertificateRecord,
          certificateTemplateId: 'old-template',
          deletedAt: null,
        }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(mappedCertificateRecord),
      },
    };
    const service = new CertificateIssuingService(prisma as never, {} as never, {} as never, notifications as never);

    await (
      service as unknown as {
        upsertCertificateForRecipient(config: unknown, recipient: unknown): Promise<unknown>;
      }
    ).upsertCertificateForRecipient(mappedCertificateRecord.config, { person: mappedCertificateRecord.person, events: [] });

    expect(prisma.certificate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'certificate-1' },
        data: expect.objectContaining({
          certificateTemplateId: 'template-1',
          deletedAt: null,
        }),
      }),
    );
    expect(notifications.notifyCertificateAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        certificateId: 'certificate-1',
        recipient: { subscriberId: 'user-1' },
      }),
    );
  });

  it('returns an empty result when a person has no issued certificates to refresh', async () => {
    const service = new CertificateIssuingService(
      {
        certificate: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as never,
      {
        normalizeRequiredId: jest.fn().mockReturnValue('person-1'),
      } as never,
      {} as never,
    );

    await expect(service.refreshIssuedCertificatesForPerson('person-1')).resolves.toEqual([]);
  });

  it('deletes existing certificates and rejects missing ones', async () => {
    const validation = {
      normalizeRequiredId: jest.fn((_field: string, value: string) => value.trim()),
    };
    const prisma = {
      certificate: {
        updateMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
      },
    };
    const service = new CertificateIssuingService(prisma as never, validation as never, {} as never);

    await expect(service.deleteCertificate(' certificate-1 ')).resolves.toEqual({
      deleted: true,
      id: 'certificate-1',
    });
    await expect(service.deleteCertificate('missing-certificate')).rejects.toThrow(
      'Certificate missing-certificate not found.',
    );
  });
  const mappedCertificateRecord = {
    id: 'certificate-1',
    personId: 'person-valid',
    person: {
      id: 'person-valid',
      name: 'Valid Person',
      email: null,
      secondaryEmails: [],
      phone: null,
      identityDocument: null,
      academicId: null,
      userId: null,
      mergedIntoId: null,
      externalRef: null,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdById: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedById: null,
    },
    configId: 'config-1',
    config: {
      id: 'config-1',
      name: 'Config',
      scope: 'MAJOR_EVENT',
      majorEventId: null,
      majorEvent: null,
      eventGroupId: null,
      eventGroup: null,
      eventId: null,
      event: null,
      certificateTemplateId: 'template-1',
      certificateTemplate: {
        id: 'template-1',
        name: 'Template',
        description: null,
        version: 1,
        isActive: true,
        certificateFields: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        createdById: null,
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedById: null,
        deletedAt: null,
      },
      certificateText: null,
      shouldAutofillSecondPage: true,
      secondPageText: null,
      isActive: true,
      issuedTo: 'ATTENDEE',
      certificateFields: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdById: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedById: null,
      deletedAt: null,
    },
    renderedData: {},
    issuedAt: new Date('2026-01-01T00:00:00.000Z'),
    issuedById: null,
    certificateTemplateId: 'template-1',
    certificateTemplate: {
      id: 'template-1',
      name: 'Template',
      description: null,
      version: 1,
      isActive: true,
      certificateFields: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdById: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedById: null,
      deletedAt: null,
    },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  };

  it('soft-deletes invalid certificates during issueMissedCertificates', async () => {
    const prisma = {
      certificate: {
        findMany: jest.fn().mockResolvedValue([{ personId: 'person-valid' }, { personId: 'person-invalid' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const validation = {
      normalizeRequiredId: jest.fn().mockReturnValue('config-1'),
    };
    const eligibilityService = {
      getConfigById: jest.fn().mockResolvedValue(config),
      resolveEligibleRecipients: jest.fn().mockResolvedValue([
        {
          person: { id: 'person-valid' },
          events: [],
        },
      ]),
    };

    const service = new CertificateIssuingService(prisma as never, validation as never, eligibilityService as never);
    const upsertSpy = jest
      .spyOn(service as never, 'upsertCertificateForRecipient')
      .mockResolvedValue(mappedCertificateRecord as never);

    await service.issueMissedCertificates('config-1');

    expect(prisma.certificate.updateMany).toHaveBeenCalledWith({
      where: {
        configId: 'config-1',
        deletedAt: null,
        personId: {
          in: ['person-invalid'],
        },
      },
      data: {
        deletedAt: expect.any(Date),
      },
    });
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes all existing certificates when no recipients are eligible', async () => {
    const prisma = {
      certificate: {
        findMany: jest.fn().mockResolvedValue([{ personId: 'person-a' }, { personId: 'person-b' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const validation = {
      normalizeRequiredId: jest.fn().mockReturnValue('config-1'),
    };
    const eligibilityService = {
      getConfigById: jest.fn().mockResolvedValue(config),
      resolveEligibleRecipients: jest.fn().mockResolvedValue([]),
    };

    const service = new CertificateIssuingService(prisma as never, validation as never, eligibilityService as never);
    const upsertSpy = jest.spyOn(service as never, 'upsertCertificateForRecipient');

    await expect(service.issueMissedCertificates('config-1')).resolves.toEqual([]);
    expect(prisma.certificate.updateMany).toHaveBeenCalledWith({
      where: {
        configId: 'config-1',
        deletedAt: null,
        personId: {
          in: ['person-a', 'person-b'],
        },
      },
      data: {
        deletedAt: expect.any(Date),
      },
    });
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('keeps and refreshes existing manual certificates when issuing missed certificates', async () => {
    const prisma = {
      certificate: {
        findMany: jest.fn().mockResolvedValue([{ personId: 'person-a' }, { personId: 'person-b' }]),
        updateMany: jest.fn(),
      },
    };
    const manualConfig = {
      ...config,
      issuedTo: 'OTHER',
    };
    const validation = {
      normalizeRequiredId: jest.fn().mockReturnValue('config-1'),
    };
    const eligibilityService = {
      getConfigById: jest.fn().mockResolvedValue(manualConfig),
      resolveEligibleRecipients: jest
        .fn()
        .mockResolvedValueOnce([{ person: { id: 'person-a' }, events: [] }])
        .mockResolvedValueOnce([{ person: { id: 'person-b' }, events: [] }]),
    };

    const service = new CertificateIssuingService(prisma as never, validation as never, eligibilityService as never);
    const upsertSpy = jest
      .spyOn(service as never, 'upsertCertificateForRecipient')
      .mockResolvedValue(mappedCertificateRecord as never);

    await expect(service.issueMissedCertificates('config-1')).resolves.toHaveLength(2);
    expect(prisma.certificate.updateMany).not.toHaveBeenCalled();
    expect(eligibilityService.resolveEligibleRecipients).toHaveBeenCalledWith(manualConfig, 'person-a');
    expect(eligibilityService.resolveEligibleRecipients).toHaveBeenCalledWith(manualConfig, 'person-b');
    expect(upsertSpy).toHaveBeenCalledTimes(2);
  });

  it('reissues certificates for every certificate config', async () => {
    const prisma = {
      certificateConfig: {
        findMany: jest.fn().mockResolvedValue([{ ...config, id: 'config-1' }, { ...config, id: 'config-2' }]),
      },
      certificate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const eligibilityService = {
      resolveEligibleRecipients: jest
        .fn()
        .mockResolvedValueOnce([{ person: { id: 'person-a' }, events: [] }])
        .mockResolvedValueOnce([
          { person: { id: 'person-b' }, events: [] },
          { person: { id: 'person-c' }, events: [] },
        ]),
    };

    const service = new CertificateIssuingService(prisma as never, {} as never, eligibilityService as never);
    const upsertSpy = jest
      .spyOn(service as never, 'upsertCertificateForRecipient')
      .mockResolvedValue(mappedCertificateRecord as never);

    await expect(service.reissueAllCertificates('admin-user')).resolves.toEqual({
      configCount: 2,
      certificateCount: 3,
    });

    expect(prisma.certificateConfig.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
      },
      select: expect.any(Object),
      orderBy: {
        createdAt: 'asc',
      },
    });
    expect(upsertSpy).toHaveBeenCalledTimes(3);
  });

  it('refreshes only existing active certificates for a person without deleting ineligible ones', async () => {
    const prisma = {
      certificate: {
        findMany: jest.fn().mockResolvedValue([{ configId: 'config-1' }, { configId: 'config-2' }]),
      },
    };
    const validation = {
      normalizeRequiredId: jest.fn().mockReturnValue('person-valid'),
    };
    const eligibilityService = {
      getConfigById: jest.fn().mockImplementation((configId: string) => Promise.resolve({ ...config, id: configId })),
      resolveEligibleRecipients: jest
        .fn()
        .mockResolvedValueOnce([
          {
            person: { id: 'person-valid' },
            events: [],
          },
        ])
        .mockResolvedValueOnce([]),
    };

    const service = new CertificateIssuingService(prisma as never, validation as never, eligibilityService as never);
    const upsertSpy = jest
      .spyOn(service as never, 'upsertCertificateForRecipient')
      .mockResolvedValue(mappedCertificateRecord as never);

    await expect(service.refreshIssuedCertificatesForPerson('person-valid', 'user-1')).resolves.toHaveLength(1);

    expect(prisma.certificate.findMany).toHaveBeenCalledWith({
      where: {
        personId: 'person-valid',
        deletedAt: null,
        config: {
          deletedAt: null,
          isActive: true,
        },
        person: {
          deletedAt: null,
        },
      },
      select: {
        configId: true,
      },
      orderBy: {
        issuedAt: 'asc',
      },
    });
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'config-1' }),
      expect.objectContaining({ person: { id: 'person-valid' } }),
      'user-1',
    );
  });

  it('refreshes target certificates from source and target configs after people merge', async () => {
    const prisma = {
      certificate: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ configId: 'config-1' }, { configId: 'config-2' }, { configId: 'config-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const validation = {
      normalizeRequiredId: jest.fn().mockImplementation((_field: string, value: string) => value),
    };
    const eligibilityService = {
      getConfigById: jest.fn().mockImplementation((configId: string) => Promise.resolve({ ...config, id: configId })),
      resolveEligibleRecipients: jest.fn().mockResolvedValue([
        {
          person: { id: 'target-person' },
          events: [],
        },
      ]),
    };

    const service = new CertificateIssuingService(prisma as never, validation as never, eligibilityService as never);
    const upsertSpy = jest
      .spyOn(service as never, 'upsertCertificateForRecipient')
      .mockResolvedValue(mappedCertificateRecord as never);

    await service.refreshIssuedCertificatesAfterPeopleMerge('target-person', 'source-person', 'admin-user');

    expect(upsertSpy).toHaveBeenCalledTimes(2);
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'config-1' }),
      expect.objectContaining({ person: { id: 'target-person' } }),
      'admin-user',
    );
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'config-2' }),
      expect.objectContaining({ person: { id: 'target-person' } }),
      'admin-user',
    );
    expect(prisma.certificate.updateMany).toHaveBeenCalledWith({
      where: {
        personId: 'source-person',
        deletedAt: null,
      },
      data: {
        deletedAt: expect.any(Date),
      },
    });
  });

  it('prints every date for completed grouped minicourse events', () => {
    const service = new CertificateIssuingService({} as never, {} as never, {} as never);
    const eventGroup = {
      id: 'event-group-1',
      name: 'Grouped minicourse',
    };
    const events = [
      {
        id: 'event-1',
        name: 'Grouped minicourse day 1',
        creditMinutes: 120,
        startDate: new Date('2026-01-02T10:00:00.000Z'),
        type: EventType.MINICURSO,
        eventGroupId: eventGroup.id,
        eventGroup,
      },
      {
        id: 'event-2',
        name: 'Grouped minicourse day 2',
        creditMinutes: 120,
        startDate: new Date('2026-01-03T10:00:00.000Z'),
        type: EventType.MINICURSO,
        eventGroupId: eventGroup.id,
        eventGroup,
      },
    ];

    expect(
      (
        service as unknown as {
          buildMinicursoLines(events: unknown[]): string[];
        }
      ).buildMinicursoLines(events),
    ).toEqual(['• 02/01/2026, 03/01/2026 - Grouped minicourse - Carga horária: 4 horas']);
  });

  it('autofills the second page with event information by default', () => {
    const service = new CertificateIssuingService({} as never, {} as never, {} as never);
    const renderedData = (
      service as unknown as {
        buildRenderedData(config: unknown, recipient: unknown, issuedAt: Date): { templateData: Record<string, string> };
      }
    ).buildRenderedData(
      {
        ...mappedCertificateRecord.config,
        scope: CertificateScope.EVENT,
        shouldAutofillSecondPage: true,
        secondPageText: 'Texto manual ignorado',
        event: {
          id: 'event-1',
          name: 'Palestra Principal',
        },
      },
      {
        person: {
          id: 'person-valid',
          name: 'Valid Person',
          email: null,
          identityDocument: '12345678901',
          academicId: null,
        },
        events: [
          {
            id: 'event-1',
            name: 'Palestra Principal',
            creditMinutes: 60,
            startDate: new Date('2026-01-02T10:00:00.000Z'),
            endDate: new Date('2026-01-02T11:00:00.000Z'),
            type: EventType.PALESTRA,
            eventGroupId: null,
            eventGroup: null,
          },
        ],
      },
      new Date('2026-01-05T00:00:00.000Z'),
    );

    expect(renderedData.templateData.name).toBe('Valid Person');
    expect(renderedData.templateData['majorEvent or event name']).toBe('Palestra Principal');
    expect(renderedData.templateData.second_page_content).toContain('Palestras:');
    expect(renderedData.templateData.second_page_content).toContain('Palestra Principal');
    expect(renderedData.templateData.second_page_content).not.toContain('Texto manual ignorado');
  });

  it('uses custom second page text when event autofill is disabled', () => {
    const service = new CertificateIssuingService({} as never, {} as never, {} as never);
    const renderedData = (
      service as unknown as {
        buildRenderedData(config: unknown, recipient: unknown, issuedAt: Date): { templateData: Record<string, string> };
      }
    ).buildRenderedData(
      {
        ...mappedCertificateRecord.config,
        scope: CertificateScope.EVENT,
        shouldAutofillSecondPage: false,
        secondPageText: 'Texto livre do verso',
        event: {
          id: 'event-1',
          name: 'Palestra Principal',
        },
      },
      {
        person: {
          id: 'person-valid',
          name: 'Valid Person',
          email: null,
          identityDocument: null,
          academicId: null,
        },
        events: [
          {
            id: 'event-1',
            name: 'Palestra Principal',
            creditMinutes: 60,
            startDate: new Date('2026-01-02T10:00:00.000Z'),
            endDate: new Date('2026-01-02T11:00:00.000Z'),
            type: EventType.PALESTRA,
            eventGroupId: null,
            eventGroup: null,
          },
        ],
      },
      new Date('2026-01-05T00:00:00.000Z'),
    );

    expect(renderedData.templateData.second_page_content).toBe('Texto livre do verso');
    expect(renderedData.templateData.name).toBe('Valid Person');
    expect(renderedData.templateData['majorEvent or event name']).toBe('Palestra Principal');
  });

  it('builds lecturer participation text from event category fields and template fallbacks', () => {
    const service = new CertificateIssuingService({} as never, {} as never, {} as never);
    const render = (certificateFields: Record<string, string>) =>
      (
        service as unknown as {
          buildRenderedData(config: unknown, recipient: unknown, issuedAt: Date): { templateData: Record<string, string> };
        }
      ).buildRenderedData(
        {
          ...mappedCertificateRecord.config,
          scope: CertificateScope.EVENT_GROUP,
          issuedTo: CertificateIssuedTo.LECTURER,
          certificateFields,
          certificateTemplate: {
            certificateFields: {
              'top-text': 'Modelo topo',
              'bottom-text': 'Modelo base',
            },
          },
          eventGroup: {
            id: 'event-group-1',
            name: 'Grupo de eventos',
          },
        },
        {
          person: {
            id: 'person-valid',
            name: 'Valid Person',
            email: null,
            identityDocument: 'ABC-42',
            academicId: null,
          },
          events: [],
        },
        new Date('2026-01-05T00:00:00.000Z'),
      ).templateData;

    expect(render({ __lecturerEventCategory: 'PALESTRA', 'top-text': 'Topo customizado' })).toMatchObject({
      participation_type: 'Certificamos a participação como palestrante de:',
      'top-text': 'Topo customizado',
      'bottom-text': 'Modelo base',
      document: 'Documento: ABC-42',
    });
    expect(render({ __lecturerEventCategory: 'MINICURSO' }).participation_type).toBe(
      'Certificamos a participação como ministrante de:',
    );
    expect(render({ __lecturerEventCategory: 'OTHER' }).participation_type).toBe(
      'Certificamos a participação como palestrante/ministrante de:',
    );
  });

  it('uses current template field definition defaults when config fields are unchanged', () => {
    const service = new CertificateIssuingService({} as never, {} as never, {} as never);
    const renderedData = (
      service as unknown as {
        buildRenderedData(config: unknown, recipient: unknown, issuedAt: Date): { templateData: Record<string, string> };
      }
    ).buildRenderedData(
      {
        ...mappedCertificateRecord.config,
        scope: CertificateScope.EVENT,
        issuedTo: CertificateIssuedTo.ATTENDEE,
        certificateFields: null,
        certificateTemplate: {
          certificateFields: {
            'top-text': {
              label: 'Texto em cima do nome',
              type: 'string',
              required: true,
              default: 'Certificamos a organização de',
            },
            'bottom-text': {
              label: 'Texto embaixo do nome',
              type: 'string',
              required: true,
              default: 'como organizador do evento',
            },
          },
        },
        event: {
          id: 'event-1',
          name: 'Evento de teste',
          creditMinutes: 60,
          startDate: new Date('2026-01-02T10:00:00.000Z'),
          endDate: new Date('2026-01-02T11:00:00.000Z'),
          type: EventType.OTHER,
          eventGroupId: null,
          eventGroup: null,
        },
      },
      {
        person: {
          id: 'person-valid',
          name: 'Valid Person',
          email: null,
          identityDocument: null,
          academicId: null,
        },
        events: [],
      },
      new Date('2026-01-05T00:00:00.000Z'),
    );

    expect(renderedData.templateData).toMatchObject({
      'top-text': 'Certificamos a organização de',
      'bottom-text': 'como organizador do evento',
    });
  });

  it('uses explicit config field values even when they match template defaults', () => {
    const service = new CertificateIssuingService({} as never, {} as never, {} as never);
    const renderedData = (
      service as unknown as {
        buildRenderedData(config: unknown, recipient: unknown, issuedAt: Date): { templateData: Record<string, string> };
      }
    ).buildRenderedData(
      {
        ...mappedCertificateRecord.config,
        scope: CertificateScope.EVENT,
        issuedTo: CertificateIssuedTo.ATTENDEE,
        certificateFields: {
          'top-text': 'Certificamos a organização de',
          'bottom-text': 'como organizador do evento',
        },
        certificateTemplate: {
          certificateFields: {
            'top-text': {
              label: 'Texto em cima do nome',
              type: 'string',
              required: true,
              default: 'Certificamos a organização de',
            },
            'bottom-text': {
              label: 'Texto embaixo do nome',
              type: 'string',
              required: true,
              default: 'como organizador do evento',
            },
          },
        },
        event: {
          id: 'event-1',
          name: 'Evento de teste',
          creditMinutes: 60,
          startDate: new Date('2026-01-02T10:00:00.000Z'),
          endDate: new Date('2026-01-02T11:00:00.000Z'),
          type: EventType.OTHER,
          eventGroupId: null,
          eventGroup: null,
        },
      },
      {
        person: {
          id: 'person-valid',
          name: 'Valid Person',
          email: null,
          identityDocument: null,
          academicId: null,
        },
        events: [],
      },
      new Date('2026-01-05T00:00:00.000Z'),
    );

    expect(renderedData.templateData).toMatchObject({
      'top-text': 'Certificamos a organização de',
      'bottom-text': 'como organizador do evento',
    });
  });

  it('renders minicourse, lecture, and other event sections together', () => {
    const service = new CertificateIssuingService({} as never, {} as never, {} as never);
    const renderedData = (
      service as unknown as {
        buildRenderedData(config: unknown, recipient: unknown, issuedAt: Date): { templateData: Record<string, string> };
      }
    ).buildRenderedData(
      {
        ...mappedCertificateRecord.config,
        scope: CertificateScope.MAJOR_EVENT,
        shouldAutofillSecondPage: true,
        majorEvent: {
          id: 'major-event-1',
          name: 'Semana da Computacao',
        },
      },
      {
        person: {
          id: 'person-valid',
          name: 'Valid Person',
          email: null,
          identityDocument: null,
          academicId: null,
        },
        events: [
          eventRecord('minicurso-1', 'Minicurso solo', EventType.MINICURSO, 90, '2026-01-02T10:00:00.000Z'),
          eventRecord('palestra-1', 'Palestra principal', EventType.PALESTRA, 60, '2026-01-03T10:00:00.000Z'),
          eventRecord('other-1', 'Mesa redonda', EventType.OTHER, 45, '2026-01-04T10:00:00.000Z'),
        ],
      },
      new Date('2026-01-05T00:00:00.000Z'),
    );

    expect(renderedData.templateData.content).toContain('Minicursos:');
    expect(renderedData.templateData.content).toContain('Palestras:');
    expect(renderedData.templateData.content).toContain('Mesa redonda');
    expect(renderedData.templateData.minicursosSection).toContain('1 hora e 30 minutos');
    expect(renderedData.templateData.palestrasSection).toContain('1 hora');
    expect(renderedData.templateData.otherEventTypesList).toContain('45 minutos');
  });

  describe('formatCargaHoraria', () => {
    let service: CertificateIssuingService;

    beforeEach(() => {
      service = new CertificateIssuingService({} as never, {} as never, {} as never);
    });

    it('formats zero minutes as "0 minutos"', () => {
      expect(
        (
          service as unknown as {
            formatCargaHoraria(minutes: number): string;
          }
        ).formatCargaHoraria(0),
      ).toBe('0 minutos');
    });

    it('formats less than 1 hour as minutes only with singular form', () => {
      expect(
        (
          service as unknown as {
            formatCargaHoraria(minutes: number): string;
          }
        ).formatCargaHoraria(1),
      ).toBe('1 minuto');
    });

    it('formats less than 1 hour as minutes only with plural form', () => {
      expect(
        (
          service as unknown as {
            formatCargaHoraria(minutes: number): string;
          }
        ).formatCargaHoraria(45),
      ).toBe('45 minutos');
    });

    it('formats exactly 1 hour with singular form', () => {
      expect(
        (
          service as unknown as {
            formatCargaHoraria(minutes: number): string;
          }
        ).formatCargaHoraria(60),
      ).toBe('1 hora');
    });

    it('formats multiple round hours with plural form', () => {
      expect(
        (
          service as unknown as {
            formatCargaHoraria(minutes: number): string;
          }
        ).formatCargaHoraria(240),
      ).toBe('4 horas');
    });

    it('formats 1 hour and 1 minute with singular forms', () => {
      expect(
        (
          service as unknown as {
            formatCargaHoraria(minutes: number): string;
          }
        ).formatCargaHoraria(61),
      ).toBe('1 hora e 1 minuto');
    });

    it('formats 1 hour and multiple minutes with mixed forms', () => {
      expect(
        (
          service as unknown as {
            formatCargaHoraria(minutes: number): string;
          }
        ).formatCargaHoraria(90),
      ).toBe('1 hora e 30 minutos');
    });

    it('formats multiple hours and multiple minutes with plural forms', () => {
      expect(
        (
          service as unknown as {
            formatCargaHoraria(minutes: number): string;
          }
        ).formatCargaHoraria(150),
      ).toBe('2 horas e 30 minutos');
    });
  });
});

function eventRecord(id: string, name: string, type: EventType, creditMinutes: number, startDate: string) {
  return {
    id,
    name,
    creditMinutes,
    startDate: new Date(startDate),
    endDate: addMinutes(new Date(startDate), creditMinutes),
    type,
    eventGroupId: null,
    eventGroup: null,
  };
}
