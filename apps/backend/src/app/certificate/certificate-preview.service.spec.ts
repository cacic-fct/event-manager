import { CertificatePreviewService } from './certificate-preview.service';
import type { CertificatePreviewCache } from './certificate-preview-cache';
import type { PrismaService } from '../prisma/prisma.service';

const { jest } = import.meta;

describe('CertificatePreviewService', () => {
  function createService() {
    const prisma = { certificate: { findFirst: jest.fn() } };
    const cache = { enabled: true, read: jest.fn(), has: jest.fn() };
    return {
      prisma,
      cache,
      service: new CertificatePreviewService(
        prisma as unknown as PrismaService,
        cache as unknown as CertificatePreviewCache,
      ),
    };
  }

  beforeEach(() => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      CERTIFICATE_PREVIEW_ENABLED: 'true',
      CERTIFICATE_PREVIEW_SIGNING_KEY: 'test-preview-signing-key',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects tokens for another certificate and expired tokens before accessing Prisma or S3', async () => {
    const { service, prisma, cache } = createService();
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    const token = service.createToken({ id: 'certificate-1', issuedAt: new Date(now) }) ?? '';

    expect(token).not.toBe('');
    await expect(service.request('certificate-2', token)).resolves.toBeNull();
    clock.mockReturnValue(now + 11 * 60_000);
    await expect(service.read('certificate-1', token)).resolves.toBeNull();
    expect(prisma.certificate.findFirst).not.toHaveBeenCalled();
    expect(cache.read).not.toHaveBeenCalled();
  });

  it('checks visibility and issuance before serving even an already cached image', async () => {
    const { service, prisma, cache } = createService();
    const issuedAt = new Date(Date.now() - 1000);
    const id = 'certificate-1';
    const token = service.createToken({ id, issuedAt }) ?? '';
    const source = {
      issuedAt,
      updatedAt: issuedAt,
      config: { updatedAt: issuedAt },
      certificateTemplate: { id: 'template', updatedAt: issuedAt, contentChecksum: 'checksum' },
    };
    prisma.certificate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...source, issuedAt: new Date() })
      .mockResolvedValueOnce(source);
    const image = Buffer.from('image');
    cache.read.mockResolvedValue(image);

    await expect(service.read(id, token)).resolves.toBeNull();
    await expect(service.read(id, token)).resolves.toBeNull();
    await expect(service.read(id, token)).resolves.toBe(image);
    expect(cache.read).toHaveBeenCalledTimes(1);
    expect(prisma.certificate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id, revokedAt: null, deletedAt: null, lgpdDeletionRequestId: null }),
      }),
    );
  });
});
