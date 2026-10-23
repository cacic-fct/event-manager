import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RATE_LIMIT_METADATA_KEY } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { CurrentUserCertificatesDownloadController } from './certificates-download.controller';
const { jest } = import.meta;

function setup() {
  const archiveStream = new Readable({
    read() {
      /* The renderer owns this stream. */
    },
  });
  const issuedAt = new Date(Date.now() - 60000);
  const prisma = {
    certificate: {
      findMany: jest.fn().mockResolvedValue([{ id: 'certificate-1', issuedAt }]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const context = { requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1', name: 'João da Silva' }) };
  const downloads = {
    createCertificatesArchive: jest.fn().mockResolvedValue({ fileName: 'certificados.zip', stream: archiveStream }),
  };
  const controller = new CurrentUserCertificatesDownloadController(
    prisma as never,
    context as never,
    downloads as never,
  );
  const request = { user: { sub: 'user-1' } };
  return { controller, prisma, context, downloads, archiveStream, issuedAt, request };
}

describe('CurrentUserCertificatesDownloadController', () => {
  it.each(['downloadArchive', 'downloadSelectedArchive'] as const)('rate limits %s by authenticated user', (method) => {
    const handler = CurrentUserCertificatesDownloadController.prototype[method];
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([RateLimitGuard]);
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, handler)).toEqual({
      policy: RATE_LIMIT_POLICIES.currentUserCertificateArchive,
      resources: [],
    });
  });

  it('streams selected owned certificates and passes their issuance data to the renderer', async () => {
    const { controller, prisma, context, downloads, archiveStream, issuedAt, request } = setup();
    const file = await controller.downloadSelectedArchive(request as never, {
      certificateIds: [' certificate-1 ', 'certificate-1'],
    });
    expect(context.requireCurrentPerson).toHaveBeenCalledWith({ req: request });
    expect(prisma.certificate.count).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        deletedAt: null,
        issuedAt: { lte: expect.any(Date) },
        id: { in: ['certificate-1'] },
      },
    });
    const [personName, entries, generatedAt] = downloads.createCertificatesArchive.mock.calls[0] as unknown as [
      string,
      AsyncIterable<{ id: string; issuedAt: Date }>,
      Date,
    ];
    const collected = [];
    for await (const entry of entries) collected.push(entry);
    expect(personName).toBe('João da Silva');
    expect(collected).toEqual([{ id: 'certificate-1', issuedAt }]);
    expect(generatedAt).toBeInstanceOf(Date);
    expect(prisma.certificate.findMany).toHaveBeenCalledWith({
      where: { personId: 'person-1', deletedAt: null, issuedAt: { lte: generatedAt }, id: { in: ['certificate-1'] } },
      select: { id: true, issuedAt: true },
      orderBy: { id: 'asc' },
      take: 50,
    });
    expect(file.getStream()).toBe(archiveStream);
    expect(file.getHeaders()).toEqual({
      type: 'application/zip',
      disposition: 'attachment; filename="certificados.zip"',
    });
  });

  it.each([
    undefined,
    {},
    { certificateIds: [] },
    { certificateIds: [''] },
    { certificateIds: [12] },
    { certificateIds: ['a'.repeat(129)] },
    { certificateIds: Array(10001).fill('certificate-1') },
  ])('rejects malformed or empty selection before querying or rendering', async (body) => {
    const { controller, prisma, downloads, request } = setup();
    await expect(controller.downloadSelectedArchive(request as never, body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.certificate.count).not.toHaveBeenCalled();
    expect(downloads.createCertificatesArchive).not.toHaveBeenCalled();
  });

  it('rejects the entire selection if one ID belongs to somebody else or is unavailable', async () => {
    const { controller, prisma, downloads, request } = setup();
    await expect(
      controller.downloadSelectedArchive(request as never, { certificateIds: ['certificate-1', 'private-or-deleted'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.certificate.findMany).not.toHaveBeenCalled();
    expect(downloads.createCertificatesArchive).not.toHaveBeenCalled();
  });

  it('uses bounded keyset pages and carries the selection through every page', async () => {
    const { controller, prisma, downloads, request, issuedAt } = setup();
    const records = Array.from({ length: 50 }, (_, index) => ({ id: `certificate-${index}`, issuedAt }));
    prisma.certificate.findMany.mockResolvedValueOnce(records).mockResolvedValueOnce([{ id: 'last', issuedAt }]);
    await controller.downloadArchive(request as never);
    const entries = downloads.createCertificatesArchive.mock.calls[0][1] as AsyncIterable<unknown>;
    const collected = [];
    for await (const entry of entries) collected.push(entry);
    expect(collected).toHaveLength(51);
    expect(prisma.certificate.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { gt: 'certificate-49' } }) }),
    );
  });

  it('cancels archive rendering on response disconnect', async () => {
    const { controller, archiveStream, request } = setup();
    const response = new Readable({
      read() {
        /* Event source only. */
      },
    });
    await controller.downloadArchive({ ...request, res: response } as never);
    response.emit('close');
    expect(archiveStream.destroyed).toBe(true);
    await new Promise(setImmediate);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('returns a privacy-safe not found error when no owned certificates exist', async () => {
    const { controller, prisma, downloads, request } = setup();
    prisma.certificate.findMany.mockResolvedValueOnce([]);
    await expect(controller.downloadArchive(request as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(downloads.createCertificatesArchive).not.toHaveBeenCalled();
  });
});
