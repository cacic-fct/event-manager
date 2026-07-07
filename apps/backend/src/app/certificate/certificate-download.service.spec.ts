import { NotFoundException } from '@nestjs/common';
import { CertificateDownloadService } from './certificate-download.service';

describe('CertificateDownloadService', () => {
  it('filters inactive or deleted configs from public downloads', async () => {
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const validation = {
      normalizeRequiredId: jest.fn((_field: string, value: string) => value.trim()),
    };
    const service = new CertificateDownloadService(prisma as never, validation as never);

    await expect(service.downloadPublicCertificate(' certificate-1 ')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.certificate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'certificate-1',
          deletedAt: null,
          config: {
            deletedAt: null,
            isActive: true,
          },
        },
      }),
    );
  });
});
