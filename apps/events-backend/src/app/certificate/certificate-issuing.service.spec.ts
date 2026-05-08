import { CertificateScope, EventType } from '@cacic-eventos/shared-data-types';
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
    const buildService = new CertificateIssuingService(
      {} as never,
      {} as never,
      {} as never,
    );
    const renderedData = (
      buildService as unknown as {
        buildRenderedData(
          config: unknown,
          recipient: unknown,
          issuedAt: Date,
        ): unknown;
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
    const service = new CertificateIssuingService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as {
          upsertCertificateForRecipient(
            config: unknown,
            recipient: unknown,
          ): Promise<unknown>;
        }
      ).upsertCertificateForRecipient(certificateConfig, recipient),
    ).resolves.toBe(existingCertificate);

    expect(prisma.certificate.create).not.toHaveBeenCalled();
    expect(prisma.certificate.update).not.toHaveBeenCalled();
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
        findMany: jest
          .fn()
          .mockResolvedValue([
            { personId: 'person-valid' },
            { personId: 'person-invalid' },
          ]),
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

    const service = new CertificateIssuingService(
      prisma as never,
      validation as never,
      eligibilityService as never,
    );
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
        findMany: jest
          .fn()
          .mockResolvedValue([
            { personId: 'person-a' },
            { personId: 'person-b' },
          ]),
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

    const service = new CertificateIssuingService(
      prisma as never,
      validation as never,
      eligibilityService as never,
    );
    const upsertSpy = jest.spyOn(
      service as never,
      'upsertCertificateForRecipient',
    );

    await expect(service.issueMissedCertificates('config-1')).resolves.toEqual(
      [],
    );
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

  it('refreshes only existing active certificates for a person without deleting ineligible ones', async () => {
    const prisma = {
      certificate: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { configId: 'config-1' },
            { configId: 'config-2' },
          ]),
      },
    };
    const validation = {
      normalizeRequiredId: jest.fn().mockReturnValue('person-valid'),
    };
    const eligibilityService = {
      getConfigById: jest
        .fn()
        .mockImplementation((configId: string) =>
          Promise.resolve({ ...config, id: configId }),
        ),
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

    const service = new CertificateIssuingService(
      prisma as never,
      validation as never,
      eligibilityService as never,
    );
    const upsertSpy = jest
      .spyOn(service as never, 'upsertCertificateForRecipient')
      .mockResolvedValue(mappedCertificateRecord as never);

    await expect(
      service.refreshIssuedCertificatesForPerson('person-valid', 'user-1'),
    ).resolves.toHaveLength(1);

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
          .mockResolvedValue([
            { configId: 'config-1' },
            { configId: 'config-2' },
            { configId: 'config-1' },
          ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const validation = {
      normalizeRequiredId: jest
        .fn()
        .mockImplementation((_field: string, value: string) => value),
    };
    const eligibilityService = {
      getConfigById: jest
        .fn()
        .mockImplementation((configId: string) =>
          Promise.resolve({ ...config, id: configId }),
        ),
      resolveEligibleRecipients: jest.fn().mockResolvedValue([
        {
          person: { id: 'target-person' },
          events: [],
        },
      ]),
    };

    const service = new CertificateIssuingService(
      prisma as never,
      validation as never,
      eligibilityService as never,
    );
    const upsertSpy = jest
      .spyOn(service as never, 'upsertCertificateForRecipient')
      .mockResolvedValue(mappedCertificateRecord as never);

    await service.refreshIssuedCertificatesAfterPeopleMerge(
      'target-person',
      'source-person',
      'admin-user',
    );

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
    const service = new CertificateIssuingService(
      {} as never,
      {} as never,
      {} as never,
    );
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
    ).toEqual([
      '• 02/01/26, 03/01/26 - Grouped minicourse - Carga horária: 4 horas',
    ]);
  });
});
