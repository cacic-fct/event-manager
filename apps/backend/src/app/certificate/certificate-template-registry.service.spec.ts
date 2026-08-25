import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CertificateTemplateRegistryService } from './certificate-template-registry.service';
import { certificateTemplateMetadataJsonSchema } from './certificate-template-metadata';

describe('CertificateTemplateRegistryService', () => {
  const originalTemplatesRoot = process.env.CERTIFICATE_TEMPLATES_ROOT;

  afterEach(() => {
    if (originalTemplatesRoot === undefined) {
      delete process.env.CERTIFICATE_TEMPLATES_ROOT;
    } else {
      process.env.CERTIFICATE_TEMPLATES_ROOT = originalTemplatesRoot;
    }
  });

  it('registers every metadata folder as a self-contained database template', async () => {
    const root = await createTemplateRoot();
    const attendeeDirectory = join(root, 'cacic-unesp', 'attendee');
    await mkdir(join(attendeeDirectory, 'assets'), { recursive: true });
    await writeFile(join(attendeeDirectory, 'certificate.html'), '<html><head></head><body>{{name}}</body></html>');
    await writeFile(join(attendeeDirectory, 'certificate.css'), '.page { background: url("./assets/page.svg"); }');
    await writeFile(join(attendeeDirectory, 'assets', 'page.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeMetadata(attendeeDirectory, {
      key: 'cacic-unesp/attendee',
      name: 'CACiC Unesp - Participante',
      description: 'Certificado para participantes',
      html: 'certificate.html',
      css: 'certificate.css',
      certificateFields: {
        'top-text': {
          label: 'Texto superior',
          type: 'string',
          required: true,
          default: 'Certificamos',
        },
      },
    });
    process.env.CERTIFICATE_TEMPLATES_ROOT = root;
    const create = jest.fn().mockImplementation(({ data }) => ({ id: 'template-1', ...data }));
    const prisma = createPrismaMock({ create });
    const typesense = { upsertCertificateTemplate: jest.fn() };
    const service = new CertificateTemplateRegistryService(prisma as never, typesense as never);

    await service.synchronizeTemplates();

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        registryKey: 'cacic-unesp/attendee',
        name: 'CACiC Unesp - Participante',
        htmlTemplate: '<html><head></head><body>{{name}}</body></html>',
        cssTemplate: expect.stringContaining('data:image/svg+xml;base64,'),
        contentChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        certificateFields: {
          'top-text': {
            label: 'Texto superior',
            type: 'string',
            required: true,
            default: 'Certificamos',
          },
        },
      }),
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
      },
    });
    expect(typesense.upsertCertificateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'template-1', name: 'CACiC Unesp - Participante' }),
    );
  });

  it('loads every repository certificate template metadata folder', async () => {
    const templatesRoot = resolve(__dirname, '../../../../../certificate-templates');
    process.env.CERTIFICATE_TEMPLATES_ROOT = templatesRoot;
    const create = jest.fn().mockImplementation(({ data }) => ({ id: data.registryKey, ...data }));
    const prisma = createPrismaMock({ create });
    const typesense = { upsertCertificateTemplate: jest.fn() };
    const service = new CertificateTemplateRegistryService(prisma as never, typesense as never);

    await service.synchronizeTemplates();

    expect(create).toHaveBeenCalledTimes(4);
    expect(create.mock.calls.map(([call]) => call.data.registryKey).sort()).toEqual([
      'cacic-unesp/attendee',
      'cacic-unesp/extension',
      'cacic-unesp/lecturer',
      'cacic-unesp/organizer',
    ]);
    expect(create.mock.calls.every(([call]) => call.data.cssTemplate.includes('data:font/woff2;base64,'))).toBe(true);
    expect(JSON.parse(await readFile(join(templatesRoot, 'certificate-template.schema.json'), 'utf8'))).toEqual(
      certificateTemplateMetadataJsonSchema,
    );
    expect(typesense.upsertCertificateTemplate).toHaveBeenCalledTimes(4);
  });

  it('creates an immutable template revision and moves configs off the issued snapshot', async () => {
    const root = await createTemplateRoot();
    const templateDirectory = join(root, 'registered');
    await mkdir(templateDirectory, { recursive: true });
    await writeFile(join(templateDirectory, 'certificate.html'), '<html><body>{{top-text}}</body></html>');
    await writeMetadata(templateDirectory, {
      key: 'registered',
      name: 'Modelo corrigido',
      html: 'certificate.html',
      certificateFields: {
        'top-text': { label: 'Texto superior', type: 'string', required: true, default: 'Texto novo' },
      },
    });
    process.env.CERTIFICATE_TEMPLATES_ROOT = root;
    const updateConfig = jest.fn();
    const updateConfigs = jest.fn();
    const createTemplate = jest.fn().mockImplementation(({ data }) => ({ id: 'template-2', ...data }));
    const updateTemplate = jest.fn().mockImplementation(({ data }) => ({ id: 'template-1', ...data }));
    const prisma = createPrismaMock({
      findUnique: jest.fn().mockResolvedValue({
        id: 'template-1',
        registryKey: 'registered',
        name: 'Modelo antigo',
        description: null,
        contentChecksum: 'old-checksum',
        isActive: true,
        deletedAt: null,
        certificateFields: {
          'top-text': { label: 'Texto superior', type: 'string', required: true, default: 'Texto antigo' },
        },
      }),
      configFindMany: jest.fn().mockResolvedValue([
        {
          id: 'config-1',
          certificateFields: { 'top-text': 'Texto antigo', custom: 'Preservar' },
        },
      ]),
      configUpdate: updateConfig,
      configUpdateMany: updateConfigs,
      create: createTemplate,
      update: updateTemplate,
    });
    const service = new CertificateTemplateRegistryService(
      prisma as never,
      {
        upsertCertificateTemplate: jest.fn(),
      } as never,
    );

    await service.synchronizeTemplates();

    expect(updateConfig).toHaveBeenCalledWith({
      where: { id: 'config-1' },
      data: { certificateFields: { custom: 'Preservar' } },
    });
    expect(updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'template-1' },
        data: expect.objectContaining({
          registryKey: expect.stringContaining('registered@old-checksum:'),
          isActive: false,
        }),
      }),
    );
    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ registryKey: 'registered', name: 'Modelo corrigido' }),
      }),
    );
    expect(updateConfigs).toHaveBeenCalledWith({
      where: { certificateTemplateId: 'template-1' },
      data: { certificateTemplateId: 'template-2' },
    });
  });

  it('fails startup when a referenced legacy template has no repository metadata', async () => {
    const root = await createTemplateRoot();
    const templateDirectory = join(root, 'registered');
    await mkdir(templateDirectory, { recursive: true });
    await writeFile(join(templateDirectory, 'certificate.html'), '<html><body>{{name}}</body></html>');
    await writeMetadata(templateDirectory, {
      key: 'registered',
      name: 'Certificado registrado',
      html: 'certificate.html',
    });
    process.env.CERTIFICATE_TEMPLATES_ROOT = root;
    const prisma = createPrismaMock({
      findMany: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'legacy-1', name: 'Certificado sem arquivos' }]),
    });
    const service = new CertificateTemplateRegistryService(
      prisma as never,
      {
        upsertCertificateTemplate: jest.fn(),
      } as never,
    );

    await expect(service.synchronizeTemplates()).rejects.toThrow(
      'Referenced certificate templates are missing repository metadata: Certificado sem arquivos (legacy-1).',
    );
  });

  it('rejects template files that escape their metadata folder', async () => {
    const root = await createTemplateRoot();
    const templateDirectory = join(root, 'unsafe');
    await mkdir(templateDirectory, { recursive: true });
    await writeFile(join(root, 'outside.html'), '<html></html>');
    await writeMetadata(templateDirectory, {
      key: 'unsafe',
      name: 'Template inseguro',
      html: '../outside.html',
    });
    process.env.CERTIFICATE_TEMPLATES_ROOT = root;
    const service = new CertificateTemplateRegistryService(
      createPrismaMock() as never,
      {
        upsertCertificateTemplate: jest.fn(),
      } as never,
    );

    await expect(service.synchronizeTemplates()).rejects.toThrow('escapes its certificate template directory');
  });

  it('rejects duplicate template names across metadata folders', async () => {
    const root = await createTemplateRoot();
    for (const directoryName of ['first', 'second']) {
      const templateDirectory = join(root, directoryName);
      await mkdir(templateDirectory, { recursive: true });
      await writeFile(join(templateDirectory, 'certificate.html'), '<html><body>{{name}}</body></html>');
      await writeMetadata(templateDirectory, {
        key: directoryName,
        name: 'Modelo compartilhado',
        html: 'certificate.html',
      });
    }
    process.env.CERTIFICATE_TEMPLATES_ROOT = root;
    const service = new CertificateTemplateRegistryService(
      createPrismaMock() as never,
      {
        upsertCertificateTemplate: jest.fn(),
      } as never,
    );

    await expect(service.synchronizeTemplates()).rejects.toThrow(
      'Certificate template name "Modelo compartilhado" is declared by first and second.',
    );
  });
  it('rejects remote resources before opening a database transaction', async () => {
    const root = await createTemplateRoot();
    const templateDirectory = join(root, 'remote');
    await mkdir(templateDirectory, { recursive: true });
    await writeFile(
      join(templateDirectory, 'certificate.html'),
      '<html><body><img src="https://example.test/logo.png" /></body></html>',
    );
    await writeMetadata(templateDirectory, {
      key: 'remote',
      name: 'Modelo remoto',
      html: 'certificate.html',
    });
    process.env.CERTIFICATE_TEMPLATES_ROOT = root;
    const prisma = createPrismaMock();
    const service = new CertificateTemplateRegistryService(
      prisma as never,
      {
        upsertCertificateTemplate: jest.fn(),
      } as never,
    );

    await expect(service.synchronizeTemplates()).rejects.toThrow('Remote static resources are not allowed');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

async function createTemplateRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'certificate-templates-'));
}

async function writeMetadata(directory: string, metadata: Record<string, unknown>): Promise<void> {
  await writeFile(join(directory, 'certificate-template.json'), JSON.stringify(metadata), 'utf8');
}

function createPrismaMock(
  overrides: {
    create?: jest.Mock;
    findMany?: jest.Mock;
    findUnique?: jest.Mock;
    update?: jest.Mock;
    configFindMany?: jest.Mock;
    configUpdate?: jest.Mock;
    configUpdateMany?: jest.Mock;
  } = {},
) {
  const certificateTemplate = {
    findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
    findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
    create: overrides.create ?? jest.fn().mockImplementation(({ data }) => ({ id: 'template-1', ...data })),
    update: overrides.update ?? jest.fn().mockImplementation(({ data }) => ({ id: 'template-1', ...data })),
    updateMany: jest.fn(),
  };
  const transaction = {
    certificateTemplate,
    certificateConfig: {
      findMany: overrides.configFindMany ?? jest.fn().mockResolvedValue([]),
      update: overrides.configUpdate ?? jest.fn(),
      updateMany: overrides.configUpdateMany ?? jest.fn(),
    },
    $executeRaw: jest.fn(),
  };
  return {
    certificateTemplate,
    $transaction: jest.fn().mockImplementation((callback) => callback(transaction)),
  };
}
