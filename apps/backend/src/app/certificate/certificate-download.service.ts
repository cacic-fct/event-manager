import { CertificateDownload } from '@cacic-fct/shared-data-types';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { chromium, type Browser, type Page } from 'playwright';
import { Readable } from 'node:stream';
import { toBuffer } from '@bwip-js/node';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateValidationService } from './certificate-validation.service';
import { createZipArchive, type ZipArchiveStream } from '../shared/zip-archive';

type JsonRecord = Record<string, Prisma.JsonValue>;

type RenderedCertificate = {
  fileName: string;
  content: Buffer;
};

export type CertificateArchive = {
  fileName: string;
  stream: ZipArchiveStream;
};

@Injectable()
export class CertificateDownloadService {
  private activeArchives = 0;
  private readonly logger = new Logger(CertificateDownloadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CertificateValidationService,
  ) {}

  async downloadCertificate(certificateId: string): Promise<CertificateDownload> {
    return this.renderCertificate(certificateId, false);
  }

  async downloadPublicCertificate(certificateId: string): Promise<CertificateDownload> {
    return this.renderCertificate(certificateId, true);
  }

  private async renderCertificate(certificateId: string, publicOnly: boolean): Promise<CertificateDownload> {
    const certificate = await this.renderCertificateFile(certificateId, publicOnly);

    return {
      fileName: certificate.fileName,
      mimeType: 'application/pdf',
      contentBase64: certificate.content.toString('base64'),
    };
  }

  private async renderCertificateFile(
    certificateId: string,
    publicOnly: boolean,
    browser?: Browser,
  ): Promise<RenderedCertificate> {
    const normalizedCertificateId = this.validation.normalizeRequiredId('certificateId', certificateId);
    const certificate = await this.prisma.certificate.findFirst({
      where: {
        id: normalizedCertificateId,
        deletedAt: null,
        ...(publicOnly
          ? {
              config: {
                deletedAt: null,
                isActive: true,
              },
            }
          : {}),
      },
      select: {
        id: true,
        renderedData: true,
        config: {
          select: {
            certificateFields: true,
          },
        },
        person: {
          select: {
            name: true,
          },
        },
        certificateTemplate: {
          select: {
            htmlTemplate: true,
            cssTemplate: true,
            certificateFields: true,
          },
        },
      },
    });
    if (!certificate) {
      throw new NotFoundException(`Certificate ${normalizedCertificateId} was not found.`);
    }

    const verificationUrl = this.buildVerificationUrl(certificate.id);
    const templateVariables = await this.buildTemplateVariables(
      certificate.renderedData,
      certificate.certificateTemplate.certificateFields,
      certificate.config.certificateFields,
      verificationUrl,
      certificate.id,
    );
    const renderedHtml = this.renderTemplate(
      this.inlineCss(
        certificate.certificateTemplate.htmlTemplate,
        certificate.certificateTemplate.cssTemplate ?? undefined,
      ),
      templateVariables,
    );
    const pdf = await this.renderPdf(renderedHtml, browser);

    return {
      fileName: this.buildFileName(certificate.person.name, certificate.id),
      content: pdf,
    };
  }

  async createCertificatesArchive(
    personName: string,
    certificateIds: Iterable<string> | AsyncIterable<string>,
    metadata: unknown,
  ): Promise<CertificateArchive> {
    const safeName = this.normalizeFileNamePart(personName) || 'certificados';
    // Reject instead of building an unbounded queue of expensive rendering jobs.
    if (this.activeArchives >= 2) {
      throw new ServiceUnavailableException('Certificate downloads are busy. Please try again shortly.');
    }
    this.activeArchives++;
    let stream: ZipArchiveStream;
    try {
      stream = await createZipArchive();
    } catch (error) {
      this.activeArchives--;
      throw error;
    }
    stream.on('warning', (error) => this.logger.warn(error.message, error.stack));
    stream.on('error', (error) => this.logger.error(error.message, error.stack));
    void this.appendCertificatesToArchive(stream, safeName, certificateIds, metadata).catch((error: unknown) => {
      const archiveError = error instanceof Error ? error : new Error('Failed to create certificate archive.');
      this.logger.error('Detached certificate archive generation failed.', archiveError.stack);
      if (!stream.destroyed) {
        stream.destroy(archiveError);
      }
    }).finally(() => {
      this.activeArchives--;
    });

    return {
      fileName: `certificados-${new Date().toISOString().slice(0, 10)}-${safeName}.zip`,
      stream,
    };
  }

  private async appendCertificatesToArchive(
    archive: ZipArchiveStream,
    safeName: string,
    certificateIds: Iterable<string> | AsyncIterable<string>,
    metadata: unknown,
  ): Promise<void> {
    let browser: Browser | undefined;
    const cancel = () => {
      void browser?.close().catch(() => undefined);
    };
    archive.once('close', cancel);
    const deadline = setTimeout(() => archive.destroy(new Error('Certificate archive generation timed out.')), 30 * 60_000);
    deadline.unref();
    try {
      browser = await chromium.launch({ headless: true });
      for await (const certificateId of certificateIds) {
        if (archive.destroyed) {
          return;
        }

        const certificate = await this.renderCertificateFile(certificateId, false, browser);
        await this.appendArchiveEntry(archive, certificate.content, certificate.fileName);
      }

      if (!archive.destroyed) {
        await this.appendArchiveEntry(archive, metadata instanceof Readable ? metadata : `${JSON.stringify(metadata, null, 2)}\n`, `${safeName}_events.json`);
        await archive.finalize();
      }
    } catch (error) {
      archive.destroy(error instanceof Error ? error : new Error('Failed to create certificate archive.'));
    } finally {
      clearTimeout(deadline);
      archive.off('close', cancel);
      if (metadata instanceof Readable) {
        metadata.destroy();
      }
      if (browser) {
        try {
          await browser.close();
        } catch (error: unknown) {
          this.logger.error(
            'Could not close the certificate archive browser.',
            error instanceof Error ? error.stack : String(error),
          );
          if (!archive.destroyed) {
            const cleanupError = new Error('Certificate archive browser cleanup failed.');
            Object.defineProperty(cleanupError, 'cause', { value: error, configurable: true });
            archive.destroy(cleanupError);
          }
        }
      }
    }
  }

  private appendArchiveEntry(archive: ZipArchiveStream, content: Buffer | string | Readable, name: string): Promise<void> {
    // Wait until Archiver has processed this entry before rendering another PDF.
    // This propagates slow-reader backpressure instead of accumulating PDF buffers.
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        archive.off('entry', complete);
        archive.off('error', fail);
        archive.off('close', closed);
      };
      const complete = () => {
        cleanup();
        resolve();
      };
      const fail = (error: Error) => {
        cleanup();
        reject(error);
      };
      const closed = () => fail(new Error('Certificate archive download was interrupted.'));
      archive.once('entry', complete);
      archive.once('error', fail);
      archive.once('close', closed);
      if (archive.destroyed) {
        closed();
      } else {
        archive.append(content, { name });
      }
    });
  }

  private buildVerificationUrl(certificateId: string): string {
    const configuredOrigin = process.env.PUBLIC_APP_ORIGIN?.trim() || 'http://localhost:4200';
    return new URL(`/validar/${encodeURIComponent(certificateId)}`, new URL(configuredOrigin).origin).toString();
  }

  private async buildTemplateVariables(
    renderedData: Prisma.JsonValue,
    templateFields: Prisma.JsonValue | null,
    certificateFields: Prisma.JsonValue | null,
    verificationUrl: string,
    certificateId: string,
  ): Promise<Record<string, string>> {
    const renderedDataObject = this.asJsonRecord(renderedData, 'Certificate renderedData must be a JSON object.');
    const templateData = this.asOptionalJsonRecord(renderedDataObject.templateData);
    const variables: Record<string, string> = {};
    for (const [key, value] of Object.entries(templateData ?? {})) {
      variables[key] = this.stringifyJsonValue(value);
    }

    const templateFieldsObject = this.asOptionalJsonRecord(templateFields);
    for (const [key, rawDefinition] of Object.entries(templateFieldsObject ?? {})) {
      const definition = this.asOptionalJsonRecord(rawDefinition);
      if (definition?.default !== undefined && definition.default !== null) {
        variables[key] = this.stringifyJsonValue(definition.default);
      }
    }

    const certificateFieldsObject = this.asOptionalJsonRecord(certificateFields);
    for (const [key, value] of Object.entries(certificateFieldsObject ?? {})) {
      variables[key] = this.stringifyJsonValue(value);
    }

    const displayedVerificationUrl = verificationUrl.replace(/^https?:\/\//, '');
    variables.certificateID = certificateId;
    variables.verificationUrl = verificationUrl;
    variables.verificationUrlText = displayedVerificationUrl;
    variables.qrcode = verificationUrl;
    variables.url = verificationUrl;

    const qrCodePng = await toBuffer({
      bcid: 'qrcode',
      text: verificationUrl,
      scale: 3,
      includetext: false,
    });

    variables.verificationQrCodeDataUrl = `data:image/png;base64,${qrCodePng.toString('base64')}`;

    return variables;
  }

  private inlineCss(html: string, css?: string): string {
    if (!css) {
      return html;
    }

    const cssTag = `<style>${css}</style>`;
    if (html.includes('</head>')) {
      return html.replace('</head>', `${cssTag}</head>`);
    }

    return `${cssTag}${html}`;
  }

  private renderTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => this.escapeHtml(variables[key] ?? ''));
  }

  private async renderPdf(renderedHtml: string, sharedBrowser?: Browser): Promise<Buffer> {
    const browser = sharedBrowser ?? (await chromium.launch({ headless: true }));
    let page: Page | undefined;
    const timeout = setTimeout(() => {
      void (page ? page.close() : browser.close()).catch(() => undefined);
    }, 60_000);
    timeout.unref();
    try {
      page = await browser.newPage();
      await page.setContent(renderedHtml, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      return await page.pdf({
        format: 'A4',
        printBackground: true,
      });
    } catch {
      throw new InternalServerErrorException('Failed to render certificate PDF.');
    } finally {
      clearTimeout(timeout);
      if (page) {
        try {
          await page.close();
        } catch (error: unknown) {
          this.logger.warn(
            'Could not close a certificate rendering page.',
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
      if (!sharedBrowser) {
        try {
          await browser.close();
        } catch (error: unknown) {
          this.logger.warn(
            'Could not close the certificate rendering browser.',
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    }
  }

  private buildFileName(personName: string, certificateId: string): string {
    const safeName = this.normalizeFileNamePart(personName) || 'certificate';
    return `${safeName}-${certificateId}.pdf`;
  }

  private normalizeFileNamePart(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  private stringifyJsonValue(value: Prisma.JsonValue): string {
    if (value === null) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return JSON.stringify(value);
  }

  private asOptionalJsonRecord(value: Prisma.JsonValue | undefined): JsonRecord | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Template data must be a JSON object.');
    }

    return value as JsonRecord;
  }

  private asJsonRecord(value: Prisma.JsonValue, errorMessage: string): JsonRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BadRequestException(errorMessage);
    }

    return value as JsonRecord;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
