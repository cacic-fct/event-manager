import { CertificateScope } from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { buildConfigTargetWhere, mapCertificate } from '../../certificate/certificate.constants';
import { CurrentUserCertificatesResolver } from './resolver';

jest.mock('../../certificate/certificate.constants', () => ({
  CERTIFICATE_SELECT: { id: true, config: { select: { folder: true } } },
  buildConfigTargetWhere: jest.fn((scope: CertificateScope, targetId: string) => ({ scope, targetId })),
  mapCertificate: jest.fn((certificate: { id: string }) => ({ id: certificate.id })),
}));

describe('CurrentUserCertificatesResolver', () => {
  const user = { sub: 'user-1' };
  const context = { req: { user } };
  const certificate = { findMany: jest.fn(), findFirst: jest.fn() };
  const prisma = { certificate };
  const currentUserContext = {
    getAuthenticatedUser: jest.fn(),
    resolveCurrentUserContext: jest.fn(),
  };
  const validation = {
    assertSupportedScope: jest.fn(),
    normalizeRequiredId: jest.fn((_field: string, value: string) => value.trim()),
    normalizeOptionalId: jest.fn((value?: string) => value?.trim() || undefined),
  };
  const downloadService = { downloadCertificate: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    currentUserContext.getAuthenticatedUser.mockReturnValue(user);
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
  });

  it('returns privacy-safe empty collections when no local person is linked', async () => {
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: null });
    const subject = resolver();

    await expect(
      subject.currentUserCertificates(CertificateScope.EVENT, 'event-1', context as never),
    ).resolves.toEqual([]);
    await expect(subject.currentUserStandaloneCertificateFolders(context as never)).resolves.toEqual([]);

    expect(certificate.findMany).not.toHaveBeenCalled();
    expect(validation.assertSupportedScope).not.toHaveBeenCalled();
  });

  it('normalizes scope filters and pagination before mapping owned certificates', async () => {
    const records = [{ id: 'certificate-1' }, { id: 'certificate-2' }];
    certificate.findMany.mockResolvedValueOnce(records);

    await expect(
      resolver().currentUserCertificates(
        CertificateScope.EVENT,
        ' event-1 ',
        context as never,
        ' config-1 ',
        5,
        20,
      ),
    ).resolves.toEqual([{ id: 'certificate-1' }, { id: 'certificate-2' }]);

    expect(validation.assertSupportedScope).toHaveBeenCalledWith(CertificateScope.EVENT);
    expect(buildConfigTargetWhere).toHaveBeenCalledWith(CertificateScope.EVENT, 'event-1');
    expect(certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          personId: 'person-1',
          deletedAt: null,
          config: {
            deletedAt: null,
            scope: CertificateScope.EVENT,
            targetId: 'event-1',
            id: 'config-1',
          },
        },
        orderBy: { issuedAt: 'desc' },
        skip: 5,
        take: 20,
      }),
    );
    expect(mapCertificate).toHaveBeenCalledTimes(2);
  });

  it('groups standalone certificates by active folder and sorts folders for Brazilian Portuguese', async () => {
    certificate.findMany.mockResolvedValueOnce([
      { id: 'certificate-z', config: { folder: { id: 'folder-z', name: 'Zeta', emoji: '📁' } } },
      { id: 'certificate-a1', config: { folder: { id: 'folder-a', name: 'Álgebra', emoji: '📐' } } },
      { id: 'certificate-a2', config: { folder: { id: 'folder-a', name: 'Álgebra', emoji: '📐' } } },
      { id: 'certificate-orphan', config: { folder: null } },
    ]);

    await expect(resolver().currentUserStandaloneCertificateFolders(context as never)).resolves.toEqual([
      {
        id: 'folder-a',
        name: 'Álgebra',
        emoji: '📐',
        certificates: [{ id: 'certificate-a1' }, { id: 'certificate-a2' }],
      },
      {
        id: 'folder-z',
        name: 'Zeta',
        emoji: '📁',
        certificates: [{ id: 'certificate-z' }],
      },
    ]);
    expect(certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          personId: 'person-1',
          config: expect.objectContaining({ scope: CertificateScope.OTHER, isActive: true }),
        }),
      }),
    );
  });

  it('downloads only a certificate owned by the current person', async () => {
    const expected = { url: '/api/certificates/certificate-1.pdf', fileName: 'certificate.pdf' };
    certificate.findFirst.mockResolvedValueOnce({ id: 'certificate-1' });
    downloadService.downloadCertificate.mockResolvedValueOnce(expected);

    await expect(
      resolver().downloadCurrentUserCertificate(' certificate-1 ', context as never),
    ).resolves.toBe(expected);
    expect(certificate.findFirst).toHaveBeenCalledWith({
      where: { id: 'certificate-1', personId: 'person-1', deletedAt: null },
      select: { id: true },
    });
    expect(downloadService.downloadCertificate).toHaveBeenCalledWith('certificate-1');
  });

  it('does not reveal whether a certificate exists when the person or ownership record is missing', async () => {
    currentUserContext.resolveCurrentUserContext.mockResolvedValueOnce({ person: null });
    await expect(
      resolver().downloadCurrentUserCertificate(' certificate-secret ', context as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(certificate.findFirst).not.toHaveBeenCalled();

    currentUserContext.resolveCurrentUserContext.mockResolvedValueOnce({ person: { id: 'person-1' } });
    certificate.findFirst.mockResolvedValueOnce(null);
    await expect(
      resolver().downloadCurrentUserCertificate(' certificate-secret ', context as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(downloadService.downloadCertificate).not.toHaveBeenCalled();
  });

  it('propagates certificate validation and download failures', async () => {
    validation.assertSupportedScope.mockImplementationOnce(() => {
      throw new Error('Escopo inválido.');
    });
    await expect(
      resolver().currentUserCertificates('INVALID' as CertificateScope, 'target-1', context as never),
    ).rejects.toThrow('Escopo inválido.');

    certificate.findFirst.mockResolvedValueOnce({ id: 'certificate-1' });
    downloadService.downloadCertificate.mockRejectedValueOnce(new Error('Arquivo indisponível.'));
    await expect(
      resolver().downloadCurrentUserCertificate('certificate-1', context as never),
    ).rejects.toThrow('Arquivo indisponível.');
  });

  function resolver(): CurrentUserCertificatesResolver {
    return new CurrentUserCertificatesResolver(
      prisma as never,
      currentUserContext as never,
      validation as never,
      downloadService as never,
    );
  }
});
