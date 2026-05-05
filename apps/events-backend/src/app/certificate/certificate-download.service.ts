import { CertificateDownload } from '@cacic-eventos/shared-data-types';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { chromium } from 'playwright';
import { toBuffer } from '@bwip-js/node';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateValidationService } from './certificate-validation.service';

type PlaywrightTemplateConfig = {
  engine: 'playwright';
  htmlTemplatePath: string;
  cssTemplatePath?: string;
  verificationUrlPattern?: string;
};

type JsonRecord = Record<string, Prisma.JsonValue>;

type TemplateFile = {
  content: string;
  path: string;
};

@Injectable()
export class CertificateDownloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CertificateValidationService,
  ) {}

  async downloadCertificate(
    certificateId: string,
  ): Promise<CertificateDownload> {
    const normalizedCertificateId = this.validation.normalizeRequiredId(
      'certificateId',
      certificateId,
    );
    const certificate = await this.prisma.certificate.findFirst({
      where: {
        id: normalizedCertificateId,
        deletedAt: null,
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
            template: true,
          },
        },
      },
    });
    if (!certificate) {
      throw new NotFoundException(
        `Certificate ${normalizedCertificateId} was not found.`,
      );
    }

    const templateConfig = this.parseTemplateConfig(
      certificate.certificateTemplate.template,
    );
    const verificationUrl = this.buildVerificationUrl(
      templateConfig.verificationUrlPattern,
      certificate.id,
    );
    const templateVariables = await this.buildTemplateVariables(
      certificate.renderedData,
      certificate.config.certificateFields,
      verificationUrl,
      certificate.id,
    );
    const htmlTemplate = await this.loadTemplateFile(
      templateConfig.htmlTemplatePath,
      'htmlTemplatePath',
    );
    const cssTemplate = templateConfig.cssTemplatePath
      ? await this.loadTemplateFile(
          templateConfig.cssTemplatePath,
          'cssTemplatePath',
        )
      : undefined;
    const cssContent = cssTemplate
      ? await this.inlineCssLocalAssets(cssTemplate.content, cssTemplate.path)
      : undefined;
    const renderedHtml = this.renderTemplate(
      this.inlineCss(htmlTemplate.content, cssContent),
      templateVariables,
    );
    const pdf = await this.renderPdf(renderedHtml);

    return {
      fileName: this.buildFileName(certificate.person.name, certificate.id),
      mimeType: 'application/pdf',
      contentBase64: pdf.toString('base64'),
    };
  }

  private parseTemplateConfig(
    template: Prisma.JsonValue,
  ): PlaywrightTemplateConfig {
    const templateObject = this.asJsonRecord(
      template,
      'Certificate template must be a JSON object.',
    );
    const engine = this.readRequiredString(templateObject, 'engine');
    if (engine !== 'playwright') {
      throw new BadRequestException(
        `Certificate template engine "${engine}" is not supported.`,
      );
    }

    return {
      engine: 'playwright',
      htmlTemplatePath: this.readRequiredString(
        templateObject,
        'htmlTemplatePath',
      ),
      cssTemplatePath: this.readOptionalString(
        templateObject,
        'cssTemplatePath',
      ),
      verificationUrlPattern: this.readOptionalString(
        templateObject,
        'verificationUrlPattern',
      ),
    };
  }

  private buildVerificationUrl(
    pattern: string | undefined,
    certificateId: string,
  ): string {
    const sourcePattern =
      pattern?.trim() || 'eventos.cacic.dev.br/app/validate/\n{certificateID}';
    if (sourcePattern.includes('{certificateID}')) {
      return sourcePattern.replace(/\{certificateID\}/g, certificateId);
    }

    return `${sourcePattern.replace(/\/+$/, '')}/${certificateId}`;
  }

  private async buildTemplateVariables(
    renderedData: Prisma.JsonValue,
    certificateFields: Prisma.JsonValue | null,
    verificationUrl: string,
    certificateId: string,
  ): Promise<Record<string, string>> {
    const renderedDataObject = this.asJsonRecord(
      renderedData,
      'Certificate renderedData must be a JSON object.',
    );
    const templateData = this.asOptionalJsonRecord(
      renderedDataObject.templateData,
    );
    const variables: Record<string, string> = {};
    for (const [key, value] of Object.entries(templateData ?? {})) {
      variables[key] = this.stringifyJsonValue(value);
    }

    const certificateFieldsObject =
      this.asOptionalJsonRecord(certificateFields);
    for (const [key, value] of Object.entries(certificateFieldsObject ?? {})) {
      variables[key] = this.stringifyJsonValue(value);
    }

    variables.certificateID = certificateId;
    variables.verificationUrl = verificationUrl;

    const qrCodePng = await toBuffer({
      bcid: 'qrcode',
      text: verificationUrl,
      scale: 3,
      includetext: false,
    });

    variables.verificationQrCodeDataUrl = `data:image/png;base64,${qrCodePng.toString('base64')}`;

    return variables;
  }

  private async loadTemplateFile(
    templatePath: string,
    configField: 'htmlTemplatePath' | 'cssTemplatePath',
  ): Promise<TemplateFile> {
    const resolvedPath = this.resolveTemplatePath(templatePath);
    try {
      return {
        content: await readFile(resolvedPath, 'utf8'),
        path: resolvedPath,
      };
    } catch {
      throw new NotFoundException(
        `Could not load ${configField} file "${templatePath}".`,
      );
    }
  }

  private resolveTemplatePath(templatePath: string): string {
    const candidates = isAbsolute(templatePath)
      ? [templatePath]
      : [
          resolve(process.cwd(), templatePath),
          resolve(__dirname, '../../../../..', templatePath),
          resolve(__dirname, '../../../../../..', templatePath),
        ];
    const existingPath = candidates.find((candidate) => existsSync(candidate));
    if (!existingPath) {
      throw new NotFoundException(
        `Template file "${templatePath}" was not found in expected paths.`,
      );
    }

    return existingPath;
  }

  private async inlineCssLocalAssets(
    css: string,
    cssPath: string,
  ): Promise<string> {
    const cssDirectory = dirname(cssPath);
    const urlPattern = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^'")]+))\s*\)/g;
    let inlinedCss = '';
    let lastIndex = 0;

    for (const match of css.matchAll(urlPattern)) {
      const assetUrl = match[1] ?? match[2] ?? match[3]?.trim();
      const matchIndex = match.index;
      if (!assetUrl || matchIndex === undefined) {
        continue;
      }

      inlinedCss += css.slice(lastIndex, matchIndex);
      inlinedCss += `url("${await this.resolveCssAssetUrl(
        assetUrl,
        cssDirectory,
      )}")`;
      lastIndex = matchIndex + match[0].length;
    }

    return inlinedCss + css.slice(lastIndex);
  }

  private async resolveCssAssetUrl(
    assetUrl: string,
    cssDirectory: string,
  ): Promise<string> {
    if (/^(?:data:|https?:|file:|about:|#)/i.test(assetUrl)) {
      return assetUrl;
    }

    const assetPath = isAbsolute(assetUrl)
      ? assetUrl
      : resolve(cssDirectory, assetUrl);
    try {
      const asset = await readFile(assetPath);
      const mimeType = this.getAssetMimeType(assetPath);
      return `data:${mimeType};base64,${asset.toString('base64')}`;
    } catch {
      throw new NotFoundException(
        `Could not load CSS asset "${assetUrl}" referenced by certificate template.`,
      );
    }
  }

  private getAssetMimeType(assetPath: string): string {
    switch (extname(assetPath).toLowerCase()) {
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.woff':
        return 'font/woff';
      case '.woff2':
        return 'font/woff2';
      default:
        return 'application/octet-stream';
    }
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

  private renderTemplate(
    template: string,
    variables: Record<string, string>,
  ): string {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) =>
      this.escapeHtml(variables[key] ?? ''),
    );
  }

  private async renderPdf(renderedHtml: string): Promise<Buffer> {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(renderedHtml, { waitUntil: 'networkidle' });
      return await page.pdf({
        format: 'A4',
        printBackground: true,
      });
    } catch {
      throw new InternalServerErrorException(
        'Failed to render certificate PDF.',
      );
    } finally {
      await browser.close();
    }
  }

  private buildFileName(personName: string, certificateId: string): string {
    const normalizedName = personName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    const safeName = normalizedName || 'certificate';
    return `${safeName}-${certificateId}.pdf`;
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

  private asOptionalJsonRecord(
    value: Prisma.JsonValue | undefined,
  ): JsonRecord | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('Template data must be a JSON object.');
    }

    return value as JsonRecord;
  }

  private asJsonRecord(
    value: Prisma.JsonValue,
    errorMessage: string,
  ): JsonRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BadRequestException(errorMessage);
    }

    return value as JsonRecord;
  }

  private readRequiredString(record: JsonRecord, key: string): string {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`Template field "${key}" is required.`);
    }

    return value;
  }

  private readOptionalString(
    record: JsonRecord,
    key: string,
  ): string | undefined {
    const value = record[key];
    if (value == null) {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(
        `Template field "${key}" must be a string.`,
      );
    }

    const normalized = value.trim();
    return normalized || undefined;
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
