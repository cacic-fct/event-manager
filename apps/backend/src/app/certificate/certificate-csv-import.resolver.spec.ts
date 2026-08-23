import { CertificateCsvImportResolver } from './certificate-csv-import.resolver';

describe('CertificateCsvImportResolver', () => {
  const person = {
    id: 'person-1',
    name: 'Ana',
    email: 'ana@example.com',
    secondaryEmails: [],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const createResolver = () => {
    const prisma = {
      people: {
        findMany: jest.fn().mockResolvedValue([person]),
      },
      certificate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const issuingService = {
      issueManualForPeopleWithResults: jest.fn().mockResolvedValue({
        certificates: [{ id: 'certificate-1' }],
        failedPersonIds: [],
      }),
    };
    const frozenResources = {
      assertCertificateConfigMutable: jest.fn().mockResolvedValue(undefined),
    };

    return {
      prisma,
      issuingService,
      frozenResources,
      resolver: new CertificateCsvImportResolver(prisma as never, issuingService as never, frozenResources as never),
    };
  };

  it('issues manual certificates for the matched CSV people and reports duplicate rows', async () => {
    const { frozenResources, issuingService, resolver } = createResolver();
    const user = { sub: 'issuer-1' };

    await expect(
      resolver.issueManualCertificatesFromCsv(
        {
          configId: 'config-1',
          csvContent: 'E-mail\nana@example.com\nana@example.com\nunknown@example.com',
          selectedHeader: 'E-mail',
        },
        { req: { user } } as never,
      ),
    ).resolves.toEqual({
      createdCount: 1,
      duplicateCount: 1,
      failedCount: 1,
      failedValues: ['unknown@example.com'],
      inferredMatchType: 'EMAIL',
      ambiguousValues: [],
    });

    expect(frozenResources.assertCertificateConfigMutable).toHaveBeenCalledWith('config-1', user, 'edit');
    expect(issuingService.issueManualForPeopleWithResults).toHaveBeenCalledWith(
      'config-1',
      ['person-1'],
      'issuer-1',
    );
  });

  it('returns ambiguous people for explicit resolution before issuing certificates', async () => {
    const { issuingService, prisma, resolver } = createResolver();
    prisma.people.findMany.mockResolvedValue([
      person,
      {
        ...person,
        id: 'person-2',
      },
    ]);

    await expect(
      resolver.issueManualCertificatesFromCsv(
        {
          configId: 'config-1',
          csvContent: 'Nome\nAna',
          selectedHeader: 'Nome',
        },
        {},
      ),
    ).resolves.toEqual({
      createdCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      failedValues: [],
      inferredMatchType: 'FULL_NAME',
      ambiguousValues: [
        {
          value: 'Ana',
          candidates: [
            { id: 'person-1', name: 'Ana' },
            { id: 'person-2', name: 'Ana' },
          ],
        },
      ],
    });

    expect(issuingService.issueManualForPeopleWithResults).not.toHaveBeenCalled();
  });

  it('reports row failures after earlier certificates commit so retries can skip successes', async () => {
    const { issuingService, resolver } = createResolver();
    issuingService.issueManualForPeopleWithResults.mockResolvedValue({
      certificates: [{ id: 'certificate-1' }],
      failedPersonIds: ['person-1'],
    });

    await expect(
      resolver.issueManualCertificatesFromCsv(
        {
          configId: 'config-1',
          csvContent: 'E-mail\nana@example.com',
          selectedHeader: 'E-mail',
        },
        {},
      ),
    ).resolves.toEqual(expect.objectContaining({ createdCount: 1, failedCount: 1, failedValues: ['ana@example.com'] }));
  });

  it('detects delimiters outside quoted commas and preserves multiline fields', () => {
    const { resolver } = createResolver();
    const parsed = (resolver as unknown as { parseCsv: (content: string) => { headers: string[]; rows: Record<string, string>[] } }).parseCsv(
      'Nome;E-mail\n"Last, First";ana@example.com\n"Linha\nquebrada";bruna@example.com',
    );

    expect(parsed.headers).toEqual(['Nome', 'E-mail']);
    expect(parsed.rows).toEqual([
      { Nome: 'Last, First', 'E-mail': 'ana@example.com' },
      { Nome: 'Linha\nquebrada', 'E-mail': 'bruna@example.com' },
    ]);
  });
});
