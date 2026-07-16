import { CertificateIssuedTo, CertificateScope } from '@cacic-fct/shared-data-types';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CertificateConfigsService } from './certificate-configs.service';
import { CertificateValidationService } from './certificate-validation.service';

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

  it('lists standalone certificate folders with normalized search and pagination', async () => {
    const prisma = createPrisma({
      certificateFolder: {
        findMany: jest.fn().mockResolvedValue([createFolder({ id: 'folder-1', name: 'Complementares' })]),
      },
    });
    const service = new CertificateConfigsService(prisma as never, {} as never, {} as never);

    await expect(service.listFolders(' complementares ', 5, 10)).resolves.toEqual([
      expect.objectContaining({
        id: 'folder-1',
        name: 'Complementares',
      }),
    ]);

    expect(prisma.certificateFolder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          name: {
            contains: 'complementares',
            mode: 'insensitive',
          },
        },
        skip: 5,
        take: 10,
      }),
    );
  });

  it('converts concurrent folder-name conflicts to ConflictException', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const prisma = createPrisma({
      certificateFolder: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(duplicateError),
      },
    });
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      {} as never,
    );

    await expect(service.createFolder({ name: ' Complementares ', emoji: '🏅' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('ignores nullable folder update fields instead of trimming them', async () => {
    const existingFolder = createFolder({
      name: 'Atividades complementares',
      emoji: '🏅',
    });
    const prisma = createPrisma({
      certificateFolder: {
        findFirst: jest.fn().mockResolvedValueOnce(existingFolder).mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue(existingFolder),
      },
    });
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      {} as never,
    );

    await expect(service.updateFolder('folder-1', { name: null, emoji: null } as never)).resolves.toEqual(
      expect.objectContaining({
        name: 'Atividades complementares',
        emoji: '🏅',
      }),
    );
    expect(prisma.certificateFolder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {},
      }),
    );
  });

  it('creates OTHER configs as manual standalone certificates scoped to a folder', async () => {
    const prisma = createPrisma({
      certificateTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
      certificateFolder: {
        findFirst: jest.fn().mockResolvedValue({ id: 'folder-1' }),
      },
      certificateConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createConfigRecord()),
      },
    });
    const targetsService = {
      assertIssuableTarget: jest.fn(),
    };
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      targetsService as never,
    );

    await expect(
      service.createConfig({
        name: 'Certificado avulso',
        scope: CertificateScope.OTHER,
        folderId: 'folder-1',
        certificateTemplateId: 'template-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'config-1',
        scope: CertificateScope.OTHER,
        folderId: 'folder-1',
        issuedTo: CertificateIssuedTo.OTHER,
      }),
    );

    expect(targetsService.assertIssuableTarget).not.toHaveBeenCalled();
    expect(prisma.certificateConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Certificado avulso',
          scope: CertificateScope.OTHER,
          majorEventId: null,
          eventGroupId: null,
          eventId: null,
          folderId: 'folder-1',
          issuedTo: CertificateIssuedTo.OTHER,
          shouldAutofillSecondPage: false,
        }),
      }),
    );
  });

  it('resets issuedTo and type label when moving a standalone config to an event target', async () => {
    const prisma = createPrisma({
      certificateTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
      certificateConfig: {
        findFirst: jest.fn().mockResolvedValueOnce(createConfigRecord()).mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue(
          createConfigRecord({
            scope: CertificateScope.EVENT,
            eventId: 'event-1',
            folderId: null,
            folder: null,
            issuedTo: CertificateIssuedTo.ATTENDEE,
            certificateTypeLabel: 'Participação',
          }),
        ),
      },
    });
    const targetsService = {
      assertIssuableTarget: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      targetsService as never,
    );

    await expect(
      service.updateConfig('config-1', {
        scope: CertificateScope.EVENT,
        eventId: 'event-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        scope: CertificateScope.EVENT,
        issuedTo: CertificateIssuedTo.ATTENDEE,
        certificateTypeLabel: 'Participação',
      }),
    );

    expect(prisma.certificateConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: CertificateScope.EVENT,
          majorEventId: null,
          eventGroupId: null,
          eventId: 'event-1',
          folderId: null,
          issuedTo: CertificateIssuedTo.ATTENDEE,
          certificateTypeLabel: 'Participação',
        }),
      }),
    );
  });

  it('clears stale event targets when moving an event config to a standalone folder', async () => {
    const prisma = createPrisma({
      certificateTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
      certificateFolder: {
        findFirst: jest.fn().mockResolvedValue({ id: 'folder-1' }),
      },
      certificateConfig: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(
            createConfigRecord({
              scope: CertificateScope.EVENT,
              majorEventId: 'stale-major-event',
              eventGroupId: 'stale-event-group',
              eventId: 'event-1',
              folderId: null,
              folder: null,
              issuedTo: CertificateIssuedTo.ATTENDEE,
              certificateTypeLabel: 'Participação',
              shouldAutofillSecondPage: true,
            }),
          )
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue(createConfigRecord()),
      },
    });
    const targetsService = {
      assertIssuableTarget: jest.fn(),
    };
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      targetsService as never,
    );

    await expect(
      service.updateConfig('config-1', {
        scope: CertificateScope.OTHER,
        folderId: 'folder-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        scope: CertificateScope.OTHER,
        folderId: 'folder-1',
      }),
    );

    expect(targetsService.assertIssuableTarget).not.toHaveBeenCalled();
    expect(prisma.certificateConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: CertificateScope.OTHER,
          majorEventId: null,
          eventGroupId: null,
          eventId: null,
          folderId: 'folder-1',
          issuedTo: CertificateIssuedTo.OTHER,
          shouldAutofillSecondPage: false,
        }),
      }),
    );
  });

  it('clears stale target ids when moving between event scopes', async () => {
    const prisma = createPrisma({
      certificateTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
      certificateConfig: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(
            createConfigRecord({
              scope: CertificateScope.MAJOR_EVENT,
              majorEventId: 'major-event-1',
              eventGroupId: 'stale-event-group',
              eventId: 'stale-event',
              folderId: null,
              folder: null,
              issuedTo: CertificateIssuedTo.ATTENDEE,
              certificateTypeLabel: 'Participação',
            }),
          )
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue(
          createConfigRecord({
            scope: CertificateScope.EVENT_GROUP,
            majorEventId: null,
            eventGroupId: 'event-group-1',
            eventId: null,
            folderId: null,
            folder: null,
            issuedTo: CertificateIssuedTo.ATTENDEE,
            certificateTypeLabel: 'Participação',
          }),
        ),
      },
    });
    const targetsService = {
      assertIssuableTarget: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      targetsService as never,
    );

    await expect(
      service.updateConfig('config-1', {
        scope: CertificateScope.EVENT_GROUP,
        eventGroupId: 'event-group-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        scope: CertificateScope.EVENT_GROUP,
        eventGroupId: 'event-group-1',
      }),
    );

    expect(targetsService.assertIssuableTarget).toHaveBeenCalledWith(
      CertificateScope.EVENT_GROUP,
      'event-group-1',
    );
    expect(prisma.certificateConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: CertificateScope.EVENT_GROUP,
          majorEventId: null,
          eventGroupId: 'event-group-1',
          eventId: null,
          folderId: null,
        }),
      }),
    );
  });

  it('restores second-page autofill default when leaving standalone scope without an explicit value', async () => {
    const prisma = createPrisma({
      certificateTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: 'template-1' }),
      },
      certificateConfig: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(
            createConfigRecord({
              scope: CertificateScope.OTHER,
              folderId: 'folder-1',
              shouldAutofillSecondPage: false,
              issuedTo: CertificateIssuedTo.OTHER,
            }),
          )
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue(
          createConfigRecord({
            scope: CertificateScope.EVENT,
            eventId: 'event-1',
            folderId: null,
            folder: null,
            shouldAutofillSecondPage: true,
            issuedTo: CertificateIssuedTo.ATTENDEE,
            certificateTypeLabel: 'Participação',
          }),
        ),
      },
    });
    const targetsService = {
      assertIssuableTarget: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      targetsService as never,
    );

    await service.updateConfig('config-1', {
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
    });

    expect(prisma.certificateConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: CertificateScope.EVENT,
          eventId: 'event-1',
          folderId: null,
          shouldAutofillSecondPage: true,
        }),
      }),
    );
  });

  it('clones certificate configs with selected reusable parts and a copied name', async () => {
    const source = createConfigRecord({
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
      folderId: null,
      folder: null,
      name: 'Certificado final',
      certificateText: 'Texto público',
      shouldAutofillSecondPage: false,
      secondPageText: 'Verso livre',
      isActive: false,
      issuedTo: CertificateIssuedTo.LECTURER,
      certificateTypeLabel: 'Palestrante',
      certificateFields: {
        cidade: 'Presidente Prudente',
      },
    });
    const prisma = createPrisma({
      certificateConfig: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(source)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue(
          createConfigRecord({
            ...source,
            id: 'config-copy',
            name: 'Certificado final (cópia)',
          }),
        ),
      },
    });
    const targetsService = {
      assertIssuableTarget: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      targetsService as never,
    );

    await expect(
      service.cloneConfig('config-1', {
        parts: {
          textContent: true,
          recipientData: true,
          activeState: true,
        },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'config-copy',
        name: 'Certificado final (cópia)',
      }),
    );

    expect(prisma.certificateConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Certificado final (cópia)',
          scope: CertificateScope.EVENT,
          eventId: 'event-1',
          certificateText: 'Texto público',
          shouldAutofillSecondPage: false,
          secondPageText: 'Verso livre',
          isActive: false,
          issuedTo: CertificateIssuedTo.LECTURER,
          certificateTypeLabel: 'Palestrante',
          certificateFields: {
            cidade: 'Presidente Prudente',
          },
        }),
      }),
    );
    expect(targetsService.assertIssuableTarget).toHaveBeenCalledWith(CertificateScope.EVENT, 'event-1');
  });

  it('resets optional clone parts but keeps recipient data when copying issued people', async () => {
    const source = createConfigRecord({
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
      folderId: null,
      folder: null,
      name: 'Certificado final',
      certificateText: 'Texto público',
      shouldAutofillSecondPage: false,
      secondPageText: 'Verso livre',
      isActive: false,
      issuedTo: CertificateIssuedTo.LECTURER,
      certificateTypeLabel: 'Palestrante',
      certificateFields: {
        cidade: 'Presidente Prudente',
      },
    });
    const prisma = createPrisma({
      certificateConfig: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(source)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue(
          createConfigRecord({
            ...source,
            id: 'config-copy',
            name: 'Certificado final (cópia)',
            certificateText: null,
            secondPageText: null,
            isActive: true,
          }),
        ),
      },
    });
    const targetsService = {
      assertIssuableTarget: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      targetsService as never,
    );

    await service.cloneConfig('config-1', {
      parts: {
        issuedPeople: true,
      },
    });

    expect(prisma.certificateConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          certificateText: null,
          shouldAutofillSecondPage: true,
          secondPageText: null,
          isActive: true,
          issuedTo: CertificateIssuedTo.LECTURER,
          certificateTypeLabel: 'Palestrante',
          certificateFields: {
            cidade: 'Presidente Prudente',
          },
        }),
      }),
    );
  });

  it('clones certificate configs to a selected destination target', async () => {
    const source = createConfigRecord({
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
      folderId: null,
      folder: null,
      name: 'Certificado final',
    });
    const prisma = createPrisma({
      certificateConfig: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(source)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue(
          createConfigRecord({
            ...source,
            id: 'config-copy',
            scope: CertificateScope.EVENT_GROUP,
            eventId: null,
            eventGroupId: 'event-group-2',
            name: 'Certificado final (cópia)',
          }),
        ),
      },
    });
    const targetsService = {
      assertIssuableTarget: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      targetsService as never,
    );

    await service.cloneConfig('config-1', {
      scope: CertificateScope.EVENT_GROUP,
      eventGroupId: 'event-group-2',
    });

    expect(targetsService.assertIssuableTarget).toHaveBeenCalledWith(
      CertificateScope.EVENT_GROUP,
      'event-group-2',
    );
    expect(prisma.certificateConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: CertificateScope.EVENT_GROUP,
          majorEventId: null,
          eventGroupId: 'event-group-2',
          eventId: null,
          folderId: null,
        }),
      }),
    );
  });

  it('clones configs to standalone folders with manual defaults when no reusable parts are selected', async () => {
    const source = createConfigRecord({
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
      folderId: null,
      folder: null,
      name: 'Certificado final',
      certificateText: 'Texto público',
      shouldAutofillSecondPage: false,
      secondPageText: 'Verso livre',
      isActive: false,
      issuedTo: CertificateIssuedTo.LECTURER,
      certificateTypeLabel: 'Palestrante',
      certificateFields: {
        cidade: 'Presidente Prudente',
      },
    });
    const prisma = createPrisma({
      certificateFolder: {
        findFirst: jest.fn().mockResolvedValue({ id: 'folder-1' }),
      },
      certificateConfig: {
        findFirst: jest.fn().mockResolvedValueOnce(source).mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue(
          createConfigRecord({
            id: 'config-copy',
            name: 'Certificado extra',
            scope: CertificateScope.OTHER,
            eventId: null,
            folderId: 'folder-1',
            folder: createFolder({ id: 'folder-1' }),
            certificateText: null,
            shouldAutofillSecondPage: false,
            secondPageText: null,
            isActive: true,
            issuedTo: CertificateIssuedTo.OTHER,
            certificateTypeLabel: 'Manual',
            certificateFields: null,
          }),
        ),
      },
    });
    const targetsService = {
      assertIssuableTarget: jest.fn(),
    };
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      targetsService as never,
    );

    await expect(
      service.cloneConfig('config-1', {
        name: ' Certificado extra ',
        scope: CertificateScope.OTHER,
        folderId: ' folder-1 ',
        parts: {},
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'config-copy',
        scope: CertificateScope.OTHER,
        issuedTo: CertificateIssuedTo.OTHER,
      }),
    );

    expect(targetsService.assertIssuableTarget).not.toHaveBeenCalled();
    expect(prisma.certificateFolder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'folder-1',
          deletedAt: null,
        },
      }),
    );
    expect(prisma.certificateConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Certificado extra',
          scope: CertificateScope.OTHER,
          majorEventId: null,
          eventGroupId: null,
          eventId: null,
          folderId: 'folder-1',
          certificateText: null,
          shouldAutofillSecondPage: false,
          secondPageText: null,
          isActive: true,
          issuedTo: CertificateIssuedTo.OTHER,
          certificateTypeLabel: 'Manual',
          certificateFields: Prisma.DbNull,
        }),
      }),
    );
  });

  it('builds the next available clone name when default copy names already exist', async () => {
    const source = createConfigRecord({
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
      folderId: null,
      folder: null,
      name: 'Certificado final',
    });
    const prisma = createPrisma({
      certificateConfig: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(source)
          .mockResolvedValueOnce({ id: 'duplicate-copy' })
          .mockResolvedValueOnce({ id: 'duplicate-copy-2' })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue(
          createConfigRecord({
            ...source,
            id: 'config-copy',
            name: 'Certificado final (cópia) 3',
          }),
        ),
      },
    });
    const targetsService = {
      assertIssuableTarget: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      targetsService as never,
    );

    await service.cloneConfig('config-1', null);

    expect(prisma.certificateConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Certificado final (cópia) 3',
        }),
      }),
    );
  });

  it('rejects mismatched folder targets for event-scoped configs', async () => {
    const service = new CertificateConfigsService(
      createPrisma() as never,
      new CertificateValidationService(),
      {} as never,
    );

    await expect(
      service.createConfig({
        name: 'Certificado',
        scope: CertificateScope.EVENT,
        eventId: 'event-1',
        folderId: 'folder-1',
        certificateTemplateId: 'template-1',
      }),
    ).rejects.toThrow('folderId is only supported for OTHER scope.');
  });

  it('soft-deletes a folder and its active standalone configs and certificates', async () => {
    const prisma = createPrisma({
      certificateFolder: {
        findFirst: jest.fn().mockResolvedValue(createFolder({ id: 'folder-1' })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(createFolder({ id: 'folder-1', deletedAt: new Date() })),
      },
      certificateConfig: {
        findMany: jest.fn().mockResolvedValue([{ id: 'config-1' }, { id: 'config-2' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      certificate: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    });
    const service = new CertificateConfigsService(
      prisma as never,
      new CertificateValidationService(),
      {} as never,
    );

    await expect(service.deleteFolder(' folder-1 ')).resolves.toEqual({
      deleted: true,
      id: 'folder-1',
    });

    expect(prisma.certificateFolder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'folder-1',
          deletedAt: null,
        },
      }),
    );
    expect(prisma.certificateConfig.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: {
            in: ['config-1', 'config-2'],
          },
          deletedAt: null,
        },
      }),
    );
    expect(prisma.certificate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          configId: {
            in: ['config-1', 'config-2'],
          },
          deletedAt: null,
        },
      }),
    );
  });
});

function createPrisma(overrides: {
  $transaction?: ReturnType<typeof basePrisma>['$transaction'];
  certificateTemplate?: Partial<ReturnType<typeof basePrisma>['certificateTemplate']>;
  certificateFolder?: Partial<ReturnType<typeof basePrisma>['certificateFolder']>;
  certificateConfig?: Partial<ReturnType<typeof basePrisma>['certificateConfig']>;
  certificate?: Partial<ReturnType<typeof basePrisma>['certificate']>;
} = {}) {
  const base = basePrisma();
  const prisma = {
    ...base,
    certificateTemplate: {
      ...base.certificateTemplate,
      ...overrides.certificateTemplate,
    },
    certificateFolder: {
      ...base.certificateFolder,
      ...overrides.certificateFolder,
    },
    certificateConfig: {
      ...base.certificateConfig,
      ...overrides.certificateConfig,
    },
    certificate: {
      ...base.certificate,
      ...overrides.certificate,
    },
  };
  prisma.$transaction =
    overrides.$transaction ?? jest.fn(async (operation: (tx: typeof prisma) => Promise<unknown>) => operation(prisma));
  return prisma;
}

function basePrisma() {
  return {
    $transaction: jest.fn(),
    certificateTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    certificateFolder: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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

function createFolder(overrides: Partial<ReturnType<typeof baseFolder>> = {}) {
  return {
    ...baseFolder(),
    ...overrides,
  };
}

function baseFolder() {
  return {
    id: 'folder-1',
    name: 'Atividades complementares',
    emoji: '🏅',
    createdAt: new Date('2026-06-01T12:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-06-02T12:00:00.000Z'),
    updatedById: null,
    deletedAt: null,
  };
}

function createConfigRecord(overrides: Partial<ReturnType<typeof baseConfigRecord>> = {}) {
  return {
    ...baseConfigRecord(),
    ...overrides,
  };
}

function baseConfigRecord() {
  const now = new Date('2026-06-03T12:00:00.000Z');
  return {
    id: 'config-1',
    name: 'Certificado avulso',
    scope: CertificateScope.OTHER,
    majorEventId: null,
    majorEvent: null,
    eventGroupId: null,
    eventGroup: null,
    eventId: null,
    event: null,
    folderId: 'folder-1',
    folder: createFolder(),
    certificateTemplateId: 'template-1',
    certificateTemplate: createTemplate(),
    certificateText: null,
    shouldAutofillSecondPage: false,
    secondPageText: null,
    isActive: true,
    issuedTo: CertificateIssuedTo.OTHER,
    certificateTypeLabel: 'Manual',
    certificateFields: null,
    createdAt: now,
    createdById: null,
    updatedAt: now,
    updatedById: null,
    deletedAt: null,
  };
}
