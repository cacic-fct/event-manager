import { CertificateIssuingService } from './certificate-issuing.service';

describe('CertificateIssuingService', () => {
  const config = {
    id: 'config-1',
    certificateTemplateId: 'template-1',
  };
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

  it('hard-deletes invalid certificates during issueMissedCertificates', async () => {
    const prisma = {
      certificate: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { personId: 'person-valid' },
            { personId: 'person-invalid' },
          ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
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

    expect(prisma.certificate.deleteMany).toHaveBeenCalledWith({
      where: {
        configId: 'config-1',
        personId: {
          in: ['person-invalid'],
        },
      },
    });
    expect(upsertSpy).toHaveBeenCalledTimes(1);
  });

  it('hard-deletes all existing certificates when no recipients are eligible', async () => {
    const prisma = {
      certificate: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { personId: 'person-a' },
            { personId: 'person-b' },
          ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
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
    expect(prisma.certificate.deleteMany).toHaveBeenCalledWith({
      where: {
        configId: 'config-1',
        personId: {
          in: ['person-a', 'person-b'],
        },
      },
    });
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
