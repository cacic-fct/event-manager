import { CertificateDownload } from '@cacic-fct/shared-data-types';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { chromium, type Browser } from 'playwright';
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
      this.inlineCss(certificate.certificateTemplate.htmlTemplate, certificate.certificateTemplate.cssTemplate ?? undefined),
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
    certificateIds: string[],
    metadata: unknown,
  ): Promise<CertificateArchive> {
    const safeName = this.normalizeFileNamePart(personName) || 'certificados';
    const stream = await createZipArchive();
    stream.on('warning', (error) => this.logger.warn(error.message, error.stack));
    stream.on('error', (error) => this.logger.error(error.message, error.stack));
    void this.appendCertificatesToArchive(stream, safeName, certificateIds, metadata);

    return {
      fileName: `certificados-${new Date().toISOString().slice(0, 10)}-${safeName}.zip`,
      stream,
    };
  }

  private async appendCertificatesToArchive(
    archive: ZipArchiveStream,
    safeName: string,
    certificateIds: readonly string[],
    metadata: unknown,
  ): Promise<void> {
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      for (const certificateId of certificateIds) {
        if (archive.destroyed) {
          return;
        }

        const certificate = await this.renderCertificateFile(certificateId, false, browser);
        archive.append(certificate.content, { name: certificate.fileName });
      }

      if (!archive.destroyed) {
        archive.append(`${JSON.stringify(metadata, null, 2)}\n`, { name: `${safeName}_events.json` });
        await archive.finalize();
      }
    } catch (error) {
      archive.destroy(error instanceof Error ? error : new Error('Failed to create certificate archive.'));
    } finally {
      await browser?.close();
    }
  }

  private buildVerificationUrl(certificateId: string): string {
    const configuredOrigin = process.env.PUBLIC_APP_ORIGIN?.trim() || 'http://localhost:4200';
    return new URL(`/app/validate/${encodeURIComponent(certificateId)}`, new URL(configuredOrigin).origin).toString();
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

    variables.certificateID = certificateId;
    variables.verificationUrl = verificationUrl;
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
    try {
      const page = await browser.newPage();
      await page.setContent(renderedHtml, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      return await page.pdf({
        format: 'A4',
        printBackground: true,
      });
    } catch {
      throw new InternalServerErrorException('Failed to render certificate PDF.');
    } finally {
      if (!sharedBrowser) {
        await browser.close();
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
