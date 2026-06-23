import { CertificateConfigsService } from './certificate-configs.service';

describe('CertificateConfigsService', () => {
  it('uses Typesense rank for template searches before applying pagination', async () => {
    const prisma = createPrisma({
      certificateTemplate: {
        findMany: jest.fn().mockResolvedValue([
          createTemplate({ id: 'template-b', name: 'B' }),
        ]),
      },
    });
    const typesenseSearch = createTypesenseSearch({
      available: true,
      ids: ['template-b'],
    });
    const service = new CertificateConfigsService(prisma as never, {} as never, {} as never, typesenseSearch as never);

    await expect(service.listTemplates(' certificado ', false, 1, 1)).resolves.toEqual([
      expect.objectContaining({
        id: 'template-b',
      }),
    ]);

    expect(typesenseSearch.searchCertificateTemplates).toHaveBeenCalledWith('certificado', {
      filterBy: 'isActive:=true',
      limit: 1,
      offset: 1,
    });
    expect(prisma.certificateTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          isActive: true,
          id: {
            in: ['template-b'],
          },
        },
        skip: 0,
        take: 1,
      }),
    );
  });

  it('returns an empty template page when Typesense has no matches', async () => {
    const prisma = createPrisma();
    const typesenseSearch = createTypesenseSearch({
      available: true,
      ids: [],
    });
    const service = new CertificateConfigsService(prisma as never, {} as never, {} as never, typesenseSearch as never);

    await expect(service.listTemplates('ausente', true, 0, 10)).resolves.toEqual([]);

    expect(prisma.certificateTemplate.findMany).not.toHaveBeenCalled();
  });

  it('falls back to SQL template search when Typesense is unavailable', async () => {
    const prisma = createPrisma({
      certificateTemplate: {
        findMany: jest.fn().mockResolvedValue([createTemplate({ id: 'template-1', description: null })]),
      },
    });
    const typesenseSearch = createTypesenseSearch({
      available: false,
      ids: [],
    });
    const service = new CertificateConfigsService(prisma as never, {} as never, {} as never, typesenseSearch as never);

    await expect(service.listTemplates('modelo', true, 5, 15)).resolves.toEqual([
      expect.objectContaining({
        id: 'template-1',
        description: undefined,
      }),
    ]);

    expect(prisma.certificateTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          name: {
            contains: 'modelo',
            mode: 'insensitive',
          },
        },
        skip: 5,
        take: 15,
      }),
    );
  });

  it('falls back to SQL template search when Typesense is disabled', async () => {
    const prisma = createPrisma({
      certificateTemplate: {
        findMany: jest.fn().mockResolvedValue([createTemplate({ id: 'template-disabled' })]),
      },
    });
    const service = new CertificateConfigsService(prisma as never, {} as never, {} as never);

    await expect(service.listTemplates('modelo', false, 0, 10)).resolves.toEqual([
      expect.objectContaining({
        id: 'template-disabled',
      }),
    ]);

    expect(prisma.certificateTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          isActive: true,
          name: {
            contains: 'modelo',
            mode: 'insensitive',
          },
        },
        skip: 0,
        take: 10,
      }),
    );
  });
});

function createPrisma(overrides: {
  certificateTemplate?: Partial<ReturnType<typeof basePrisma>['certificateTemplate']>;
  certificateConfig?: Partial<ReturnType<typeof basePrisma>['certificateConfig']>;
  certificate?: Partial<ReturnType<typeof basePrisma>['certificate']>;
} = {}) {
  const prisma = basePrisma();

  return {
    ...prisma,
    certificateTemplate: {
      ...prisma.certificateTemplate,
      ...overrides.certificateTemplate,
    },
    certificateConfig: {
      ...prisma.certificateConfig,
      ...overrides.certificateConfig,
    },
    certificate: {
      ...prisma.certificate,
      ...overrides.certificate,
    },
  };
}

function basePrisma() {
  return {
    certificateTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    certificateConfig: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    certificate: {
      updateMany: jest.fn(),
    },
  };
}

function createTypesenseSearch(result: { available: boolean; ids: string[] }) {
  return {
    isEnabled: jest.fn().mockReturnValue(true),
    searchCertificateTemplates: jest.fn().mockResolvedValue(result),
  };
}

function createTemplate(overrides: Partial<ReturnType<typeof baseTemplate>> = {}) {
  return {
    ...baseTemplate(),
    ...overrides,
  };
}

function baseTemplate() {
  return {
    id: 'template-1',
    name: 'Template',
    description: 'Descricao',
    version: 1,
    isActive: true,
    certificateFields: null,
    createdAt: new Date('2026-06-01T12:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-06-02T12:00:00.000Z'),
    updatedById: null,
    deletedAt: null,
  };
}
