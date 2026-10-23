import { jest as jestEsm } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { PassThrough, Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
const { jest } = import.meta;

jestEsm.unstable_mockModule('@bwip-js/node', () => ({
  toBuffer: jest.fn(),
}));

jestEsm.unstable_mockModule('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}));

jestEsm.unstable_mockModule('../shared/zip-archive', () => ({
  createZipArchive: jest.fn(),
}));

const { toBuffer } = await import('@bwip-js/node');
const { chromium } = await import('playwright');
const { CertificateDownloadService } = await import('./certificate-download.service');
const { createZipArchive } = await import('../shared/zip-archive');

describe('CertificateDownloadService', () => {
  const originalPublicAppOrigin = process.env.PUBLIC_APP_ORIGIN;

  beforeEach(() => {
    process.env.PUBLIC_APP_ORIGIN = 'https://eventos.example.test/app';
    jest.mocked(toBuffer).mockReset();
    jest.mocked(chromium.launch).mockReset();
    jest.mocked(createZipArchive).mockReset();
  });

  afterAll(() => {
    if (originalPublicAppOrigin === undefined) {
      delete process.env.PUBLIC_APP_ORIGIN;
    } else {
      process.env.PUBLIC_APP_ORIGIN = originalPublicAppOrigin;
    }
  });

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

  it('renders current database template defaults over stale issued data, with self-contained CSS and QR codes', async () => {
    const setContent = jest.fn().mockResolvedValue(undefined);
    const evaluate = jest.fn().mockResolvedValue(undefined);
    const pdf = jest.fn().mockResolvedValue(Buffer.from('pdf-content'));
    const close = jest.fn().mockResolvedValue(undefined);
    const pageClose = jest.fn().mockResolvedValue(undefined);
    jest.mocked(toBuffer).mockResolvedValue(Buffer.from('qr-code'));
    jest.mocked(chromium.launch).mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent,
        evaluate,
        pdf,
        close: pageClose,
      }),
      close,
    } as never);
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'certificate-1',
          renderedData: {
            templateData: {
              personName: '<Maria & João>',
              workload: 12,
              active: true,
            },
          },
          config: {
            certificateFields: {
              workload: 20,
              extra: ['field'],
            },
          },
          person: {
            name: 'Maria João',
          },
          certificateTemplate: {
            certificateFields: {
              personName: {
                label: 'Nome',
                type: 'string',
                required: true,
                default: '<Maria corrigida & Cia>',
              },
            },
            htmlTemplate:
              '<html><head></head><body>{{ personName }} {{ workload }} {{ active }} {{ missing }} <img src="{{ verificationQrCodeDataUrl }}"></body></html>',
            cssTemplate: '.seal { background: url("data:image/png;base64,c2VhbA=="); }',
          },
        }),
      },
    };
    const validation = {
      normalizeRequiredId: jest.fn((_field: string, value: string) => value.trim()),
    };
    const service = new CertificateDownloadService(prisma as never, validation as never);

    const result = await service.downloadCertificate(' certificate-1 ');

    expect(result).toEqual({
      fileName: 'maria-joao-certificate-1.pdf',
      mimeType: 'application/pdf',
      contentBase64: Buffer.from('pdf-content').toString('base64'),
    });
    expect(toBuffer).toHaveBeenCalledWith({
      bcid: 'qrcode',
      text: 'https://eventos.example.test/validar/certificate-1',
      scale: 3,
      includetext: false,
    });
    expect(setContent).toHaveBeenCalledWith(expect.stringContaining('&lt;Maria corrigida &amp; Cia&gt; 20 true'), {
      waitUntil: 'networkidle',
    });
    expect(setContent).toHaveBeenCalledWith(expect.stringContaining('data:image/png;base64,c2VhbA=='), {
      waitUntil: 'networkidle',
    });
    expect(setContent).toHaveBeenCalledWith(expect.stringContaining('data:image/png;base64,cXItY29kZQ=='), {
      waitUntil: 'networkidle',
    });
    expect(pdf).toHaveBeenCalledWith({
      format: 'A4',
      printBackground: true,
    });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(pageClose).toHaveBeenCalledTimes(1);
  });

  it('renders public certificates without CSS using the configured public app origin', async () => {
    const setContent = jest.fn().mockResolvedValue(undefined);
    const evaluate = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    const pageClose = jest.fn().mockResolvedValue(undefined);
    jest.mocked(toBuffer).mockResolvedValue(Buffer.from('qr-code'));
    jest.mocked(chromium.launch).mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent,
        evaluate,
        pdf: jest.fn().mockResolvedValue(Buffer.from('public-pdf')),
        close: pageClose,
      }),
      close,
    } as never);
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'certificate-2',
          renderedData: {
            templateData: null,
          },
          config: {
            certificateFields: null,
          },
          person: {
            name: '!!!',
          },
          certificateTemplate: {
            htmlTemplate:
              '<html><body><a href="{{ verificationUrl }}">{{ verificationUrlText }}</a> {{ missing }}</body></html>',
            cssTemplate: null,
          },
        }),
      },
    };
    const validation = {
      normalizeRequiredId: jest.fn((_field: string, value: string) => value.trim()),
    };
    const service = new CertificateDownloadService(prisma as never, validation as never);

    const result = await service.downloadPublicCertificate(' certificate-2 ');

    expect(result).toEqual({
      fileName: 'certificate-certificate-2.pdf',
      mimeType: 'application/pdf',
      contentBase64: Buffer.from('public-pdf').toString('base64'),
    });
    expect(prisma.certificate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'certificate-2',
          deletedAt: null,
          config: {
            deletedAt: null,
            isActive: true,
          },
        },
      }),
    );
    expect(toBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'https://eventos.example.test/validar/certificate-2' }),
    );
    expect(setContent).toHaveBeenCalledWith(
      '<html><body><a href="https://eventos.example.test/validar/certificate-2">eventos.example.test/validar/certificate-2</a> </body></html>',
      { waitUntil: 'networkidle' },
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(pageClose).toHaveBeenCalledTimes(1);
  });

  it('builds certificate archives with normalized filenames and metadata', async () => {
    const archiveStream = createArchive();
    const service = new CertificateDownloadService({} as never, {} as never);
    jest.mocked(createZipArchive).mockResolvedValue(archiveStream as never);
    const browser = { close: jest.fn().mockResolvedValue(undefined) };
    jest.mocked(chromium.launch).mockResolvedValue(browser as never);
    jest
      .spyOn(service as never, 'renderCertificateFile')
      .mockResolvedValueOnce({
        fileName: 'primeiro-certificado.pdf',
        content: Buffer.from('pdf-1'),
      })
      .mockResolvedValueOnce({
        fileName: 'segundo-certificado.pdf',
        content: Buffer.from('pdf-2'),
      });

    const archive = await service.createCertificatesArchive(
      ' João da Silva / CACiC ',
      archiveSources('certificate-1', 'certificate-2'),
    );
    expect(archive.fileName).toMatch(/^certificados-\d{4}-\d{2}-\d{2}-joao-da-silva-cacic\.zip$/);
    await archiveStream.completed;
    await Promise.resolve();
    expect(service['renderCertificateFile']).toHaveBeenNthCalledWith(1, 'certificate-1', false, browser);
    expect(service['renderCertificateFile']).toHaveBeenNthCalledWith(2, 'certificate-2', false, browser);
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(archiveStream.append).toHaveBeenNthCalledWith(1, Buffer.from('pdf-1'), { name: 'primeiro-certificado.pdf' });
    expect(archiveStream.append).toHaveBeenNthCalledWith(2, Buffer.from('pdf-2'), { name: 'segundo-certificado.pdf' });
    expect(archiveStream.append).toHaveBeenNthCalledWith(3, expect.any(Readable), { name: 'certificates.json' });
    expect(JSON.parse(archiveStream.manifest())).toEqual({
      format: 'cacic-certificates',
      schemaVersion: 2,
      generatedAt: expect.any(String),
      certificates: [
        {
          certificateId: 'certificate-1',
          issuedAt: expect.any(String),
          fileName: 'primeiro-certificado.pdf',
          sha256: createHash('sha256').update('pdf-1').digest('hex'),
        },
        {
          certificateId: 'certificate-2',
          issuedAt: expect.any(String),
          fileName: 'segundo-certificado.pdf',
          sha256: createHash('sha256').update('pdf-2').digest('hex'),
        },
      ],
    });
    const manifestSource = archiveStream.append.mock.calls[2][0] as Readable & { path: string };
    // Cleanup runs after finalization; wait for the detached task to release its archive slot.
    await waitUntil(() => service['activeArchives'] === 0);
    expect(existsSync(manifestSource.path)).toBe(false);
    expect(archiveStream.finalize).toHaveBeenCalledTimes(1);
  });

  it('waits for ZIP entry processing and cancels rendering on disconnect', async () => {
    const archiveStream = createArchive();
    archiveStream.append.mockImplementation(() => undefined);
    jest.mocked(createZipArchive).mockResolvedValue(archiveStream as never);
    const browser = { close: jest.fn().mockResolvedValue(undefined) };
    jest.mocked(chromium.launch).mockResolvedValue(browser as never);
    const service = new CertificateDownloadService({} as never, {} as never);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    const render = jest.spyOn(service as never, 'renderCertificateFile').mockResolvedValue({
      fileName: 'certificate.pdf',
      content: Buffer.alloc(1024),
    });
    const closed = new Promise<void>((resolve) => archiveStream.once('close', resolve));
    await service.createCertificatesArchive('Ana', archiveSources('first', 'second'));
    await waitUntil(() => render.mock.calls.length === 1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(archiveStream.append).toHaveBeenCalledTimes(1);
    archiveStream.destroy();
    await closed;
    await waitUntil(() => service['activeArchives'] === 0);
    expect(render).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalled();
    expect(service['activeArchives']).toBe(0);
  });

  it('rejects excess simultaneous archives without launching another browser', async () => {
    const archives = [createArchive(), createArchive()];
    for (const archive of archives) {
      archive.append.mockImplementation(() => undefined);
    }
    jest
      .mocked(createZipArchive)
      .mockResolvedValueOnce(archives[0] as never)
      .mockResolvedValueOnce(archives[1] as never);
    jest.mocked(chromium.launch).mockResolvedValue({ close: jest.fn().mockResolvedValue(undefined) } as never);
    const service = new CertificateDownloadService({} as never, {} as never);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    jest
      .spyOn(service as never, 'renderCertificateFile')
      .mockResolvedValue({ fileName: 'certificate.pdf', content: Buffer.from('pdf') });
    await service.createCertificatesArchive('Ana', archiveSources('first'));
    await service.createCertificatesArchive('Bia', archiveSources('second'));
    await expect(service.createCertificatesArchive('Caio', archiveSources('third'))).rejects.toThrow(
      'Certificate downloads are busy.',
    );
    await waitUntil(() => jest.mocked(chromium.launch).mock.calls.length === 2);
    expect(chromium.launch).toHaveBeenCalledTimes(2);
    for (const archive of archives) {
      archive.destroy();
    }
    await waitUntil(() => service['activeArchives'] === 0);
    expect(service['activeArchives']).toBe(0);
  });

  it('uses fallback archive names when the person name has no safe characters', async () => {
    const archiveStream = createArchive();
    const service = new CertificateDownloadService({} as never, {} as never);
    jest.mocked(createZipArchive).mockResolvedValue(archiveStream as never);
    jest.mocked(chromium.launch).mockResolvedValue({ close: jest.fn().mockResolvedValue(undefined) } as never);
    jest.spyOn(service as never, 'renderCertificateFile').mockResolvedValue({
      fileName: 'certificado.pdf',
      content: Buffer.from('pdf'),
    });

    const archive = await service.createCertificatesArchive(' !!! ', archiveSources('certificate-1'));
    expect(archive.fileName).toMatch(/^certificados-\d{4}-\d{2}-\d{2}-certificados\.zip$/);
    await archiveStream.completed;
    expect(archiveStream.append).toHaveBeenLastCalledWith(expect.any(Readable), { name: 'certificates.json' });
  });

  it('destroys the archive when rendering a certificate fails without emitting an unhandled error', async () => {
    const archiveStream = createArchive();
    const service = new CertificateDownloadService({} as never, {} as never);
    jest.mocked(createZipArchive).mockResolvedValue(archiveStream as never);
    jest.mocked(chromium.launch).mockResolvedValue({ close: jest.fn().mockResolvedValue(undefined) } as never);
    jest.spyOn(service as never, 'renderCertificateFile').mockRejectedValue(new Error('render failed'));

    const closed = new Promise<void>((resolve) => archiveStream.once('close', resolve));
    await service.createCertificatesArchive('Ana', archiveSources('certificate-1'));
    await closed;

    expect(archiveStream.destroyed).toBe(true);
    expect(archiveStream.finalize).not.toHaveBeenCalled();
  });

  it('closes every page rendered with a shared archive browser, including failed renders', async () => {
    const service = new CertificateDownloadService({} as never, {} as never);
    const successfulPage = {
      setContent: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const failingPage = {
      setContent: jest.fn().mockRejectedValue(new Error('page failed')),
      evaluate: jest.fn(),
      pdf: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const sharedBrowser = {
      newPage: jest.fn().mockResolvedValueOnce(successfulPage).mockResolvedValueOnce(failingPage),
      close: jest.fn(),
    };

    await expect(service['renderPdf']('<html></html>', sharedBrowser as never)).resolves.toEqual(Buffer.from('pdf'));
    await expect(service['renderPdf']('<html></html>', sharedBrowser as never)).rejects.toThrow(
      'Failed to render certificate PDF.',
    );

    expect(successfulPage.close).toHaveBeenCalledTimes(1);
    expect(failingPage.close).toHaveBeenCalledTimes(1);
    expect(sharedBrowser.close).not.toHaveBeenCalled();
  });

  it('contains archive browser cleanup failures in the detached task', async () => {
    const archiveStream = createArchive();
    const service = new CertificateDownloadService({} as never, {} as never);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
    jest.mocked(createZipArchive).mockResolvedValue(archiveStream as never);
    jest
      .mocked(chromium.launch)
      .mockResolvedValue({ close: jest.fn().mockRejectedValue(new Error('close failed')) } as never);
    jest.spyOn(service as never, 'renderCertificateFile').mockResolvedValue({
      fileName: 'certificado.pdf',
      content: Buffer.from('pdf'),
    });

    const closed = new Promise<void>((resolve) => archiveStream.once('close', resolve));
    await service.createCertificatesArchive('Ana', archiveSources('certificate-1'));
    await archiveStream.completed;
    await closed;

    expect(archiveStream.destroyed).toBe(true);
  });
});

function archiveSources(...ids: string[]) {
  return ids.map((id) => ({ id, issuedAt: new Date(Date.now() - 60000) }));
}

function createArchive() {
  const archive = new PassThrough();
  let complete!: () => void;
  const completed = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let manifest = '';
  return Object.assign(archive, {
    manifest: () => manifest,
    append: jest.fn().mockImplementation((content: unknown) => {
      if (content instanceof Readable) {
        void (async () => {
          for await (const chunk of content) {
            manifest += String(chunk);
          }
          archive.emit('entry');
        })();
      } else {
        queueMicrotask(() => archive.emit('entry'));
      }
    }),
    finalize: jest.fn().mockImplementation(async () => complete()),
    completed,
  });
}

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Archive task did not reach the expected state.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
