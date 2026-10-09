import { Readable } from 'node:stream';
import { CertificateScope } from '@cacic-fct/shared-data-types';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RATE_LIMIT_METADATA_KEY } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { CurrentUserCertificatesDownloadController } from './certificates-download.controller';

describe('CurrentUserCertificatesDownloadController', () => {
  it('rate limits expensive archive generation for each authenticated user', () => {
    const handler = CurrentUserCertificatesDownloadController.prototype.downloadArchive;

    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([RateLimitGuard]);
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, handler)).toEqual({
      policy: RATE_LIMIT_POLICIES.currentUserCertificateArchive,
      resources: [],
    });
  });

  it('returns a StreamableFile backed by the certificate archive stream', async () => {
    const archiveStream = Readable.from(['zip-content']);
    const prisma = {
      certificate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'certificate-1',
            issuedAt: new Date(Date.now() - 60_000),
            configId: 'config-1',
            renderedData: { events: [{ id: 'event-1' }] },
            config: {
              scope: CertificateScope.EVENT,
              majorEventId: null,
              eventGroupId: null,
              eventId: 'event-1',
              folderId: null,
              folder: null,
            },
          },
        ]),
      },
    };
    const currentUserContext = {
      requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1', name: 'João da Silva' }),
    };
    const downloadService = {
      createCertificatesArchive: jest.fn().mockResolvedValue({
        fileName: 'joao-da-silva_certificados.zip',
        stream: archiveStream,
      }),
    };
    const controller = new CurrentUserCertificatesDownloadController(
      prisma as never,
      currentUserContext as never,
      downloadService as never,
      {} as never,
    );
    const request = { user: { sub: 'user-1' } };

    const file = await controller.downloadArchive(request as never);

    expect(currentUserContext.requireCurrentPerson).toHaveBeenCalledWith({ req: request });
    const [, ids, manifest] = downloadService.createCertificatesArchive.mock.calls[0] as unknown as
      [string, AsyncIterable<string>, Readable];
    const certificateIds: string[] = [];
    for await (const id of ids) { certificateIds.push(id); }
    expect(certificateIds).toEqual(['certificate-1']);
    let manifestJson = '';
    for await (const chunk of manifest) { manifestJson += chunk; }
    expect(JSON.parse(manifestJson).certificates).toEqual([
      expect.objectContaining({ certificateId: 'certificate-1', eventIds: ['event-1'], targetId: 'event-1' }),
    ]);
    expect(prisma.certificate.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 50, orderBy: { id: 'asc' }, where: expect.objectContaining({ personId: 'person-1', deletedAt: null }),
    }));
    expect(file.getStream()).toBe(archiveStream);
    expect(file.getHeaders()).toEqual({
      type: 'application/zip',
      disposition: 'attachment; filename="joao-da-silva_certificados.zip"',
    });
  });
});
