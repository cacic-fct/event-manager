import { toBuffer } from '@bwip-js/node';
import { NotFoundException } from '@nestjs/common';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { chromium } from 'playwright';
import { CertificateDownloadService } from './certificate-download.service';
import { createZipArchive } from '../shared/zip-archive';

jest.mock('@bwip-js/node', () => ({
  toBuffer: jest.fn(),
}));

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}));

jest.mock('../shared/zip-archive', () => ({
  createZipArchive: jest.fn(),
}));

describe('CertificateDownloadService', () => {
  beforeEach(() => {
    jest.mocked(toBuffer).mockReset();
    jest.mocked(chromium.launch).mockReset();
    jest.mocked(createZipArchive).mockReset();
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

  it('renders configured certificates with template variables, inline CSS assets, and QR codes', async () => {
    const templateDirectory = await mkdtemp(join(tmpdir(), 'certificate-template-'));
    const htmlPath = join(templateDirectory, 'certificate.html');
    const cssPath = join(templateDirectory, 'certificate.css');
    const imagePath = join(templateDirectory, 'seal.png');
    await writeFile(
      htmlPath,
      '<html><head></head><body>{{ personName }} {{ workload }} {{ active }} {{ missing }} <img src="{{ verificationQrCodeDataUrl }}"></body></html>',
      'utf8',
    );
    await writeFile(cssPath, '.seal { background: url("./seal.png"); }', 'utf8');
    await writeFile(imagePath, Buffer.from('seal'));
    const setContent = jest.fn().mockResolvedValue(undefined);
    const pdf = jest.fn().mockResolvedValue(Buffer.from('pdf-content'));
    const close = jest.fn().mockResolvedValue(undefined);
    jest.mocked(toBuffer).mockResolvedValue(Buffer.from('qr-code'));
    jest.mocked(chromium.launch).mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent,
        pdf,
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
              extra: ['field'],
            },
          },
          person: {
            name: 'Maria João',
          },
          certificateTemplate: {
            template: {
              engine: 'playwright',
              htmlTemplatePath: htmlPath,
              cssTemplatePath: cssPath,
              verificationUrlPattern: 'https://eventos.example.test/validar/{certificateID}',
            },
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
    expect(setContent).toHaveBeenCalledWith(expect.stringContaining('&lt;Maria &amp; João&gt; 12 true'), {
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
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('renders public certificates without CSS and appends ids to custom verification URL bases', async () => {
    const templateDirectory = await mkdtemp(join(tmpdir(), 'certificate-template-'));
    const htmlPath = join(templateDirectory, 'certificate.html');
    await writeFile(htmlPath, '<html><body>{{ verificationUrl }} {{ missing }}</body></html>', 'utf8');
    const setContent = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    jest.mocked(toBuffer).mockResolvedValue(Buffer.from('qr-code'));
    jest.mocked(chromium.launch).mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        setContent,
        pdf: jest.fn().mockResolvedValue(Buffer.from('public-pdf')),
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
            template: {
              engine: 'playwright',
              htmlTemplatePath: htmlPath,
              verificationUrlPattern: 'https://eventos.example.test/validar///',
            },
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
      '<html><body>https://eventos.example.test/validar/certificate-2 </body></html>',
      { waitUntil: 'networkidle' },
    );
    expect(close).toHaveBeenCalledTimes(1);
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
      ['certificate-1', 'certificate-2'],
      {
        events: [{ id: 'event-1', name: 'Evento' }],
      },
    );
    expect(archive.fileName).toMatch(/^certificados-\d{4}-\d{2}-\d{2}-joao-da-silva-cacic\.zip$/);
    await archiveStream.completed;
    await Promise.resolve();
    expect(service['renderCertificateFile']).toHaveBeenNthCalledWith(1, 'certificate-1', false, browser);
    expect(service['renderCertificateFile']).toHaveBeenNthCalledWith(2, 'certificate-2', false, browser);
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(archiveStream.append).toHaveBeenNthCalledWith(1, Buffer.from('pdf-1'), { name: 'primeiro-certificado.pdf' });
    expect(archiveStream.append).toHaveBeenNthCalledWith(2, Buffer.from('pdf-2'), { name: 'segundo-certificado.pdf' });
    expect(archiveStream.append).toHaveBeenNthCalledWith(3, expect.stringContaining('"name": "Evento"'), {
      name: 'joao-da-silva-cacic_events.json',
    });
    expect(archiveStream.finalize).toHaveBeenCalledTimes(1);
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

    const archive = await service.createCertificatesArchive(' !!! ', ['certificate-1'], {});
    expect(archive.fileName).toMatch(/^certificados-\d{4}-\d{2}-\d{2}-certificados\.zip$/);
    await archiveStream.completed;
    expect(archiveStream.append).toHaveBeenLastCalledWith(expect.any(String), { name: 'certificados_events.json' });
  });

  it('destroys the archive when rendering a certificate fails without emitting an unhandled error', async () => {
    const archiveStream = createArchive();
    const service = new CertificateDownloadService({} as never, {} as never);
    jest.mocked(createZipArchive).mockResolvedValue(archiveStream as never);
    jest.mocked(chromium.launch).mockResolvedValue({ close: jest.fn().mockResolvedValue(undefined) } as never);
    jest.spyOn(service as never, 'renderCertificateFile').mockRejectedValue(new Error('render failed'));

    const closed = new Promise<void>((resolve) => archiveStream.once('close', resolve));
    await service.createCertificatesArchive('Ana', ['certificate-1'], {});
    await closed;

    expect(archiveStream.destroyed).toBe(true);
    expect(archiveStream.finalize).not.toHaveBeenCalled();
  });
});

function createArchive() {
  const archive = new PassThrough();
  let complete!: () => void;
  const completed = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return Object.assign(archive, {
    append: jest.fn(),
    finalize: jest.fn().mockImplementation(async () => complete()),
    completed,
  });
}
