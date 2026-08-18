import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Dirent, existsSync, statSync } from 'node:fs';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { certificateTemplateMetadataSchema } from './certificate-template-metadata';
import type { CertificateTemplateMetadata } from './certificate-template-metadata';

const METADATA_FILE_NAME = 'certificate-template.json';

type NormalizedCertificateTemplateMetadata = Omit<
  CertificateTemplateMetadata,
  '$schema' | 'isActive' | 'certificateFields'
> & {
  isActive: boolean;
  certificateFields: NonNullable<CertificateTemplateMetadata['certificateFields']>;
};

type DiscoveredCertificateTemplate = NormalizedCertificateTemplateMetadata & {
  htmlTemplate: string;
  cssTemplate?: string;
  contentChecksum: string;
};

type TemplateSearchDocument = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

@Injectable()
export class CertificateTemplateRegistryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CertificateTemplateRegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesense: TypesenseSearchService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.synchronizeTemplates();
  }

  async synchronizeTemplates(): Promise<void> {
    const templatesRoot = this.resolveTemplatesRoot();
    const metadataPaths = await this.findMetadataFiles(templatesRoot);
    if (metadataPaths.length === 0) {
      throw new Error(`No ${METADATA_FILE_NAME} files were found below ${templatesRoot}.`);
    }

    const discoveredTemplates = await Promise.all(
      metadataPaths.map((metadataPath) => this.loadTemplate(metadataPath, templatesRoot)),
    );
    this.assertUniqueCatalog(discoveredTemplates);

    const searchDocuments = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('certificate-template-registry'))`);
      const synchronized: TemplateSearchDocument[] = [];
      for (const template of discoveredTemplates) {
        synchronized.push(await this.synchronizeTemplate(template, transaction));
      }
      synchronized.push(
        ...(await this.deactivateMissingTemplates(
          discoveredTemplates.map((template) => template.key),
          transaction,
        )),
      );
      await this.assertReferencedTemplatesWereMigrated(transaction);
      return synchronized;
    });

    for (const document of searchDocuments) {
      await this.typesense.upsertCertificateTemplate(document);
    }
    this.logger.log(`Registered ${discoveredTemplates.length} certificate templates from ${templatesRoot}.`);
  }

  private async synchronizeTemplate(
    template: DiscoveredCertificateTemplate,
    prisma: Prisma.TransactionClient,
  ): Promise<TemplateSearchDocument> {
    const existing = await prisma.certificateTemplate.findUnique({
      where: { registryKey: template.key },
      select: {
        id: true,
        registryKey: true,
        name: true,
        description: true,
        contentChecksum: true,
        isActive: true,
        deletedAt: true,
        certificateFields: true,
      },
    });

    const data = {
      registryKey: template.key,
      name: template.name,
      description: template.description ?? null,
      htmlTemplate: template.htmlTemplate,
      cssTemplate: template.cssTemplate ?? null,
      contentChecksum: template.contentChecksum,
      isActive: template.isActive,
      deletedAt: null,
      certificateFields: template.certificateFields as Prisma.InputJsonObject,
    } satisfies Prisma.CertificateTemplateUncheckedCreateInput;

    if (existing) {
      await this.removeMaterializedTemplateDefaults(existing.id, existing.certificateFields, prisma);
    }

    if (
      existing &&
      existing.registryKey === template.key &&
      existing.contentChecksum === template.contentChecksum &&
      existing.isActive === template.isActive &&
      existing.deletedAt === null
    ) {
      return existing;
    }

    const registered = existing
      ? await prisma.certificateTemplate.update({
          where: { id: existing.id },
          data,
          select: {
            id: true,
            name: true,
            description: true,
            isActive: true,
          },
        })
      : await prisma.certificateTemplate.create({
          data,
          select: {
            id: true,
            name: true,
            description: true,
            isActive: true,
          },
        });

    return registered;
  }

  private async removeMaterializedTemplateDefaults(
    templateId: string,
    certificateFields: Prisma.JsonValue | null,
    prisma: Prisma.TransactionClient,
  ): Promise<void> {
    if (!this.isRecord(certificateFields)) {
      return;
    }

    const defaults = Object.entries(certificateFields).flatMap(([key, definition]) => {
      if (!this.isRecord(definition) || definition['default'] === undefined) {
        return [];
      }
      return [[key, String(definition['default'])] as const];
    });
    if (defaults.length === 0) {
      return;
    }

    const configs = await prisma.certificateConfig.findMany({
      where: { certificateTemplateId: templateId },
      select: { id: true, certificateFields: true },
    });
    for (const config of configs) {
      if (!this.isRecord(config.certificateFields)) {
        continue;
      }
      const normalizedFields = { ...config.certificateFields };
      let changed = false;
      for (const [key, defaultValue] of defaults) {
        const value = normalizedFields[key];
        if (value !== undefined && value !== null && String(value) === defaultValue) {
          delete normalizedFields[key];
          changed = true;
        }
      }
      if (!changed) {
        continue;
      }
      await prisma.certificateConfig.update({
        where: { id: config.id },
        data: {
          certificateFields:
            Object.keys(normalizedFields).length > 0
              ? (normalizedFields as Prisma.InputJsonObject)
              : Prisma.DbNull,
        },
      });
    }
  }

  private async deactivateMissingTemplates(
    discoveredKeys: string[],
    prisma: Prisma.TransactionClient,
  ): Promise<TemplateSearchDocument[]> {
    const missingTemplates = await prisma.certificateTemplate.findMany({
      where: {
        isActive: true,
        registryKey: { notIn: discoveredKeys },
      },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
      },
    });
    if (missingTemplates.length === 0) {
      return [];
    }

    await prisma.certificateTemplate.updateMany({
      where: { id: { in: missingTemplates.map((template) => template.id) } },
      data: { isActive: false },
    });
    return missingTemplates.map((template) => ({ ...template, isActive: false }));
  }

  private async assertReferencedTemplatesWereMigrated(prisma: Prisma.TransactionClient): Promise<void> {
    const pendingTemplates = await prisma.certificateTemplate.findMany({
      where: {
        contentChecksum: 'pending-metadata',
        OR: [
          { certificateConfigs: { some: {} } },
          { certificates: { some: {} } },
        ],
      },
      select: { id: true, name: true },
    });
    if (pendingTemplates.length === 0) {
      return;
    }

    const names = pendingTemplates.map((template) => `${template.name} (${template.id})`).join(', ');
    throw new Error(
      `Referenced certificate templates are missing repository metadata: ${names}. ` +
        `Add an explicit migration mapping from each legacy row to a repository template before starting the backend.`,
    );
  }

  private async loadTemplate(metadataPath: string, templatesRoot: string): Promise<DiscoveredCertificateTemplate> {
    const templateDirectory = dirname(metadataPath);
    let rawMetadata: unknown;
    try {
      rawMetadata = JSON.parse(await readFile(metadataPath, 'utf8')) as unknown;
    } catch (error) {
      const parseError = new Error(`Could not parse certificate template metadata at ${metadataPath}.`) as Error & {
        cause?: unknown;
      };
      parseError.cause = error;
      throw parseError;
    }

    const metadata = this.parseMetadata(rawMetadata, metadataPath);
    const relativeDirectory = relative(templatesRoot, templateDirectory).split('\\').join('/');
    if (metadata.key !== relativeDirectory) {
      throw new Error(
        `Certificate template key "${metadata.key}" at ${metadataPath} must match its directory "${relativeDirectory}".`,
      );
    }
    const htmlPath = await this.resolveTemplateFile(templateDirectory, metadata.html, '.html', metadataPath);
    const cssPath = metadata.css
      ? await this.resolveTemplateFile(templateDirectory, metadata.css, '.css', metadataPath)
      : undefined;
    const htmlTemplate = await readFile(htmlPath, 'utf8');
    this.assertSafeHtml(htmlTemplate, htmlPath);
    const templateCss = cssPath
      ? await this.inlineCssAssets(await readFile(cssPath, 'utf8'), cssPath, await realpath(templateDirectory))
      : undefined;
    const bundledFontCss = await this.loadBundledFontCss(metadata.font);
    const cssTemplate =
      [bundledFontCss, templateCss].filter((value): value is string => Boolean(value)).join('\n\n') || undefined;
    const contentChecksum = createHash('sha256')
      .update(JSON.stringify(metadata))
      .update('\0')
      .update(htmlTemplate)
      .update('\0')
      .update(cssTemplate ?? '')
      .digest('hex');

    return { ...metadata, htmlTemplate, cssTemplate, contentChecksum };
  }

  private async loadBundledFontCss(font: CertificateTemplateMetadata['font']): Promise<string | undefined> {
    if (!font) {
      return undefined;
    }

    const fontAsset = 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2';
    const fontPath = this.resolveRuntimeAsset(fontAsset);
    const fontData = await readFile(fontPath);
    return [
      '@font-face {',
      "  font-family: 'Inter Variable';",
      '  font-style: normal;',
      '  font-weight: 100 900;',
      '  font-display: block;',
      `  src: url("data:font/woff2;base64,${fontData.toString('base64')}") format("woff2-variations");`,
      '}',
    ].join('\n');
  }

  private resolveRuntimeAsset(assetPath: string): string {
    for (const start of [process.cwd(), __dirname]) {
      let current = resolve(start);
      while (true) {
        const candidate = join(current, assetPath);
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return candidate;
        }
        const parent = dirname(current);
        if (parent === current) {
          break;
        }
        current = parent;
      }
    }

    throw new Error(`Required certificate template runtime asset was not found: ${assetPath}.`);
  }

  private parseMetadata(value: unknown, metadataPath: string): NormalizedCertificateTemplateMetadata {
    const result = certificateTemplateMetadataSchema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Certificate template metadata at ${metadataPath} does not match the schema: ${details}`);
    }

    return {
      key: result.data.key,
      name: result.data.name,
      description: result.data.description,
      html: result.data.html,
      css: result.data.css,
      font: result.data.font,
      isActive: result.data.isActive ?? true,
      certificateFields: result.data.certificateFields ?? {},
    };
  }

  private async resolveTemplateFile(
    templateDirectory: string,
    configuredPath: string,
    expectedExtension: string,
    metadataPath: string,
  ): Promise<string> {
    if (isAbsolute(configuredPath) || extname(configuredPath).toLowerCase() !== expectedExtension) {
      throw new Error(`Invalid ${expectedExtension} template path "${configuredPath}" at ${metadataPath}.`);
    }
    const resolvedPath = resolve(templateDirectory, configuredPath);
    this.assertContainedPath(templateDirectory, resolvedPath, metadataPath);
    if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
      throw new Error(`Certificate template file "${configuredPath}" from ${metadataPath} does not exist.`);
    }
    const [realTemplateDirectory, realResolvedPath] = await Promise.all([
      realpath(templateDirectory),
      realpath(resolvedPath),
    ]);
    this.assertContainedPath(realTemplateDirectory, realResolvedPath, metadataPath);
    return realResolvedPath;
  }

  private async inlineCssAssets(css: string, cssPath: string, templateDirectory: string): Promise<string> {
    const urlPattern = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^'")]+))\s*\)/g;
    let inlinedCss = '';
    let lastIndex = 0;

    for (const match of css.matchAll(urlPattern)) {
      const assetUrl = match[1] ?? match[2] ?? match[3]?.trim();
      if (!assetUrl || match.index === undefined) {
        continue;
      }
      if (/^(?:https?:|file:|about:|#)/i.test(assetUrl)) {
        throw new Error(`Remote or browser-local CSS asset "${assetUrl}" is not allowed in ${cssPath}.`);
      }

      inlinedCss += css.slice(lastIndex, match.index);
      if (/^data:/i.test(assetUrl)) {
        inlinedCss += `url("${assetUrl}")`;
      } else {
        const assetPath = resolve(dirname(cssPath), assetUrl);
        this.assertContainedPath(templateDirectory, assetPath, cssPath);
        const [realTemplateDirectory, realAssetPath] = await Promise.all([
          realpath(templateDirectory),
          realpath(assetPath),
        ]);
        this.assertContainedPath(realTemplateDirectory, realAssetPath, cssPath);
        const asset = await readFile(realAssetPath);
        inlinedCss += `url("data:${this.assetMimeType(realAssetPath)};base64,${asset.toString('base64')}")`;
      }
      lastIndex = match.index + match[0].length;
    }

    return inlinedCss + css.slice(lastIndex);
  }

  private assertSafeHtml(html: string, htmlPath: string): void {
    if (/<\s*(?:script|iframe|object|embed)\b/i.test(html)) {
      throw new Error(`Executable or embedded content is not allowed in certificate template ${htmlPath}.`);
    }
    if (/\b(?:src|href|poster|action)\s*=\s*["']https?:/i.test(html)) {
      throw new Error(`Remote static resources are not allowed in certificate template ${htmlPath}.`);
    }
    if (/\bstyle\s*=\s*["'][^"']*url\(\s*["']?https?:/i.test(html)) {
      throw new Error(`Remote inline CSS resources are not allowed in certificate template ${htmlPath}.`);
    }
  }

  private assertContainedPath(root: string, candidate: string, sourcePath: string): void {
    const relativePath = relative(root, candidate);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error(`Path ${candidate} from ${sourcePath} escapes its certificate template directory.`);
    }
  }

  private assertUniqueCatalog(templates: DiscoveredCertificateTemplate[]): void {
    const seen = new Set<string>();
    const names = new Map<string, string>();
    for (const template of templates) {
      if (seen.has(template.key)) {
        throw new Error(`Certificate template key "${template.key}" is registered more than once.`);
      }
      seen.add(template.key);
      const owner = names.get(template.name);
      if (owner && owner !== template.key) {
        throw new Error(`Certificate template name "${template.name}" is declared by ${owner} and ${template.key}.`);
      }
      names.set(template.name, template.key);
    }
  }

  private resolveTemplatesRoot(): string {
    const configuredRoot = process.env.CERTIFICATE_TEMPLATES_ROOT?.trim();
    if (configuredRoot) {
      const resolvedRoot = isAbsolute(configuredRoot) ? configuredRoot : resolve(process.cwd(), configuredRoot);
      if (existsSync(resolvedRoot) && statSync(resolvedRoot).isDirectory()) {
        return resolvedRoot;
      }
      throw new Error(`CERTIFICATE_TEMPLATES_ROOT does not point to a directory: ${resolvedRoot}.`);
    }

    for (const start of [process.cwd(), __dirname]) {
      let current = resolve(start);
      while (true) {
        const candidate = join(current, 'certificate-templates');
        if (existsSync(candidate) && statSync(candidate).isDirectory()) {
          return candidate;
        }
        const parent = dirname(current);
        if (parent === current) {
          break;
        }
        current = parent;
      }
    }

    throw new Error(
      'Could not locate certificate-templates. Set CERTIFICATE_TEMPLATES_ROOT or include the directory beside the backend runtime.',
    );
  }

  private async findMetadataFiles(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => this.findMetadataEntry(root, entry)));
    return nested.flat().sort();
  }

  private async findMetadataEntry(parent: string, entry: Dirent): Promise<string[]> {
    const entryPath = join(parent, entry.name);
    if (entry.isDirectory()) {
      return this.findMetadataFiles(entryPath);
    }
    return entry.isFile() && entry.name === METADATA_FILE_NAME ? [entryPath] : [];
  }

  private assetMimeType(assetPath: string): string {
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}
