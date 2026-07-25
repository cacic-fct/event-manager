import { Readable } from 'node:stream';
import { CertificateScope } from '@cacic-fct/shared-data-types';
import { CurrentUserCertificatesDownloadController } from './certificates-download.controller';

describe('CurrentUserCertificatesDownloadController', () => {
  it('returns a StreamableFile backed by the certificate archive stream', async () => {
    const archiveStream = Readable.from(['zip-content']);
    const prisma = {
      certificate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'certificate-1',
            issuedAt: new Date('2026-07-25T12:00:00.000Z'),
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
    );
    const request = { user: { sub: 'user-1' } };

    const file = await controller.downloadArchive(request as never);

    expect(currentUserContext.requireCurrentPerson).toHaveBeenCalledWith({ req: request });
    expect(downloadService.createCertificatesArchive).toHaveBeenCalledWith(
      'João da Silva',
      ['certificate-1'],
      expect.objectContaining({
        certificates: [
          expect.objectContaining({
            certificateId: 'certificate-1',
            eventIds: ['event-1'],
            targetId: 'event-1',
          }),
        ],
      }),
    );
    expect(file.getStream()).toBe(archiveStream);
    expect(file.getHeaders()).toEqual({
      type: 'application/zip',
      disposition: 'attachment; filename="joao-da-silva_certificados.zip"',
    });
  });
});
