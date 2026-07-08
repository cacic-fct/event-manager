import { toBuffer } from '@bwip-js/node';
import { NotFoundException } from '@nestjs/common';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { CertificateDownloadService } from './certificate-download.service';

jest.mock('@bwip-js/node', () => ({
  toBuffer: jest.fn(),
}));

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}));

describe('CertificateDownloadService', () => {
  beforeEach(() => {
    jest.mocked(toBuffer).mockReset();
    jest.mocked(chromium.launch).mockReset();
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
    expect(setContent).toHaveBeenCalledWith(
      expect.stringContaining('&lt;Maria &amp; João&gt; 12 true'),
      { waitUntil: 'networkidle' },
    );
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
    expect(toBuffer).toHaveBeenCalledWith(expect.objectContaining({ text: 'https://eventos.example.test/validar/certificate-2' }));
    expect(setContent).toHaveBeenCalledWith(
      '<html><body>https://eventos.example.test/validar/certificate-2 </body></html>',
      { waitUntil: 'networkidle' },
    );
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('builds certificate archives with normalized filenames and metadata', async () => {
    const service = new CertificateDownloadService({} as never, {} as never);
    jest
      .spyOn(service, 'downloadCertificate')
      .mockResolvedValueOnce({
        fileName: 'primeiro-certificado.pdf',
        mimeType: 'application/pdf',
        contentBase64: Buffer.from('pdf-1').toString('base64'),
      })
      .mockResolvedValueOnce({
        fileName: 'segundo-certificado.pdf',
        mimeType: 'application/pdf',
        contentBase64: Buffer.from('pdf-2').toString('base64'),
      });

    const archive = await service.downloadCertificatesArchive(' João da Silva / CACiC ', ['certificate-1', 'certificate-2'], {
      events: [{ id: 'event-1', name: 'Evento' }],
    });
    const zip = Buffer.from(archive.contentBase64, 'base64');

    expect(archive.fileName).toBe('joao-da-silva-cacic_certificados.zip');
    expect(archive.mimeType).toBe('application/zip');
    expect(service.downloadCertificate).toHaveBeenNthCalledWith(1, 'certificate-1');
    expect(service.downloadCertificate).toHaveBeenNthCalledWith(2, 'certificate-2');
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.indexOf(Buffer.from('primeiro-certificado.pdf'))).toBeGreaterThan(-1);
    expect(zip.indexOf(Buffer.from('segundo-certificado.pdf'))).toBeGreaterThan(-1);
    expect(zip.indexOf(Buffer.from('pdf-1'))).toBeGreaterThan(-1);
    expect(zip.indexOf(Buffer.from('pdf-2'))).toBeGreaterThan(-1);
    expect(zip.indexOf(Buffer.from('joao-da-silva-cacic_events.json'))).toBeGreaterThan(-1);
    expect(zip.indexOf(Buffer.from('"name": "Evento"'))).toBeGreaterThan(-1);
    expect(zip.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toBeGreaterThan(-1);
  });

  it('uses fallback archive names when the person name has no safe characters', async () => {
    const service = new CertificateDownloadService({} as never, {} as never);
    jest.spyOn(service, 'downloadCertificate').mockResolvedValue({
      fileName: 'certificado.pdf',
      mimeType: 'application/pdf',
      contentBase64: Buffer.from('pdf').toString('base64'),
    });

    const archive = await service.downloadCertificatesArchive(' !!! ', ['certificate-1'], {});
    const zip = Buffer.from(archive.contentBase64, 'base64');

    expect(archive.fileName).toBe('certificados_certificados.zip');
    expect(zip.indexOf(Buffer.from('certificados_events.json'))).toBeGreaterThan(-1);
  });
});
