import {
  CertificateConfig,
  CertificateConfigCreateInput,
  CertificateConfigUpdateInput,
  CertificateIssuedTo,
  CertificateScope,
  CertificateTemplate,
} from '@cacic-eventos/shared-data-types';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CERTIFICATE_CONFIG_SELECT,
  CERTIFICATE_TEMPLATE_SELECT,
  buildConfigTargetWhere,
  mapCertificateConfig,
  mapCertificateTemplate,
} from './certificate.constants';
import { CertificateTargetsService } from './certificate-targets.service';
import { CertificateValidationService } from './certificate-validation.service';

@Injectable()
export class CertificateConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: CertificateValidationService,
    private readonly targetsService: CertificateTargetsService,
  ) {}

  async listTemplates(
    query?: string,
    includeInactive?: boolean,
    skip?: number,
    take?: number,
  ): Promise<CertificateTemplate[]> {
    const normalizedQuery = query?.trim();
    const templates = await this.prisma.certificateTemplate.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
        ...(normalizedQuery
          ? {
              name: {
                contains: normalizedQuery,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: CERTIFICATE_TEMPLATE_SELECT,
      orderBy: {
        name: 'asc',
      },
      skip,
      take,
    });

    return templates.map(mapCertificateTemplate);
  }

  async listConfigsByTarget(
    scope: CertificateScope,
    targetId: string,
    includeInactive = true,
    skip?: number,
    take?: number,
  ): Promise<CertificateConfig[]> {
    this.validation.assertSupportedScope(scope);
    const normalizedTargetId = this.validation.normalizeRequiredId(
      'targetId',
      targetId,
    );

    const configs = await this.prisma.certificateConfig.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
        ...buildConfigTargetWhere(scope, normalizedTargetId),
      },
      select: CERTIFICATE_CONFIG_SELECT,
      orderBy: {
        updatedAt: 'desc',
      },
      skip,
      take,
    });

    return configs.map(mapCertificateConfig);
  }

  async getConfigById(configId: string): Promise<CertificateConfig> {
    const normalizedConfigId = this.validation.normalizeRequiredId(
      'configId',
      configId,
    );
    const config = await this.prisma.certificateConfig.findFirst({
      where: {
        id: normalizedConfigId,
        deletedAt: null,
      },
      select: CERTIFICATE_CONFIG_SELECT,
    });

    if (!config) {
      throw new NotFoundException(
        `Certificate config ${normalizedConfigId} not found.`,
      );
    }

    return mapCertificateConfig(config);
  }

  async createConfig(
    input: CertificateConfigCreateInput,
  ): Promise<CertificateConfig> {
    const scope = input.scope;
    const majorEventId = this.validation.normalizeOptionalId(
      input.majorEventId,
    );
    const eventGroupId = this.validation.normalizeOptionalId(
      input.eventGroupId,
    );
    const eventId = this.validation.normalizeOptionalId(input.eventId);
    const name = this.validation.normalizeRequiredName(input.name);
    const templateId = this.validation.normalizeRequiredId(
      'certificateTemplateId',
      input.certificateTemplateId,
    );
    const certificateText = this.validation.normalizeOptionalText(
      input.certificateText,
    );
    const certificateFields = this.validation.normalizeCertificateFieldsJson(
      input.certificateFieldsJson,
    );
    const issuedTo = input.issuedTo ?? CertificateIssuedTo.ATTENDEE;

    this.validation.assertScopeTargetConsistency(scope, {
      majorEventId,
      eventGroupId,
      eventId,
    });
    const targetId = this.resolveTargetId(scope, {
      majorEventId,
      eventGroupId,
      eventId,
    });

    await this.ensureTemplateExists(templateId);
    await this.targetsService.assertIssuableTarget(scope, targetId);
    await this.ensureNoDuplicateName(scope, targetId, name);

    const createdConfig = await this.prisma.certificateConfig.create({
      data: {
        name,
        scope,
        majorEventId: majorEventId ?? null,
        eventGroupId: eventGroupId ?? null,
        eventId: eventId ?? null,
        certificateTemplateId: templateId,
        certificateText:
          certificateText === undefined ? undefined : certificateText,
        isActive: input.isActive ?? true,
        issuedTo,
        ...(certificateFields === undefined
          ? {}
          : certificateFields === null
            ? { certificateFields: Prisma.DbNull }
            : { certificateFields }),
      },
      select: CERTIFICATE_CONFIG_SELECT,
    });

    return mapCertificateConfig(createdConfig);
  }

  async updateConfig(
    configId: string,
    input: CertificateConfigUpdateInput,
  ): Promise<CertificateConfig> {
    const normalizedConfigId = this.validation.normalizeRequiredId(
      'configId',
      configId,
    );
    const existingConfig = await this.prisma.certificateConfig.findFirst({
      where: {
        id: normalizedConfigId,
        deletedAt: null,
      },
      select: CERTIFICATE_CONFIG_SELECT,
    });

    if (!existingConfig) {
      throw new NotFoundException(
        `Certificate config ${normalizedConfigId} not found.`,
      );
    }

    const mergedScope = input.scope ?? existingConfig.scope;
    const mergedMajorEventId =
      input.majorEventId === undefined
        ? existingConfig.majorEventId
        : (this.validation.normalizeOptionalId(input.majorEventId) ?? null);
    const mergedEventGroupId =
      input.eventGroupId === undefined
        ? existingConfig.eventGroupId
        : (this.validation.normalizeOptionalId(input.eventGroupId) ?? null);
    const mergedEventId =
      input.eventId === undefined
        ? existingConfig.eventId
        : (this.validation.normalizeOptionalId(input.eventId) ?? null);
    const mergedName =
      input.name === undefined
        ? existingConfig.name
        : this.validation.normalizeRequiredName(input.name);
    const mergedTemplateId =
      input.certificateTemplateId === undefined
        ? existingConfig.certificateTemplateId
        : this.validation.normalizeRequiredId(
            'certificateTemplateId',
            input.certificateTemplateId,
          );

    this.validation.assertScopeTargetConsistency(mergedScope, {
      majorEventId: mergedMajorEventId,
      eventGroupId: mergedEventGroupId,
      eventId: mergedEventId,
    });
    const mergedTargetId = this.resolveTargetId(mergedScope, {
      majorEventId: mergedMajorEventId,
      eventGroupId: mergedEventGroupId,
      eventId: mergedEventId,
    });

    await this.ensureTemplateExists(mergedTemplateId);
    await this.targetsService.assertIssuableTarget(mergedScope, mergedTargetId);
    await this.ensureNoDuplicateName(
      mergedScope,
      mergedTargetId,
      mergedName,
      normalizedConfigId,
    );

    const nextText =
      input.certificateText === undefined
        ? undefined
        : this.validation.normalizeOptionalText(input.certificateText);
    const nextCertificateFields =
      input.certificateFieldsJson === undefined
        ? undefined
        : this.validation.normalizeCertificateFieldsJson(
            input.certificateFieldsJson,
          );
    const nextIssuedTo = input.issuedTo;

    const shouldUpdateScopeOrTargets =
      input.scope !== undefined ||
      input.majorEventId !== undefined ||
      input.eventGroupId !== undefined ||
      input.eventId !== undefined;

    const data: Prisma.CertificateConfigUpdateInput = {
      ...(input.name === undefined ? {} : { name: mergedName }),
      ...(shouldUpdateScopeOrTargets
        ? {
            scope: mergedScope,
            majorEventId: mergedMajorEventId,
            eventGroupId: mergedEventGroupId,
            eventId: mergedEventId,
          }
        : {}),
      ...(input.certificateTemplateId === undefined
        ? {}
        : { certificateTemplateId: mergedTemplateId }),
      ...(nextText === undefined ? {} : { certificateText: nextText }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(nextIssuedTo === undefined ? {} : { issuedTo: nextIssuedTo }),
      ...(nextCertificateFields === undefined
        ? {}
        : nextCertificateFields === null
          ? { certificateFields: Prisma.DbNull }
          : { certificateFields: nextCertificateFields }),
    };

    if (Object.keys(data).length === 0) {
      return mapCertificateConfig(existingConfig);
    }

    const updatedConfig = await this.prisma.certificateConfig.update({
      where: {
        id: normalizedConfigId,
      },
      data,
      select: CERTIFICATE_CONFIG_SELECT,
    });

    return mapCertificateConfig(updatedConfig);
  }

  private async ensureTemplateExists(templateId: string): Promise<void> {
    const template = await this.prisma.certificateTemplate.findFirst({
      where: {
        id: templateId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!template) {
      throw new NotFoundException(
        `Certificate template ${templateId} not found.`,
      );
    }
  }

  private resolveTargetId(
    scope: CertificateScope,
    targets: {
      majorEventId?: string | null;
      eventGroupId?: string | null;
      eventId?: string | null;
    },
  ): string {
    if (scope === CertificateScope.MAJOR_EVENT && targets.majorEventId) {
      return targets.majorEventId;
    }

    if (scope === CertificateScope.EVENT_GROUP && targets.eventGroupId) {
      return targets.eventGroupId;
    }

    if (scope === CertificateScope.EVENT && targets.eventId) {
      return targets.eventId;
    }

    throw new BadRequestException(`Missing target id for scope ${scope}.`);
  }

  private async ensureNoDuplicateName(
    scope: CertificateScope,
    targetId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.certificateConfig.findFirst({
      where: {
        deletedAt: null,
        name: {
          equals: name,
          mode: 'insensitive',
        },
        ...buildConfigTargetWhere(scope, targetId),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      throw new ConflictException(
        `A certificate config named "${name}" already exists for this target.`,
      );
    }
  }
}
